import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

function fail(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const b = await jsonObject(req);

    if (b.status && ["DONE", "DROPPED"].includes(b.status)) {
      // Closing records which period it closed in, so "resolved since last month"
      // can be shown rather than the item silently disappearing.
      db().prepare(
        "UPDATE action_items SET status=?, closed_period_id=?, closed_at=datetime('now') WHERE id=?",
      ).run(b.status, b.closedPeriodId || null, params.id);
      audit(s.userId, "ACTION_CLOSE", `${params.id} ${b.status}`);
      return NextResponse.json({ ok: true });
    }

    if (b.status === "OPEN") {
      db().prepare("UPDATE action_items SET status='OPEN', closed_period_id=NULL, closed_at=NULL WHERE id=?")
        .run(params.id);
    }
    const fields: [string, string][] = [
      ["title", "title"], ["detail", "detail"], ["owner", "owner"], ["due", "due"],
    ];
    for (const [k, col] of fields) {
      if (b[k] !== undefined) db().prepare(`UPDATE action_items SET ${col}=? WHERE id=?`).run(b[k], params.id);
    }
    if (b.impact !== undefined) {
      db().prepare("UPDATE action_items SET impact=? WHERE id=?").run(Number(b.impact) || 0, params.id);
    }
    audit(s.userId, "ACTION_UPDATE", params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) { return fail(e); }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    db().prepare("DELETE FROM action_items WHERE id=?").run(params.id);
    audit(s.userId, "ACTION_DELETE", params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) { return fail(e); }
}
