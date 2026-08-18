import { NextResponse } from "next/server";
import { getSession, logout } from "@/lib/auth";

export async function POST() {
  const s = await getSession();
  logout(s?.userId ?? null, { firmId: s?.firmId ?? null });
  return NextResponse.json({ ok: true });
}
