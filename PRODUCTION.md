# Production runbook — Hathorn Ledger

This is the live advisory book, not a demo. Ship only when every item below is true.

## 1. Host safety

| Requirement | How |
|---|---|
| Strong `AUTH_SECRET` | `openssl rand -base64 48` — never the repo default |
| Public URL | `NEXT_PUBLIC_BASE_URL=https://your-host` |
| Off-box backups | `BACKUP_DIR=/mnt/backups/ledger` on a separate volume |
| Staff MFA | Default on in production (`REQUIRE_STAFF_MFA=1`). Enroll at `/account/security` |
| Password recovery | Set `RESEND_API_KEY` + `RESEND_FROM` so `/forgot` can email links |
| Encryption key | Optional `ENCRYPTION_KEY` for QBO tokens / MFA secrets (falls back to `AUTH_SECRET`) |

Refuse to start if `AUTH_SECRET` is missing, is the published default, or is shorter than 32 characters. Same for a localhost `NEXT_PUBLIC_BASE_URL` and a missing `BACKUP_DIR`.

### Cron

```cron
0 * * * * cd /srv/ledger && /usr/bin/npm run backup >> /var/log/ledger-backup.log 2>&1
15 3 * * * cd /srv/ledger && /usr/bin/npm run restore-check >> /var/log/ledger-backup.log 2>&1
```

### Seed

`npm run seed` **refuses in production** unless `ALLOW_DEMO_SEED=1`. Demo passwords must never land on a live book.

## 2. Close proof

1. Upload a real month from the client's books (not `samples/`).
2. Gate must pass.
3. Write real WHAT_CHANGED commentary (draft placeholders are rejected).
4. Publish → client portal shows the freeze → Download PDF matches the release checksum.
5. Run `REQUIRE_STAFF_MFA=0 npm run proof` against a staging instance after seed.

## 3. Delivery

- **Portal PDF** — `GET /api/portal/pdf?periodId=…` builds from the active release snapshot.
- **Email** — Resend; HTML is escaped. Publish notifications and password resets.
- **QBO** — optional; set sandbox first, then `QBO_ENVIRONMENT=production`.

## 4. Scale / Postgres

**Runtime today is SQLite** with `synchronous=FULL`, WAL, and verified offline backups. That is the supported production path for a single-firm book.

Postgres tooling is ready for a cutover project:

```bash
DATABASE_URL=postgres://… npm run db:migrate-postgres
DATABASE_URL=postgres://… npm run db:verify
```

The app does **not** read `DATABASE_URL` at runtime yet. Do not point production at Postgres until a dual driver ships.

## Env checklist

Copy `.env.example` → `.env.local` (or host secrets) and fill:

```
AUTH_SECRET=
NEXT_PUBLIC_BASE_URL=https://…
BACKUP_DIR=/mnt/backups/ledger
REQUIRE_STAFF_MFA=1
RESEND_API_KEY=
RESEND_FROM=Hathorn Advisory <noreply@yourdomain>
# ENCRYPTION_KEY=
# QBO_*, ANTHROPIC_* optional
```

## Health

`GET /api/health` is `force-dynamic`. Expect `status: "ok"` with schema current, auth configured, and backups healthy (&lt; 26h old).
