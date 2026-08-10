# Hathorn Ledger

Monthly advisory platform for Hathorn Advisory Group.

Two surfaces, one engine:

- **Staff book** (`/today`, `/portfolio`, `/dash`, `/review`) — call prep, triage, storytelling
- **Client portal** (`/portal`) — the branded monthly statement (published months only)

Stack: Next.js 14 App Router · TypeScript · better-sqlite3 · hand-rolled SVG charts.

## Run

```bash
npm install
cp .env.example .env.local   # then: openssl rand -base64 48 -> AUTH_SECRET
# For production, also set NEXT_PUBLIC_BASE_URL, BACKUP_DIR, RESEND_*, REQUIRE_STAFF_MFA=1
# See PRODUCTION.md
npm run seed
npm run dev
```

Open http://localhost:3000.

Seeded logins (password `ledger2026`):

| Role | Email | Lands on |
|---|---|---|
| ADMIN | regen@hathornadvisorygroup.com | `/today` |
| ADVISOR | jeremiah@hathornadvisorygroup.com | `/today` |
| BOOKKEEPER | books@hathornadvisorygroup.com | `/upload` |
| CLIENT | owner@northbridge.example | `/portal` |

Example book after seed: **Northbridge Home Care** plus Lakeside Stays, Bright Path, and Impact 5.

```bash
npm run seed:book   # add synthetic clients for density testing
```

## Prove the workflow

```bash
npm run seed
npm run build
BACKUP_DIR=./data/backups REQUIRE_STAFF_MFA=0 LEDGER_ALLOW_LOCAL_PROD=1 \
  AUTH_SECRET="$(openssl rand -base64 48)" NEXT_PUBLIC_BASE_URL=http://localhost:3000 \
  npm run start
# in another shell:
npm run proof
```

`scripts/workflow-proof.sh` walks: health → role walls → password recovery ack → commentary gate → publish → portal → release PDF → comments → amend → lock → sample upload/gate.

## Production

Read **`PRODUCTION.md`** before going live. Short version:

1. Real `AUTH_SECRET`, public `NEXT_PUBLIC_BASE_URL`, off-box `BACKUP_DIR`
2. Staff MFA required (enroll at `/account/security`)
3. Hourly `npm run backup` + daily `npm run restore-check`
4. Never `npm run seed` on a live book without `ALLOW_DEMO_SEED=1`
5. Runtime is SQLite; Postgres migrate/verify scripts exist for a future cutover

**Read `AGENTS.md` before changing anything.**
