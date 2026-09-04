/**
 * preflight.ts — refuses a deployment that would come up wrong.
 *
 *   npx tsx scripts/preflight.ts
 *
 * Run it against the environment a host will actually give the app, before the
 * first request rather than after. It checks the things that are invisible until
 * they matter: a signing key that is still the published default, backups landing
 * on the same disk as the database, a base URL that points at localhost so every
 * emailed link is dead, and Postgres configured without a migration path.
 */

const problems: string[] = [];
const warnings: string[] = [];
const notes: string[] = [];

const env = (k: string) => (process.env[k] || "").trim();
const appEnv = (env("APP_ENV") || env("NODE_ENV") || "LOCAL").toUpperCase();
const productionLike = appEnv === "PRODUCTION" || appEnv === "STAGING";

// ── Secrets ────────────────────────────────────────────────────────────────
const PUBLISHED_DEFAULT = "dev-secret-change-me";
const auth = env("AUTH_SECRET");
if (!auth) problems.push("AUTH_SECRET is not set. Sessions would be signed with a key published in this repository.");
else if (auth.includes(PUBLISHED_DEFAULT)) problems.push("AUTH_SECRET is still the development default. Generate one: openssl rand -base64 48");
else if (auth.length < 32) problems.push(`AUTH_SECRET is ${auth.length} characters; use at least 32.`);

const encKey = env("ENCRYPTION_KEY");
if (productionLike) {
  if (!encKey) problems.push("ENCRYPTION_KEY is not set. QuickBooks tokens and MFA secrets must not share the JWT signing key.");
  else if (encKey === auth) problems.push("ENCRYPTION_KEY must differ from AUTH_SECRET.");
  else if (encKey.length < 32) problems.push(`ENCRYPTION_KEY is ${encKey.length} characters; use at least 32.`);
}

// ── Public address ─────────────────────────────────────────────────────────
const baseUrl = env("NEXT_PUBLIC_BASE_URL");
if (!baseUrl) problems.push("NEXT_PUBLIC_BASE_URL is not set. OAuth redirects and emailed links need the public origin.");
else if (productionLike && /localhost|127\.0\.0\.1/.test(baseUrl)) problems.push(`NEXT_PUBLIC_BASE_URL is ${baseUrl}; every emailed link would be dead.`);
else if (productionLike && !baseUrl.startsWith("https://")) warnings.push(`NEXT_PUBLIC_BASE_URL is not https. Session cookies will not be marked secure.`);

// ── Where the data lives ───────────────────────────────────────────────────
const dataDir = env("DATA_DIR") || "./data";
const backupDir = env("BACKUP_DIR");
if (productionLike) {
  if (!backupDir) problems.push("BACKUP_DIR is not set. Backups would be written beside the live database on the same disk.");
  else if (backupDir.startsWith(dataDir)) warnings.push(`BACKUP_DIR (${backupDir}) sits inside DATA_DIR (${dataDir}). Losing the disk loses both.`);
}

const pgEnabled = ["1", "true", "yes"].includes(env("POSTGRES_RUNTIME_ENABLED").toLowerCase());
if (pgEnabled) {
  if (!env("DATABASE_URL")) problems.push("POSTGRES_RUNTIME_ENABLED is on but DATABASE_URL is not set.");
  // Migrations run on the SQLite path only, so a Postgres host needs a deliberate
  // apply step and the owner credentials to do it with.
  if (!env("DATABASE_MIGRATOR_URL")) warnings.push("DATABASE_MIGRATOR_URL is not set. Schema changes cannot be applied on this host — see docs/DEPLOY.md.");
  notes.push("Postgres runtime is on. Confirm the schema is present: npm run db:verify");
} else {
  notes.push("Running on SQLite. Fine for one firm; the file must live on a persistent disk, and it serialises requests inside one process.");
}

// ── Things that quietly do nothing ─────────────────────────────────────────
if (!env("RESEND_API_KEY")) notes.push("No RESEND_API_KEY: publish notifications and password-reset emails are silent no-ops.");
if (!env("ANTHROPIC_API_KEY")) notes.push("No ANTHROPIC_API_KEY: story drafting and the copilot fall back to deterministic output.");
if (!env("QBO_CLIENT_ID")) notes.push("No QBO credentials: the bookkeeper uploads CSVs, which is the supported path today.");

// ── Demo settings that must never reach a client-facing host ───────────────
if (productionLike) {
  if (env("LEDGER_ALLOW_LOCAL_PROD") === "1") problems.push("LEDGER_ALLOW_LOCAL_PROD=1 disables production configuration guards. Remove it.");
  if (env("REQUIRE_STAFF_MFA") === "0") problems.push("REQUIRE_STAFF_MFA=0 turns off two-factor authentication for staff. Remove it.");
  if (env("ALLOW_DEMO_SEED") === "1") problems.push("ALLOW_DEMO_SEED=1 permits wiping the book and installing demo passwords. Remove it.");
  if (["1", "true", "yes"].includes(env("ENABLE_MOCK_INTEGRATION").toLowerCase())) warnings.push("ENABLE_MOCK_INTEGRATION is on; a synthetic provider will appear in the integration hub.");
}

// ── Report ─────────────────────────────────────────────────────────────────
const line = (s: string) => console.log(s);
line(`\nPreflight — APP_ENV=${appEnv}\n`);
for (const n of notes) line(`  ·  ${n}`);
if (notes.length) line("");
for (const w of warnings) line(`  !  ${w}`);
if (warnings.length) line("");
for (const p of problems) line(`  ✗  ${p}`);

if (problems.length) {
  line(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} would break this deployment. Fix them before going live.\n`);
  process.exit(1);
}
line(`\nNo blocking problems${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"} worth reading` : ""}.\n`);
