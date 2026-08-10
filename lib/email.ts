/**
 * Email notifications via Resend. Opt-in: set RESEND_API_KEY in .env.local.
 * If key is absent, all sends are silent no-ops — platform works without it.
 */

import { monthName, log } from "./db";
import { config } from "./config";

/** Escape untrusted content before interpolating into HTML email bodies. */
export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends without blocking the caller.
 *
 * Publishing a period used to await Resend, so a slow mail API made "Approve &
 * Publish" hang in front of an advisor. Delivery is best-effort and failures are
 * logged, never surfaced as a failed publish — the period is published either way.
 */
function send(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log("info", "email.skipped", { to, subject, reason: "RESEND_API_KEY unset" });
    return;
  }

  void (async () => {
    try {
      const { Resend } = await import("resend");
      const r = new Resend(key);
      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error("Resend did not respond within 15s")), 15_000));
      await Promise.race([
        r.emails.send({
          from: config.email.from,
          to, subject, html,
        }),
        timeout,
      ]);
      log("info", "email.sent", { to, subject });
    } catch (e: any) {
      log("error", "email.failed", { to, subject, error: e?.message });
    }
  })();
}

export function sendPeriodPublished(opts: {
  clientName: string; clientEmail: string; year: number; month: number; portalUrl: string;
}) {
  const period = `${monthName(opts.month)} ${opts.year}`;
  const name = escapeHtml(opts.clientName);
  const url = escapeHtml(opts.portalUrl);
  send(
    opts.clientEmail,
    `Your ${period} statement is ready — ${opts.clientName}`,
    `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#232323">
      <div style="background:#0C0B0A;padding:28px 32px;border-radius:8px 8px 0 0">
        <div style="font-size:13px;font-weight:700;letter-spacing:.2em;color:#D3AF37">HATHORN ADVISORY GROUP</div>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e8e5e0;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin:0 0 8px;font-size:18px;font-weight:700">${escapeHtml(period)} is ready.</p>
        <p style="color:#6E675B;font-size:14px;line-height:1.6;margin:0 0 24px">
          Your monthly financial dashboard has been reviewed and published by your advisor.
          Sign in to see your numbers, what changed, and the action items for this month.
        </p>
        <a href="${url}" style="display:inline-block;background:#0C0B0A;color:#fff;
          font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
          View my dashboard →
        </a>
        <p style="color:#9a9490;font-size:11px;margin:24px 0 0;line-height:1.6">
          Hathorn Advisory Group &nbsp;·&nbsp; ${name}
        </p>
      </div>
    </div>`,
  );
}

export function sendCommentReply(opts: {
  clientEmail: string; clientName: string; advisorName: string;
  metric: string; body: string; portalUrl: string;
}) {
  const url = escapeHtml(opts.portalUrl);
  send(
    opts.clientEmail,
    `${opts.advisorName} replied to your question — ${opts.clientName}`,
    `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#232323">
      <div style="background:#0C0B0A;padding:28px 32px;border-radius:8px 8px 0 0">
        <div style="font-size:13px;font-weight:700;letter-spacing:.2em;color:#D3AF37">HATHORN ADVISORY GROUP</div>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e8e5e0;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin:0 0 4px;font-size:13px;color:#9a9490;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(opts.metric)}</p>
        <p style="margin:0 0 16px;font-size:16px;font-weight:700">${escapeHtml(opts.advisorName)} replied</p>
        <div style="background:#f4f3f0;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;margin-bottom:24px;white-space:pre-wrap">
          ${escapeHtml(opts.body)}
        </div>
        <a href="${url}" style="display:inline-block;background:#0C0B0A;color:#fff;
          font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
          View dashboard →
        </a>
      </div>
    </div>`,
  );
}

export function sendPasswordReset(opts: { email: string; name: string; resetUrl: string }) {
  const url = escapeHtml(opts.resetUrl);
  send(
    opts.email,
    "Reset your Hathorn Ledger password",
    `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#232323">
      <div style="background:#0C0B0A;padding:28px 32px;border-radius:8px 8px 0 0">
        <div style="font-size:13px;font-weight:700;letter-spacing:.2em;color:#D3AF37">HATHORN ADVISORY GROUP</div>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e8e5e0;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin:0 0 8px;font-size:18px;font-weight:700">Reset your password</p>
        <p style="color:#6E675B;font-size:14px;line-height:1.6;margin:0 0 24px">
          Hi ${escapeHtml(opts.name)}, we received a request to reset your Ledger password.
          This link expires in one hour. If you did not ask for this, you can ignore this email.
        </p>
        <a href="${url}" style="display:inline-block;background:#0C0B0A;color:#fff;
          font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
          Choose a new password →
        </a>
      </div>
    </div>`,
  );
}
