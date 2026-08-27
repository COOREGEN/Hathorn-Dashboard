/**
 * create-admin.ts — the first real user on a fresh deployment.
 *
 *   npx tsx scripts/create-admin.ts "you@firm.com" "Your Name" ["Firm Name"]
 *
 * The demo seed refuses to run against a production database, and rightly so: it
 * wipes the book and installs known passwords. This creates one administrator
 * and nothing else, prints a one-time password, and forces a change at first
 * sign-in.
 */

import { randomBytes } from "crypto";
import { db, uid } from "../lib/db";
import { hashPassword, validatePassword } from "../lib/auth";

const [, , emailArg, nameArg, firmArg] = process.argv;

if (!emailArg || !nameArg) {
  console.error('Usage: npx tsx scripts/create-admin.ts "you@firm.com" "Your Name" ["Firm Name"]');
  process.exit(2);
}

const email = emailArg.toLowerCase().trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`"${email}" is not an email address.`);
  process.exit(2);
}

const existing: any = db().prepare("SELECT id FROM users WHERE email=?").get(email);
if (existing) {
  console.error(`${email} already exists. Use the password reset flow instead of creating a second account.`);
  process.exit(1);
}

/** Readable aloud over a phone, and still 96 bits of entropy. */
function oneTimePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789"; // no l, 1, 0, o
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 5 === 0) out += "-";
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `${out}7`; // the digit satisfies the letters-and-numbers rule
}

const password = oneTimePassword();
const pwErr = validatePassword(password);
if (pwErr) {
  console.error(`Generated password rejected by policy (${pwErr}). This is a bug in this script.`);
  process.exit(1);
}

const firmName = (firmArg || "Hathorn Advisory Group").trim();
let firm: any = db().prepare("SELECT id, name FROM firms ORDER BY created_at LIMIT 1").get();

/**
 * Probe for the column rather than catching a failed insert. SQLite and Postgres
 * word that error differently, so matching on the message works on one engine and
 * crashes on the other — which is exactly the sort of thing that only shows up on
 * the live database.
 */
let forcesPasswordChange = true;
try {
  db().prepare("SELECT must_change_password FROM users LIMIT 1").get();
} catch {
  forcesPasswordChange = false;
}

const insertUser = forcesPasswordChange
  ? `INSERT INTO users (id, email, password_hash, name, role, client_id, is_platform_admin, token_version, must_change_password)
     VALUES (?,?,?,?,'ADMIN',NULL,1,1,1)`
  : `INSERT INTO users (id, email, password_hash, name, role, client_id, is_platform_admin, token_version)
     VALUES (?,?,?,?,'ADMIN',NULL,1,1)`;

db().transaction(() => {
  if (!firm) {
    const firmId = uid();
    const slug = firmName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    db().prepare("INSERT INTO firms (id, name, slug) VALUES (?,?,?)").run(firmId, firmName, slug);
    firm = { id: firmId, name: firmName };
  }
  const userId = uid();
  db().prepare(insertUser).run(userId, email, hashPassword(password), nameArg.trim());
  db().prepare(
    `INSERT INTO firm_memberships (id, firm_id, user_id, role, status) VALUES (?,?,?,'ADMIN','ACTIVE')`,
  ).run(uid(), firm.id, userId);
})();

console.log(`
  Administrator created.

    Firm      ${firm.name}
    Email     ${email}
    Password  ${password}

  Sign in once with that password and change it${forcesPasswordChange ? " — you will be made to" : ""}. Staff
  two-factor is required whenever APP_ENV=PRODUCTION, so the first sign-in walks
  into enrolment. Keep the backup codes somewhere that is not this terminal.
`);
