import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { requireRole, requireClientInFirm, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { hashPassword, validatePassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
  const { email, name, role, clientId, password } = await jsonObject(req);
  // Creating a user against a client id is creating a login into that client's
  // portal. Without the firm check, any firm's admin could mint themselves an
  // account inside another firm's client and read their financials.
  const s = clientId
    ? await requireClientInFirm(clientId, "ADMIN")
    : await requireRole("ADMIN");
  const id = uid();
  const pwErr = validatePassword(password);
    if (pwErr) return NextResponse.json({ ok: false, error: pwErr }, { status: 400 });
    const hash = hashPassword(password);
  db().prepare("INSERT INTO users (id,email,password_hash,name,role,client_id,token_version) VALUES (?,?,?,?,?,?,1)")
    .run(id, email.toLowerCase().trim(), hash, name, role, clientId || null);
  audit(s.userId, "USER_CREATE", id);
  return NextResponse.json({ id });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
