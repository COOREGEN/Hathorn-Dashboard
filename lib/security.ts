/**
 * Security primitives shared across the app.
 *
 * Three things live here because getting any of them wrong has consequences that
 * reach outside this codebase: encryption for third-party credentials, timeouts on
 * every outbound call, and rate limiting on anything expensive.
 */

import crypto from "crypto";
import { db } from "./db";
import { config } from "./config";

/* ------------------------------------------------------------------ */
/* Encryption at rest                                                  */
/* ------------------------------------------------------------------ */

/**
 * A QuickBooks refresh token is standing read access to a client's complete books.
 * If the database file is ever copied, those tokens must be useless without the key.
 *
 * AES-256-GCM: authenticated, so tampering is detected rather than silently decrypted.
 * The key derives from ENCRYPTION_KEY when set, falling back to AUTH_SECRET so a
 * single-secret deployment still encrypts rather than storing plaintext.
 */
function key(): Buffer {
  const material = process.env.ENCRYPTION_KEY || config.authSecret;
  return crypto.createHash("sha256").update(material).digest();
}

const ENC_PREFIX = "enc:v1:";

export function encrypt(plain: string): string {
  if (!plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + [iv, tag, body].map((b) => b.toString("base64")).join(".");
}

export function decrypt(stored: string): string {
  if (!stored) return stored;
  // Rows written before encryption was introduced are returned as-is so an
  // existing deployment keeps working; they re-encrypt on next write.
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  try {
    const [ivB, tagB, bodyB] = stored.slice(ENC_PREFIX.length).split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(bodyB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Stored credential could not be decrypted. The encryption key may have changed.");
  }
}

/** True when a value is already ciphertext — useful in migrations. */
export const isEncrypted = (v: string) => Boolean(v) && v.startsWith(ENC_PREFIX);

/* ------------------------------------------------------------------ */
/* Outbound calls                                                      */
/* ------------------------------------------------------------------ */

export class UpstreamTimeout extends Error {
  constructor(url: string, ms: number) {
    super(`${new URL(url).host} did not respond within ${ms / 1000}s.`);
  }
}

/**
 * fetch with a hard deadline.
 *
 * Node's fetch has no default timeout: a hung upstream holds a request slot open
 * indefinitely, and enough of them take the app down. Every call to Intuit,
 * Anthropic and Resend goes through here.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new UpstreamTimeout(url, timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

export class RateLimited extends Error {
  retryAfterMinutes: number;
  constructor(action: string, minutes: number) {
    super(`Too many ${action} requests. Try again in ${minutes} minutes.`);
    this.retryAfterMinutes = minutes;
  }
}

/**
 * Counts actions per subject inside a rolling window.
 *
 * The story agent and the QuickBooks sync both call metered third-party APIs on an
 * authenticated endpoint. Without a ceiling, one stuck client-side retry loop bills
 * the firm for it.
 */
export function rateLimit(opts: {
  action: string; subject: string; max: number; windowMinutes: number;
}) {
  const d = db();
  const row: any = d.prepare(
    `SELECT COUNT(*) n FROM rate_events
      WHERE action = ? AND subject = ? AND at > datetime('now', ?)`,
  ).get(opts.action, opts.subject, `-${opts.windowMinutes} minutes`);

  if (row.n >= opts.max) throw new RateLimited(opts.action, opts.windowMinutes);

  d.prepare("INSERT INTO rate_events (action, subject) VALUES (?, ?)")
    .run(opts.action, opts.subject);
  d.prepare("DELETE FROM rate_events WHERE at < datetime('now', '-1 day')").run();
}

export const LIMITS = {
  storyDraft: { max: 20, windowMinutes: 60 },
  qboSync: { max: 30, windowMinutes: 60 },
  upload: { max: 60, windowMinutes: 60 },
  comment: { max: 60, windowMinutes: 60 },
  fpaRun: { max: 40, windowMinutes: 60 },
  fpaAnalyze: { max: 20, windowMinutes: 60 },
  documentUpload: { max: 40, windowMinutes: 60 },
  documentParse: { max: 30, windowMinutes: 60 },
  taxIssue: { max: 60, windowMinutes: 60 },
  taxRule: { max: 60, windowMinutes: 60 },
  taxAnalyze: { max: 20, windowMinutes: 60 },
  taxFetch: { max: 20, windowMinutes: 60 },
};
