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
    secure: config.isProd,
    path: "/",
    maxAge: config.sessionTtl,
  });
}

function sessionFromUser(u: any): Session {
  return {
    userId: u.id, email: u.email, name: u.name, role: u.role, clientId: u.client_id,
    tv: u.token_version ?? 1,
  };
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
      secure: config.isProd,
      path: "/",
      maxAge: 20 * 60,
    });
    return { kind: "mfa_setup", setupToken };
  }

  const session = sessionFromUser(u);
  await issueSessionCookie(session);
  audit(u.id, "LOGIN");
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

export function logout() {
  cookies().delete(COOKIE);
  cookies().delete(SETUP_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const session = payload as unknown as Session;
    const row: any = db().prepare("SELECT token_version FROM users WHERE id=?").get(session.userId);
    if (!row) return null;
    if ((row.token_version ?? 1) !== (session.tv ?? 1)) return null;
    return session;
  } catch {
    return null;
  }
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
  return s;
}

/**
 * Confirms the signed-in user may act on this client's data.
 * Staff can act on any client; a CLIENT user only on their own.
 */
export async function requireClientAccess(clientId: string): Promise<Session> {
  const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
  if (s.role === "CLIENT" && s.clientId !== clientId) throw new AuthError(403);
  return s;
}

export function audit(userId: string, action: string, detail = "") {
  db().prepare("INSERT INTO audit_logs (id, user_id, action, detail) VALUES (?, ?, ?, ?)")
    .run(crypto.randomUUID(), userId, action, detail);
}

/* ------------------------------------------------------------------ */
/* Password reset                                                     */
/* ------------------------------------------------------------------ */

export function createPasswordReset(email: string): { created: boolean; rawToken?: string } {
  const clean = String(email || "").toLowerCase().trim();
  if (!clean) return { created: false };
  const u: any = db().prepare("SELECT id FROM users WHERE email=?").get(clean);
  if (!u) return { created: false };

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
