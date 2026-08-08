# Hathorn Ledger

Monthly financial advisory platform for Hathorn Advisory Group.

Stack: Next.js 14 App Router · TypeScript · better-sqlite3 · hand-rolled SVG charts.

## Run

```bash
npm install
cp .env.example .env.local   # then: openssl rand -base64 48 -> AUTH_SECRET
npm run seed
npm run dev
```

Open http://localhost:3000 and sign in as `regen@hathornadvisorygroup.com` / `ledger2026`.

Other seeded logins (same password): `jeremiah@` (advisor), `books@` (bookkeeper), `natosha@criterionihc.com` (client).

```bash
npm run seed:book   # add 20 synthetic clients for density testing
```

**Read `AGENTS.md` before changing anything.**
