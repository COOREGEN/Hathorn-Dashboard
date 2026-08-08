import { NextResponse } from "next/server";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { syncPeriod, getConnection, disconnect } from "@/lib/qbo";
import { db, uid } from "@/lib/db";
import { runGate } from "@/lib/gate";
import { rateLimit, RateLimited, LIMITS, UpstreamTimeout } from "@/lib/security";

/**
 * Pulls P&L and AR from QuickBooks into a period, leaving payroll alone.
 * Runs the gate afterward so the bookkeeper immediately sees whether the
 * QuickBooks side ties to the payroll register they uploaded.
 */
export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    rateLimit({ action: "qboSync", subject: s.userId, ...LIMITS.qboSync });
    const { clientId, year, month } = await jsonObject(req);
    const d = db();

    const entities: any[] = d.prepare("SELECT * FROM entities WHERE client_id=?").all(clientId);
    const byName = new Map(entities.map((e) => [e.name.toLowerCase(), e.id]));

    const result = await syncPeriod(clientId, year, month);

    let period: any = d.prepare("SELECT * FROM periods WHERE client_id=? AND year=? AND month=?")
      .get(clientId, year, month);
    if (period?.status === "PUBLISHED") {
      return NextResponse.json(
        { ok: false, error: "This period is published. Unpublish it before syncing." }, { status: 400 });
    }
    if (!period) {
      const pid = uid();
      d.prepare("INSERT INTO periods (id,client_id,year,month,status) VALUES (?,?,?,?,'AWAITING')")
        .run(pid, clientId, year, month);
      period = { id: pid };
    }
    const pid = period.id;

    // Replace only what QuickBooks owns. Payroll stays exactly as uploaded.
    const write = d.transaction(() => {
      d.prepare("DELETE FROM pl_lines WHERE period_id=?").run(pid);
      d.prepare("DELETE FROM ar_buckets WHERE period_id=?").run(pid);
      for (const l of result.plLines) {
        const eid = byName.get(l.entityName.toLowerCase());
        if (!eid) continue;
        d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
          .run(uid(), pid, eid, l.category, l.label, l.amount);
      }
      for (const b of result.arBuckets) {
        d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
          .run(uid(), pid, b.payer, b.b0_30, b.b31_60, b.b61_90, b.b90p);
      }
    });
    write();

    const gate = runGate(pid);
    if (!gate.pass) d.prepare("UPDATE periods SET status='GATED' WHERE id=?").run(pid);
    audit(s.userId, "QBO_SYNC", `${clientId} ${year}-${month} lines=${result.plLines.length}`);

    return NextResponse.json({
      ok: true, periodId: pid,
      pulled: { plLines: result.plLines.length, arRows: result.arBuckets.length },
      warnings: result.warnings, gate,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    if (e instanceof UpstreamTimeout) return NextResponse.json({ ok: false, error: e.message }, { status: 504 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const clientId = new URL(req.url).searchParams.get("clientId") || "";
    const c = getConnection(clientId);
    return NextResponse.json({
      connected: Boolean(c),
      realmId: c?.realm_id ?? null,
      lastSyncAt: c?.last_sync_at ?? null,
      lastSyncStatus: c?.last_sync_status ?? "",
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const { clientId } = await jsonObject(req);
    disconnect(clientId);
    audit(s.userId, "QBO_DISCONNECT", clientId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
