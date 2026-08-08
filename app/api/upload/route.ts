import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { runGate } from "@/lib/gate";
import { assertEditable } from "@/lib/release";
import { ValidationError, period as validPeriod } from "@/lib/validate";
import {
  detect, applyMapping, saveMapping, parseAmount, splitCsvLine,
  NUMERIC_FIELDS, type DocType,
} from "@/lib/import";

/** Exact-header fallback for the original four-file close format. */
function parseExactCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const num = (v: string) => parseAmount(v) ?? 0;

/**
 * Prefer detected column mapping (and remember it per client); fall back to exact headers.
 * Normalises common aliases so payroll hoursPaid → hours, otPremium → ot_premium, etc.
 */
function rowsFor(text: string, clientId: string, hint: DocType): Record<string, string>[] {
  const d = detect(text);
  if (d.docType !== "UNKNOWN" && (d.docType === hint || hint === "UNKNOWN") && Object.keys(d.columnMap).length) {
    saveMapping(clientId, d.docType, {
      sourceLabel: d.sourceLabel,
      headerRow: d.headerRow,
      columnMap: d.columnMap,
    });
    const { rows } = applyMapping(text, {
      headerRow: d.headerRow,
      columnMap: d.columnMap,
      wideFormat: d.wideFormat,
      entityColumns: d.entityColumns,
    }, NUMERIC_FIELDS[d.docType] || []);
    return rows.map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        const key = k === "hoursPaid" ? "hours"
          : k === "otPremium" ? "ot_premium"
          : k === "workersComp" ? "workers_comp"
          : k;
        out[key] = v == null ? "" : String(v);
      }
      return out;
    });
  }
  return parseExactCsv(text);
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "BOOKKEEPER");
    rateLimit({ action: "upload", subject: s.userId, ...LIMITS.upload });
    const fd = await req.formData();
    const clientId = String(fd.get("clientId"));
    // A month of 13 used to create a phantom period no calendar view could reach.
    const { year, month } = validPeriod(fd.get("year"), fd.get("month"));

    const hintFor: Record<string, DocType> = {
      pnl: "PNL", payroll: "PAYROLL", ar: "AR", cash: "CASH", balance: "BALANCE",
    };
    const read = async (k: string) => {
      const f = fd.get(k) as File | null;
      if (!f) return [];
      return rowsFor(await f.text(), clientId, hintFor[k] || "UNKNOWN");
    };

    const d = db();
    // The lock is the boundary, checked here as well as by status — a period can be
    // locked by a release even if a status column drifts.
    const entities: any[] = d.prepare("SELECT * FROM entities WHERE client_id=?").all(clientId);
    const entByName = new Map(entities.map((e) => [e.name.toLowerCase(), e.id]));
    const resolveEntity = (name: string) => {
      const id = entByName.get(String(name).toLowerCase().trim());
      if (!id) throw new Error(`Unknown entity "${name}" — must match the client's configured entities exactly`);
      return id;
    };

    // upsert period
    let period: any = d.prepare("SELECT * FROM periods WHERE client_id=? AND year=? AND month=?").get(clientId, year, month);
    if (!period) {
      const pid = uid();
      d.prepare("INSERT INTO periods (id, client_id, year, month, status) VALUES (?,?,?,?, 'AWAITING')").run(pid, clientId, year, month);
      period = { id: pid };
    } else {
      try { assertEditable(period.id); }
      catch (e: any) {
        return NextResponse.json({ pass: false, checks: [], error: e.message }, { status: 400 });
      }
      d.prepare("UPDATE periods SET status='AWAITING' WHERE id=?").run(period.id);
    }
    const pid = period.id;

    // replace period data wholesale — an upload IS the close, atomically
    const replace = d.transaction(() => {
      for (const t of ["pl_lines", "payroll_lines", "ar_buckets"])
        d.prepare(`DELETE FROM ${t} WHERE period_id=?`).run(pid);
      d.prepare("DELETE FROM cash_balances WHERE period_id=?").run(pid);
    });
    replace();

    const pnl = await read("pnl");
    for (const r of pnl) {
      const cat = String(r.category || "").toUpperCase();
      if (!["REVENUE", "DIRECT_COST", "OPEX"].includes(cat))
        throw new Error(`P&L: invalid category "${r.category}" (use REVENUE, DIRECT_COST, or OPEX)`);
      d.prepare("INSERT INTO pl_lines (id, period_id, entity_id, category, label, amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, resolveEntity(r.entity), cat, r.label || cat, num(r.amount));
    }

    for (const r of await read("payroll")) {
      d.prepare(`INSERT INTO payroll_lines (id, period_id, entity_id, wages, ot_premium, taxes, workers_comp, processing, hours_paid)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uid(), pid, resolveEntity(r.entity), num(r.wages), num(r.ot_premium), num(r.taxes),
          num(r.workers_comp), num(r.processing), num(r.hours));
    }

    for (const r of await read("ar")) {
      d.prepare("INSERT INTO ar_buckets (id, period_id, payer, b0_30, b31_60, b61_90, b90p) VALUES (?,?,?,?,?,?,?)")
        .run(uid(), pid, r.payer, num(r.b0_30), num(r.b31_60), num(r.b61_90), num(r.b90p));
    }

    const cashRows = await read("cash");
    if (cashRows.length) {
      d.prepare("INSERT INTO cash_balances (id, period_id, operating, reserve) VALUES (?,?,?,?)")
        .run(uid(), pid, num(cashRows[0].operating), num(cashRows[0].reserve));
      // Monthly debt service drives the coverage ratio a lender would ask about.
      if (cashRows[0].debt_service !== undefined) {
        d.prepare("UPDATE periods SET debt_service_monthly=? WHERE id=?")
          .run(num(cashRows[0].debt_service), pid);
      }
    }

    // ---- Balance sheet (optional) ----
    const balanceRows = await read("balance");
    if (balanceRows.length) {
      d.prepare("DELETE FROM balance_lines WHERE period_id=?").run(pid);
      const SECTIONS = ["CURRENT_ASSET", "FIXED_ASSET", "CURRENT_LIABILITY", "LONG_TERM_LIABILITY", "EQUITY"];
      balanceRows.forEach((r, i) => {
        const section = String(r.section || "").toUpperCase();
        if (!SECTIONS.includes(section)) {
          throw new Error(`balance.csv: unknown section "${r.section}". Use one of ${SECTIONS.join(", ")}.`);
        }
        d.prepare("INSERT INTO balance_lines (id, period_id, section, label, amount, sort) VALUES (?,?,?,?,?,?)")
          .run(uid(), pid, section, r.label || section, num(r.amount), i);
      });
    }

    // ---- Volume (optional) ----
    // Units of activity, whatever a unit means for this vertical: hours, nights,
    // enrolled children, jobs. Capacity is optional and drives utilisation.
    const volumeRows = await read("volume");
    if (volumeRows.length) {
      d.prepare("DELETE FROM volume_lines WHERE period_id=?").run(pid);
      for (const r of volumeRows) {
        const eid = resolveEntity(r.entity);
        d.prepare(`INSERT INTO volume_lines (id, period_id, entity_id, units_sold, units_available, note)
          VALUES (?,?,?,?,?,?)`)
          .run(uid(), pid, eid, num(r.units_sold ?? r.units ?? 0),
            r.units_available ? num(r.units_available) : null, String(r.note || ""));
      }
    }

    // ---- Pass-through (optional; property management) ----
    // Without this, gross bookings would be reported as revenue and overstate a
    // management company by roughly five times.
    const passRows = await read("passthrough");
    if (passRows.length) {
      d.prepare("DELETE FROM passthrough_lines WHERE period_id=?").run(pid);
      const KINDS = ["SALES_TAX", "OCCUPANCY_TAX", "OWNER_DISBURSEMENT", "RESERVE", "OTHER"];
      for (const r of passRows) {
        const kind = String(r.kind || "").toUpperCase();
        if (!KINDS.includes(kind)) {
          throw new Error(`passthrough.csv: unknown kind "${r.kind}". Use one of ${KINDS.join(", ")}.`);
        }
        d.prepare("INSERT INTO passthrough_lines (id,period_id,entity_id,kind,label,amount) VALUES (?,?,?,?,?,?)")
          .run(uid(), pid, r.entity ? resolveEntity(r.entity) : null, kind,
            String(r.label || kind), num(r.amount));
      }
      if (passRows[0]?.gross_bookings !== undefined) {
        d.prepare("UPDATE periods SET gross_bookings=? WHERE id=?")
          .run(num(passRows[0].gross_bookings), pid);
      }
    }

    // ---- Fee recovery (optional) ----
    const feeRows = await read("fees");
    if (feeRows.length) {
      d.prepare("DELETE FROM fee_lines WHERE period_id=?").run(pid);
      for (const r of feeRows) {
        d.prepare(`INSERT INTO fee_lines (id,period_id,entity_id,fee_type,billed,collected,cost,note)
          VALUES (?,?,?,?,?,?,?,?)`)
          .run(uid(), pid, r.entity ? resolveEntity(r.entity) : null,
            String(r.fee_type || "OTHER").toUpperCase(), num(r.billed), num(r.collected),
            num(r.cost), String(r.note || ""));
      }
    }

    // ---- Channel mix (optional) ----
    const chanRows = await read("channels");
    if (chanRows.length) {
      d.prepare("DELETE FROM channel_lines WHERE period_id=?").run(pid);
      for (const r of chanRows) {
        d.prepare(`INSERT INTO channel_lines (id,period_id,entity_id,channel,gross_bookings,channel_fees,nights)
          VALUES (?,?,?,?,?,?,?)`)
          .run(uid(), pid, r.entity ? resolveEntity(r.entity) : null,
            String(r.channel || "Unknown"), num(r.gross_bookings), num(r.channel_fees),
            r.nights ? num(r.nights) : null);
      }
    }

    // ---- Budget (optional; keyed by year/month, not period) ----
    const budgetRows = await read("budget");
    if (budgetRows.length) {
      d.prepare("DELETE FROM budget_lines WHERE client_id=? AND year=? AND month=?").run(clientId, year, month);
      for (const r of budgetRows) {
        const cat = String(r.category || "").toUpperCase();
        if (!["REVENUE", "DIRECT_COST", "OPEX", "NET_INCOME"].includes(cat)) {
          throw new Error(`budget.csv: invalid category "${r.category}".`);
        }
        const eid = r.entity ? resolveEntity(r.entity) : (entities[0]?.id ?? "");
        d.prepare(`INSERT INTO budget_lines (id, client_id, entity_id, year, month, category, amount)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(client_id, entity_id, year, month, category)
          DO UPDATE SET amount = excluded.amount`)
          .run(uid(), clientId, eid, year, month, cat, num(r.amount));
      }
    }

    // seed empty story slots if none exist (advisor fills in review)
    const noteCount: any = d.prepare("SELECT COUNT(*) n FROM story_notes WHERE period_id=?").get(pid);
    if (noteCount.n === 0) {
      d.prepare("INSERT INTO story_notes (id, period_id, slot, tone, heading, body, sort) VALUES (?,?,?,?,?,?,0)")
        .run(uid(), pid, "WHAT_CHANGED", "info", "Draft — advisor to complete", "A number, a cause, an action.");
    }

    const gate = runGate(pid);
    if (!gate.pass) d.prepare("UPDATE periods SET status='GATED' WHERE id=?").run(pid);
    audit(s.userId, "CLOSE_UPLOAD", `${clientId} ${year}-${month} gate=${gate.pass ? "PASS" : "FAIL"}`);
    return NextResponse.json(gate);
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ pass: false, checks: [], error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ pass: false, checks: [], error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ pass: false, checks: [], error: e.message }, { status: 429 });
    return NextResponse.json({ pass: false, checks: [], error: e.message }, { status: 400 });
  }
}
