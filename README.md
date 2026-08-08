# Hathorn Ledger

Internal advisory dashboard for Hathorn Advisory Group — call prep, portfolio triage, and storytelling for monthly advisory clients.

Stack: Next.js 14 App Router · TypeScript · better-sqlite3 · hand-rolled SVG charts.

## Run

```bash
npm install
cp .env.example .env.local   # then: openssl rand -base64 48 -> AUTH_SECRET
npm run seed
npm run dev
```

Open http://localhost:3000. Staff land on `/today`.

Seeded logins (password `ledger2026`):

| Role | Email |
|---|---|
| ADMIN | regen@hathornadvisorygroup.com |
| ADVISOR | jeremiah@hathornadvisorygroup.com |
| BOOKKEEPER | books@hathornadvisorygroup.com |

Example book after seed: **Northbridge Home Care** (anonymized home-care numbers) plus Lakeside Stays, Bright Path, and Impact 5 vertical demos.

```bash
npm run seed:book   # add synthetic clients for density testing
```

**Read `AGENTS.md` before changing anything.**

## Surfaces

- `/today` — what needs doing before the next calls
- `/portfolio` — the book, ranked by advisory urgency
- `/dash/*` — staff walkthrough for one client
- `/review/[periodId]` — write the story, lock for the call
- `/engagement` — discovery → cleanup → goals → sessions
- `/portal?client=` — staff preview of a **locked** statement (snapshot, not live tables)
