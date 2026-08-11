import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { hashPassword, validatePassword, revokeSessions } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
  const s = await requireRole("ADMIN");
  const b = await jsonObject(req);
  if (b.password) {
    const pwErr = validatePassword(b.password);
    if (pwErr) return NextResponse.json({ ok: false, error: pwErr }, { status: 400 });
    db().prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(b.password), params.id);
    // Anyone holding a token for this account is now signed out.
    revokeSessions(params.id);
  }
  if (b.name) db().prepare("UPDATE users SET name=? WHERE id=?").run(b.name, params.id);
  if (b.role) {
    db().prepare("UPDATE users SET role=? WHERE id=?").run(b.role, params.id);
    revokeSessions(params.id); // a role change must not leave the old role live in a token
  }
  audit(s.userId, "USER_UPDATE", params.id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
  const s = await requireRole("ADMIN");
  db().prepare("DELETE FROM users WHERE id=?").run(params.id);
  audit(s.userId, "USER_DELETE", params.id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
