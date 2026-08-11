import { NextResponse } from "next/server";
import { login, AuthError } from "@/lib/auth";
import { jsonObject, ValidationError } from "@/lib/validate";

export async function POST(req: Request) {
  try {
    const body = await jsonObject(req);
    const email = body.email;
    const password = body.password;
    const result = await login(email, password);

    if (result.kind === "invalid") {
      return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
    }
    if (result.kind === "mfa") {
      return NextResponse.json({ ok: true, mfaRequired: true, challenge: result.challenge });
    }
    if (result.kind === "mfa_setup") {
      return NextResponse.json({ ok: true, mfaSetupRequired: true });
    }
    return NextResponse.json({ ok: true, role: result.session.role });
  } catch (e: any) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: "Sign-in failed." }, { status: 400 });
  }
}
