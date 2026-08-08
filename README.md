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

**Read `AGENTS.md` before changing anything.**
