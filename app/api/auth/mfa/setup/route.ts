import { NextResponse } from "next/server";
import {
  getSession, getMfaSetupUser, completeMfaSetupSession, AuthError, requireRole,
} from "@/lib/auth";
import {
  beginMfaEnrollment, enrollmentQrDataUrl, confirmMfaEnrollment,
  disableMfa, isStaffRole, userMfaStatus,
} from "@/lib/mfa";

/** Who may enroll: signed-in staff, or a staff user mid forced-setup. Clients never enroll. */
async function actor(): Promise<{ userId: string; email: string; name: string } | null> {
  const setup = await getMfaSetupUser();
  if (setup) {
    const u: any = (await import("@/lib/db")).db()
      .prepare("SELECT role FROM users WHERE id=?").get(setup.userId);
    if (!u || !isStaffRole(u.role)) return null;
    return setup;
  }
  const s = await getSession();
  if (s && isStaffRole(s.role)) return { userId: s.userId, email: s.email, name: s.name };
  return null;
}

export async function GET() {
  const a = await actor();
  if (!a) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const status = userMfaStatus(a.userId);
  return NextResponse.json({ ok: true, ...status, email: a.email, name: a.name });
}

export async function POST(req: Request) {
  try {
    const a = await actor();
    if (!a) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = body.action || "begin";

    if (action === "begin") {
      const { secret, uri } = beginMfaEnrollment(a.userId, a.email);
      const qr = await enrollmentQrDataUrl(uri);
      return NextResponse.json({ ok: true, secret, uri, qr });
    }

    if (action === "confirm") {
      const out = confirmMfaEnrollment(a.userId, String(body.code || ""));
      if (!out.ok) return NextResponse.json(out, { status: 400 });
      // If this was forced setup, promote to a full session now.
      const setup = await getMfaSetupUser();
      if (setup) await completeMfaSetupSession();
      return NextResponse.json({ ok: true, backupCodes: out.backupCodes });
    }

    if (action === "disable") {
      const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
      disableMfa(s.userId, s.userId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: "MFA setup failed." }, { status: 400 });
  }
}
