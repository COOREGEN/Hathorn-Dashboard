import { NextResponse } from "next/server";
import { completeMfaLogin } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { challenge, code } = await req.json();
    const session = await completeMfaLogin(String(challenge || ""), String(code || ""));
    if (!session) {
      return NextResponse.json({ ok: false, error: "Invalid or expired code." }, { status: 401 });
    }
    return NextResponse.json({ ok: true, role: session.role });
  } catch {
    return NextResponse.json({ ok: false, error: "Verification failed." }, { status: 400 });
  }
}
