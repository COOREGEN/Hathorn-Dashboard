import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export async function POST(req: Request) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  const { clientId, name, status } = await jsonObject(req);
  const id = uid();
  db().prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)").run(id, clientId, name, status || "ACTIVE");
  audit(s.userId, "ENTITY_CREATE", id);
  return NextResponse.json({ id });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
