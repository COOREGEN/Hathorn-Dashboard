import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";
import { config } from "./config";

const SECRET = new TextEncoder().encode(config.authSecret);
const COOKIE = "ledger_session";

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
  // Opportunistic cleanup so the table never grows without bound.
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
  const weak = ["password", "changeme", "12345678", "qwerty", "letmein"];
  if (weak.some((w) => pw.toLowerCase().includes(w)))
    return "That password is too easy to guess. Choose something less common.";
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hashSync(pw, 12);

/* ------------------------------------------------------------------ */
/* Session                                                            */
/* ------------------------------------------------------------------ */

export async function login(email: string, password: string): Promise<Session | null> {
  const clean = String(email || "").toLowerCase().trim();
  if (!clean) return null;

  if (recentFailures(clean) >= config.loginMaxAttempts) {
    throw new AuthError(429,
      `Too many failed attempts. Try again in ${config.loginWindowMinutes} minutes.`);
  }

  const u: any = db().prepare("SELECT * FROM users WHERE email = ?").get(clean);
  // Compare against a dummy hash when the user doesn't exist so response time
  // doesn't reveal whether an address is registered.
  const hash = u?.password_hash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const good = bcrypt.compareSync(password || "", hash);

  if (!u || !good) {
    recordFailure(clean);
    return null;
  }

  clearFailures(clean);
  const session: Session = {
    userId: u.id, email: u.email, name: u.name, role: u.role, clientId: u.client_id,
    tv: u.token_version ?? 1,
  };
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
  audit(u.id, "LOGIN");
  return session;
}

export function logout() {
  cookies().delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const session = payload as unknown as Session;
    // A valid signature is not enough: the password may have been reset since this
    // token was issued, in which case the session must be dead immediately.
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
