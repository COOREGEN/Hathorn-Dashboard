import { NextResponse } from "next/server";
import { login, AuthError } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
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
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: "Sign-in failed." }, { status: 400 });
  }
}
