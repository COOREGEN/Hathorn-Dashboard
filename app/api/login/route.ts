import { NextResponse } from "next/server";
import { login, AuthError } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const session = await login(email, password);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
    }
    return NextResponse.json({ ok: true, role: session.role });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: "Sign-in failed." }, { status: 400 });
  }
}
