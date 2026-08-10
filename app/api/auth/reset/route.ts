import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();
    const err = resetPasswordWithToken(String(token || ""), String(password || ""));
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Reset failed." }, { status: 400 });
  }
}
