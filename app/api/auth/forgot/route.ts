import { NextResponse } from "next/server";
import { createPasswordReset } from "@/lib/auth";
import { sendPasswordReset } from "@/lib/email";
import { config } from "@/lib/config";
import { db, log } from "@/lib/db";
import { rateLimit, RateLimited } from "@/lib/security";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const clean = String(email || "").toLowerCase().trim();

    // Same response whether or not the address exists — do not enumerate users.
    const generic = {
      ok: true,
      message: "If that email is on file, a reset link is on its way.",
    };

    if (!clean) return NextResponse.json(generic);

    try {
      rateLimit({ action: "password_reset", subject: clean, max: 5, windowMinutes: 60 });
    } catch (e) {
      if (e instanceof RateLimited) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
      }
      throw e;
    }

    const { created, rawToken } = createPasswordReset(clean);
    if (created && rawToken) {
      const u: any = db().prepare("SELECT name, email FROM users WHERE email=?").get(clean);
      const resetUrl = `${config.baseUrl}/reset?token=${rawToken}`;
      if (config.email.enabled) {
        sendPasswordReset({ email: u.email, name: u.name, resetUrl });
      } else {
        // Dev / pre-email: log the link so recovery is still testable.
        log("warn", "password_reset.dev_link", { email: clean, resetUrl });
      }
    }

    return NextResponse.json(generic);
  } catch {
    return NextResponse.json({ ok: false, error: "Could not process that request." }, { status: 400 });
  }
}
