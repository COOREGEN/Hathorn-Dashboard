import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

function fail(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const { clientId, periodId, title, detail, owner, due, impact } = await jsonObject(req);
    if (!title?.trim()) return NextResponse.json({ ok: false, error: "An action needs a title." }, { status: 400 });
    const id = uid();
    db().prepare(`INSERT INTO action_items
      (id, client_id, opened_period_id, title, detail, owner, due, impact)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, clientId, periodId, String(title).slice(0, 200), String(detail || "").slice(0, 1000),
        String(owner || "").slice(0, 100), String(due || "").slice(0, 40), Number(impact) || 0);
    audit(s.userId, "ACTION_OPEN", `${clientId} ${title}`);
    return NextResponse.json({ ok: true, id });
  } catch (e: any) { return fail(e); }
}
