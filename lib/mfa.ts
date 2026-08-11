/**
 * Staff TOTP (authenticator-app) MFA.
 *
 * Secrets are encrypted at rest. Backup codes are stored as bcrypt hashes so a
 * database copy cannot mint fresh codes. Clients never enroll — the portal is
 * read-only and password recovery covers lockout.
 */

import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, uid } from "./db";
import { encrypt, decrypt } from "./security";
import { recordAudit } from "./audit-trail";

const ISSUER = "Hathorn Dashboard";

export function isStaffRole(role: string): boolean {
  return role === "ADMIN" || role === "ADVISOR" || role === "BOOKKEEPER";
}

export function userMfaStatus(userId: string): { enabled: boolean; enrolledAt: string | null } {
  const u: any = db().prepare("SELECT mfa_enabled, mfa_enrolled_at FROM users WHERE id=?").get(userId);
  return { enabled: Boolean(u?.mfa_enabled), enrolledAt: u?.mfa_enrolled_at ?? null };
}

/** Starts enrollment: returns otpauth URI. Does not enable MFA yet. */
export function beginMfaEnrollment(userId: string, email: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  db().prepare("UPDATE users SET mfa_secret_enc=?, mfa_enabled=0 WHERE id=?")
    .run(encrypt(secret.base32), userId);
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export async function enrollmentQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { margin: 1, width: 200 });
}

/**
 * Confirms the authenticator, enables MFA, and returns one-time backup codes.
 * Backup codes are shown once; only hashes are retained.
 */
export function confirmMfaEnrollment(userId: string, code: string): { ok: true; backupCodes: string[] } | { ok: false; error: string } {
  const u: any = db().prepare("SELECT mfa_secret_enc, email FROM users WHERE id=?").get(userId);
  if (!u?.mfa_secret_enc) return { ok: false, error: "Start enrollment first." };
  if (!verifyTotp(decrypt(u.mfa_secret_enc), code)) {
    return { ok: false, error: "That code did not match. Try the next one from your app." };
  }
  const backupCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex"));
  const hashes = backupCodes.map((c) => bcrypt.hashSync(c, 10));
  db().prepare(
    `UPDATE users SET mfa_enabled=1, mfa_enrolled_at=datetime('now'), mfa_backup_hashes=? WHERE id=?`,
  ).run(JSON.stringify(hashes), userId);
  recordAudit(userId, "MFA_ENABLED", "", { resourceType: "user", resourceId: userId });
  return { ok: true, backupCodes };
}

export function disableMfa(userId: string, actorId: string) {
  db().prepare(
    `UPDATE users SET mfa_enabled=0, mfa_secret_enc=NULL, mfa_backup_hashes='[]', mfa_enrolled_at=NULL WHERE id=?`,
  ).run(userId);
  recordAudit(actorId, "MFA_DISABLED", userId, { resourceType: "user", resourceId: userId });
}

export function verifyUserMfa(userId: string, code: string): boolean {
  const u: any = db().prepare(
    "SELECT mfa_secret_enc, mfa_enabled, mfa_backup_hashes FROM users WHERE id=?",
  ).get(userId);
  if (!u?.mfa_enabled || !u.mfa_secret_enc) return false;
  const trimmed = String(code || "").replace(/\s+/g, "");
  if (verifyTotp(decrypt(u.mfa_secret_enc), trimmed)) return true;
  return consumeBackupCode(userId, trimmed, u.mfa_backup_hashes);
}

function verifyTotp(secretBase32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const totp = new TOTP({
    issuer: ISSUER,
    label: "verify",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  // ±1 step window for clock skew.
  return totp.validate({ token: code, window: 1 }) !== null;
}

function consumeBackupCode(userId: string, code: string, rawHashes: string): boolean {
  let hashes: string[] = [];
  try { hashes = JSON.parse(rawHashes || "[]"); } catch { return false; }
  const idx = hashes.findIndex((h) => bcrypt.compareSync(code, h));
  if (idx < 0) return false;
  hashes.splice(idx, 1);
  db().prepare("UPDATE users SET mfa_backup_hashes=? WHERE id=?")
    .run(JSON.stringify(hashes), userId);
  recordAudit(userId, "MFA_BACKUP_USED", "", { resourceType: "user", resourceId: userId });
  return true;
}

export const mfaUid = uid;
