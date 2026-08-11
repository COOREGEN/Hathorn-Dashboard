import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, uid } from "./db";
import { config } from "./config";
import { isStaffRole, verifyUserMfa } from "./mfa";

const SECRET = new TextEncoder().encode(config.authSecret);
const COOKIE = "ledger_session";
const SETUP_COOKIE = "ledger_mfa_setup";

export type Role = "ADMIN" | "ADVISOR" | "BOOKKEEPER" | "CLIENT";
export type Session = {
  userId: string; email: string; name: string; role: Role; clientId: string | null;
  /** Active firm workspace — revalidated against memberships on every request. */
  firmId: string | null;
  /** Platform operator — not the same as firm ADMIN. Never implies client access. */
  isPlatformAdmin: boolean;
  /** Bumped on password change so existing tokens stop verifying. */
  tv: number;
};

/** Thrown when a handler is reached without the right role. Carries an HTTP status. */
export class AuthError extends Error {
  status: 401 | 403 | 429;
  constructor(status: 401 | 403 | 429, message?: string) {
    super(message || (status === 401 ? "Not signed in"
      : status === 429 ? "Too many attempts" : "Not permitted for your role"));
    this.status = status;
  }
}

export type LoginResult =
  | { kind: "session"; session: Session }
  | { kind: "mfa"; challenge: string }
  | { kind: "mfa_setup"; setupToken: string }
  | { kind: "invalid" };

/* ------------------------------------------------------------------ */
/* Login throttling — blunt but effective against credential stuffing. */
/* ------------------------------------------------------------------ */

function recentFailures(email: string): number {
  const row: any = db().prepare(
    `SELECT COUNT(*) n FROM login_attempts
     WHERE email = ? AND at > datetime('now', '-${config.loginWindowMinutes} minutes')`,
  ).get(email);
  return row.n;
}

function recordFailure(email: string) {
  db().prepare("INSERT INTO login_attempts (email) VALUES (?)").run(email);
  db().prepare(
    `DELETE FROM login_attempts WHERE at < datetime('now', '-${config.loginWindowMinutes} minutes')`,
  ).run();
}

function clearFailures(email: string) {
  db().prepare("DELETE FROM login_attempts WHERE email = ?").run(email);
}

/* ------------------------------------------------------------------ */
/* Passwords                                                          */
/* ------------------------------------------------------------------ */

/** Returns an error message, or null if the password is acceptable. */
export function validatePassword(pw: string): string | null {
  if (!pw || pw.length < config.minPasswordLength)
    return `Password must be at least ${config.minPasswordLength} characters.`;
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw))
    return "Password must contain both letters and numbers.";
  const weak = ["password", "changeme", "12345678", "qwerty", "letmein", "ledger2026"];
  if (weak.some((w) => pw.toLowerCase().includes(w)))
    return "That password is too easy to guess. Choose something less common.";
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hashSync(pw, 12);

/* ------------------------------------------------------------------ */
/* Session cookies                                                    */
/* ------------------------------------------------------------------ */

async function issueSessionCookie(session: Session) {
  const token = await new SignJWT(session as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET);

  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: config.sessionTtl,
  });
}

/** Resolve active firm without importing tenancy (Next prod cannot cycle-require). */
function resolveSessionFirmId(session: {
  userId: string; role: Role; clientId: string | null; firmId?: string | null;
}): string | null {
  if (session.role === "CLIENT" && session.clientId) {
    const row: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(session.clientId);
    return row?.firm_id ?? null;
  }
  const memberships: any[] = db().prepare(
    `SELECT firm_id FROM firm_memberships WHERE user_id=? AND status='ACTIVE' ORDER BY created_at`,
  ).all(session.userId);
  if (!memberships.length) return null;
  if (session.firmId && memberships.some((m) => m.firm_id === session.firmId)) {
    return session.firmId;
  }
  return memberships[0].firm_id;
}

function sessionFromUser(u: any, preferredFirmId?: string | null): Session {
  const base = {
    userId: u.id as string,
    email: u.email as string,
    name: u.name as string,
    role: u.role as Role,
    clientId: (u.client_id ?? null) as string | null,
    firmId: (preferredFirmId ?? null) as string | null,
    isPlatformAdmin: Boolean(u.is_platform_admin),
    tv: u.token_version ?? 1,
  };
  return { ...base, firmId: resolveSessionFirmId(base) };
}

async function issueChallenge(userId: string, purpose: "mfa" | "mfa_setup"): Promise<string> {
  return new SignJWT({ userId, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(purpose === "mfa" ? "5m" : "20m")
    .sign(SECRET);
}

export async function verifyChallenge(
  token: string,
  purpose: "mfa" | "mfa_setup",
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if ((payload as any).purpose !== purpose) return null;
    const userId = String((payload as any).userId || "");
    if (!userId) return null;
    return { userId };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Login                                                              */
/* ------------------------------------------------------------------ */

/**
 * Password gate. May return an MFA challenge or MFA-setup token instead of a
 * session — staff never get a full session without completing the next step when
 * MFA is required or already enrolled.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const clean = String(email || "").toLowerCase().trim();
  if (!clean) return { kind: "invalid" };

  if (recentFailures(clean) >= config.loginMaxAttempts) {
    throw new AuthError(429,
      `Too many failed attempts. Try again in ${config.loginWindowMinutes} minutes.`);
  }

  const u: any = db().prepare("SELECT * FROM users WHERE email = ?").get(clean);
  const hash = u?.password_hash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const good = bcrypt.compareSync(password || "", hash);

  if (!u || !good) {
    recordFailure(clean);
    return { kind: "invalid" };
  }

  clearFailures(clean);

  // Bind RLS before membership resolution and audit insert (Postgres runtime).
  try {
    const { setRlsUserId, setRlsFirmId, setPlatformAdmin } = require("./db-context") as typeof import("./db-context");
    setRlsUserId(u.id);
    setPlatformAdmin(false);
    setRlsFirmId(null);
  } catch { /* sqlite */ }

  const staff = isStaffRole(u.role);
  const mfaOn = Boolean(u.mfa_enabled);

  if (staff && mfaOn) {
    const challenge = await issueChallenge(u.id, "mfa");
    return { kind: "mfa", challenge };
  }

  if (staff && !mfaOn && config.requireStaffMfa) {
    const setupToken = await issueChallenge(u.id, "mfa_setup");
    cookies().set(SETUP_COOKIE, setupToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      path: "/",
      maxAge: 20 * 60,
    });
    return { kind: "mfa_setup", setupToken };
  }

  const session = sessionFromUser(u);
  try {
    const { setRlsFirmId } = require("./db-context") as typeof import("./db-context");
    setRlsFirmId(session.firmId);
  } catch { /* sqlite */ }
  await issueSessionCookie(session);
  audit(u.id, "LOGIN", "", { firmId: session.firmId, clientId: session.clientId });
  return { kind: "session", session };
}

/** Completes login after a valid TOTP / backup code. */
export async function completeMfaLogin(challenge: string, code: string): Promise<Session | null> {
  const checked = await verifyChallenge(challenge, "mfa");
  if (!checked) return null;
  if (!verifyUserMfa(checked.userId, code)) {
    const u: any = db().prepare("SELECT email FROM users WHERE id=?").get(checked.userId);
    if (u) recordFailure(u.email);
    return null;
  }
  const u: any = db().prepare("SELECT * FROM users WHERE id=?").get(checked.userId);
  if (!u) return null;
  clearFailures(u.email);
  const session = sessionFromUser(u);
  await issueSessionCookie(session);
  cookies().delete(SETUP_COOKIE);
  audit(u.id, "LOGIN_MFA");
  return session;
}

/**
 * After MFA enrollment during forced setup, promote the setup cookie to a session.
 */
export async function completeMfaSetupSession(setupToken?: string): Promise<Session | null> {
  const token = setupToken || cookies().get(SETUP_COOKIE)?.value;
  if (!token) return null;
  const checked = await verifyChallenge(token, "mfa_setup");
  if (!checked) return null;
  const u: any = db().prepare("SELECT * FROM users WHERE id=?").get(checked.userId);
  if (!u || !u.mfa_enabled) return null;
  const session = sessionFromUser(u);
  await issueSessionCookie(session);
  cookies().delete(SETUP_COOKIE);
  audit(u.id, "LOGIN_MFA_SETUP");
  return session;
}

export async function getMfaSetupUser(): Promise<{ userId: string; email: string; name: string } | null> {
  const token = cookies().get(SETUP_COOKIE)?.value;
  if (!token) return null;
  const checked = await verifyChallenge(token, "mfa_setup");
  if (!checked) return null;
  const u: any = db().prepare("SELECT id, email, name FROM users WHERE id=?").get(checked.userId);
  if (!u) return null;
  return { userId: u.id, email: u.email, name: u.name };
}

export function logout(actorId?: string | null, opts?: { firmId?: string | null }) {
  if (actorId) {
    try {
      audit(actorId, "LOGOUT", "session ended", {
        firmId: opts?.firmId ?? null,
        resourceType: "session",
        resourceId: actorId,
      });
    } catch { /* never block logout */ }
  }
  cookies().delete(COOKIE);
  cookies().delete(SETUP_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const session = payload as unknown as Session;
    // Bind RLS user context before membership/client lookups (Postgres runtime).
    try {
      const { setRlsUserId, setRlsFirmId, setPlatformAdmin } = require("./db-context") as typeof import("./db-context");
      setRlsUserId(session.userId);
      setPlatformAdmin(false);
      setRlsFirmId(session.firmId ?? null);
    } catch { /* db-context unavailable */ }
    const row: any = db().prepare(
      "SELECT token_version, is_platform_admin, role, client_id, email, name FROM users WHERE id=?",
    ).get(session.userId);
    if (!row) return null;
    if ((row.token_version ?? 1) !== (session.tv ?? 1)) return null;
    // Re-resolve firm membership every request — a removed membership must fail closed.
    const enriched: Session = {
      userId: session.userId,
      email: row.email,
      name: row.name,
      role: row.role,
      clientId: row.client_id ?? null,
      firmId: session.firmId ?? null,
      isPlatformAdmin: Boolean(row.is_platform_admin),
      tv: session.tv,
    };
    enriched.firmId = resolveSessionFirmId(enriched);
    try {
      const { setRlsFirmId, setPlatformAdmin } = require("./db-context") as typeof import("./db-context");
      setRlsFirmId(enriched.firmId);
      // Platform bypass is opt-in via requirePlatformAdmin(), never ambient.
      setPlatformAdmin(false);
    } catch { /* db-context unavailable */ }
    return enriched;
  } catch {
    return null;
  }
}

/** Switch active firm workspace after membership check; re-issues the session cookie. */
export async function switchActiveFirm(firmId: string): Promise<Session> {
  const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
  const membership: any = db().prepare(
    `SELECT 1 FROM firm_memberships WHERE user_id=? AND firm_id=? AND status='ACTIVE'`,
  ).get(s.userId, firmId);
  if (!membership) throw new AuthError(403, "Resource not found.");
  const firm: any = db().prepare("SELECT id, status FROM firms WHERE id=?").get(firmId);
  if (!firm || firm.status !== "ACTIVE") throw new AuthError(403, "Resource not found.");
  const u: any = db().prepare("SELECT * FROM users WHERE id=?").get(s.userId);
  const next = sessionFromUser(u, firmId);
  await issueSessionCookie(next);
  audit(s.userId, "FIRM_SWITCH", firmId);
  return next;
}

/** Ends every live session for a user. Called on password change and on demand. */
export function revokeSessions(userId: string) {
  db().prepare("UPDATE users SET token_version = COALESCE(token_version,1) + 1 WHERE id=?").run(userId);
}

/**
 * Defense in depth: middleware already walls these paths, but handlers verify too.
 * Throws AuthError so route handlers return a clean 401/403 instead of a 500.
 */
export async function requireRole(...roles: Role[] | string[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  if (!roles.includes(s.role)) throw new AuthError(403);
  try {
    const { bindRlsFromSession } = require("./db-context") as typeof import("./db-context");
    bindRlsFromSession(s);
  } catch { /* sqlite */ }
  return s;
}

/**
 * Confirms the signed-in user may act on this client's data.
 *
 * - CLIENT: only their own client_id.
 * - Staff: ACTIVE membership in the client's firm (firm-wide client access policy).
 * - Platform admin alone is not enough — no silent cross-tenant browse.
 */
export async function requireClientAccess(clientId: string): Promise<Session> {
  if (!clientId) throw new AuthError(403, "Resource not found.");
  const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");

  // CLIENT: identity is the session client_id — do not depend on a firm-scoped
  // clients SELECT (Postgres RLS) before the ownership check.
  if (s.role === "CLIENT") {
    if (s.clientId !== clientId) throw new AuthError(403, "Resource not found.");
    return s;
  }

  const owner: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(clientId);
  if (!owner?.firm_id) throw new AuthError(403, "Resource not found.");
  const membership: any = db().prepare(
    `SELECT 1 FROM firm_memberships WHERE user_id=? AND firm_id=? AND status='ACTIVE'`,
  ).get(s.userId, owner.firm_id);
  if (!membership) throw new AuthError(403, "Resource not found.");
  return s;
}

export function audit(userId: string, action: string, detail = "", opts?: {
  firmId?: string | null;
  clientId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}) {
  // Delegate to the structured trail writer (migration 31 columns are optional
  // until applied — recordAudit falls back to the original column set).
  const { recordAudit } = require("./audit-trail") as typeof import("./audit-trail");
  let firmId = opts?.firmId ?? null;
  if (!firmId && userId) {
    try {
      const row: any = db().prepare(
        `SELECT firm_id FROM firm_memberships WHERE user_id=? AND status='ACTIVE' ORDER BY created_at LIMIT 1`,
      ).get(userId);
      firmId = row?.firm_id ?? null;
    } catch { /* ignore */ }
  }
  recordAudit(userId, action, detail, { ...opts, firmId });
}

/* ------------------------------------------------------------------ */
/* Password reset                                                     */
/* ------------------------------------------------------------------ */

export function createPasswordReset(email: string): { created: boolean; rawToken?: string } {
  const clean = String(email || "").toLowerCase().trim();
  if (!clean) return { created: false };
  const u: any = db().prepare("SELECT id FROM users WHERE email=?").get(clean);
  if (!u) return { created: false };

  // Unauthenticated recovery still writes audit_logs under RLS — bind the user
  // so the row's user_id satisfies the policy WITH CHECK.
  try {
    const { setRlsUserId } = require("./db-context") as typeof import("./db-context");
    setRlsUserId(u.id);
  } catch { /* sqlite */ }

  // Invalidate prior unused tokens.
  db().prepare(
    `UPDATE password_reset_tokens SET used_at=datetime('now')
      WHERE user_id=? AND used_at IS NULL`,
  ).run(u.id);

  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  db().prepare(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, datetime('now', '+1 hour'))`,
  ).run(uid(), u.id, tokenHash);

  audit(u.id, "PASSWORD_RESET_REQUESTED");
  return { created: true, rawToken: raw };
}

export function resetPasswordWithToken(rawToken: string, newPassword: string): string | null {
  const err = validatePassword(newPassword);
  if (err) return err;
  const tokenHash = crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
  const row: any = db().prepare(
    `SELECT * FROM password_reset_tokens
      WHERE token_hash=? AND used_at IS NULL AND expires_at > datetime('now')`,
  ).get(tokenHash);
  if (!row) return "That reset link is invalid or has expired.";

  db().prepare("UPDATE users SET password_hash=? WHERE id=?")
    .run(hashPassword(newPassword), row.user_id);
  db().prepare("UPDATE password_reset_tokens SET used_at=datetime('now') WHERE id=?")
    .run(row.id);
  revokeSessions(row.user_id);
  audit(row.user_id, "PASSWORD_RESET_COMPLETED");
  return null;
}

export function changePassword(userId: string, current: string, next: string): string | null {
  const u: any = db().prepare("SELECT password_hash FROM users WHERE id=?").get(userId);
  if (!u || !bcrypt.compareSync(current || "", u.password_hash)) {
    return "Current password is incorrect.";
  }
  const err = validatePassword(next);
  if (err) return err;
  db().prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(next), userId);
  revokeSessions(userId);
  audit(userId, "PASSWORD_CHANGED");
  return null;
}
