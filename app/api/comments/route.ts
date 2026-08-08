import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { sendCommentReply } from "@/lib/email";
import { config } from "@/lib/config";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { activeRelease } from "@/lib/release";

/**
 * Resolves a period to its owning client and confirms the caller may touch it.
 *
 * Role alone is not enough here: every CLIENT user has the CLIENT role, so a check
 * that stops at "is this a client?" lets one tenant read another tenant's threads by
 * guessing a period id. Ownership must be verified against the row itself.
 *
 * For clients, an *active release* is the authority — not periods.status. During an
 * amendment the status flips to IN_REVIEW while the prior statement stays visible;
 * comments must still work on that live statement.
 */
async function authorizePeriod(periodId: string) {
  const session = await requireRole("ADMIN", "ADVISOR", "CLIENT");
  const period: any = db().prepare("SELECT id, client_id, status FROM periods WHERE id=?").get(periodId);
  if (!period) throw new AuthError(403);
  if (session.role === "CLIENT") {
    if (session.clientId !== period.client_id) throw new AuthError(403);
    if (!activeRelease(periodId)) throw new AuthError(403);
  }
  return { session, period };
}

function fail(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
  return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
}

export async function GET(req: Request) {
  try {
    const periodId = new URL(req.url).searchParams.get("periodId") || "";
    await authorizePeriod(periodId);
    const rows = db()
      .prepare("SELECT * FROM comments WHERE period_id=? ORDER BY created_at ASC")
      .all(periodId);
    return NextResponse.json(rows);
  } catch (e: any) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const { periodId, metricSlot, body } = await jsonObject(req);
    const { session, period } = await authorizePeriod(periodId);
    rateLimit({ action: "comment", subject: session.userId, ...LIMITS.comment });

    if (!body || !String(body).trim()) {
      return NextResponse.json({ ok: false, error: "Comment cannot be empty." }, { status: 400 });
    }

    const id = uid();
    db().prepare(
      "INSERT INTO comments (id,period_id,metric_slot,user_id,user_name,user_role,body) VALUES (?,?,?,?,?,?,?)",
    ).run(id, periodId, String(metricSlot).slice(0, 40), session.userId, session.name,
      session.role, String(body).slice(0, 2000));
    audit(session.userId, "COMMENT_POST", `${periodId} ${metricSlot}`);

    // An advisor reply notifies the client. A client question does not email itself.
    if (["ADMIN", "ADVISOR"].includes(session.role)) {
      const client: any = db().prepare("SELECT * FROM clients WHERE id=?").get(period.client_id);
      if (client?.notify_email) {
        await sendCommentReply({
          clientEmail: client.notify_email, clientName: client.name,
          advisorName: session.name, metric: metricSlot, body,
          portalUrl: `${config.baseUrl}/portal`,
        });
      }
    }
    return NextResponse.json({ id });
  } catch (e: any) {
    return fail(e);
  }
}
