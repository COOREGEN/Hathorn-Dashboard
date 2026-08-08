# Hathorn Ledger

Client-facing financial dashboard platform for Hathorn Advisory Group's monthly advisory clients.
Clients never open QuickBooks — **this platform is the books as far as they're concerned.**
Working name "Hathorn Ledger"; swap when the real name lands.

## The product in one paragraph

Bookkeeper uploads the monthly close (4 CSVs) → the **gate** validates that every number ties
(nothing broken can ever reach a client) → the dashboard auto-builds → the advisor (Jeremiah)
edits the story notes and hits **Approve & Publish** → the client logs in and sees a branded,
five-section dashboard of only approved months. The workflow is:
**upload → gate → generate → approve → publish.**

## Non-negotiable product rules (decided with the founder — do not relax)

1. **Clients only ever see PUBLISHED periods.** Never drafts, never mid-close data.
2. **The gate is the release authority.** `approvePeriod()` re-runs the gate and throws if failing.
3. **No number appears twice** — each metric has one home on the five-section spine.
4. **Commentary must be specific** — a number, a cause, an action. No boilerplate.
5. **Brand colors are accent-only** — never full-page fills; themes consume tokens via CSS vars.
6. **Client portal is read-only** (Tier-1 interactivity: month selector, entity toggle). No
   self-service analytics, custom date ranges, or query builders — ever. The curated story IS the product.
7. Templates are a curated set (modern / editorial / executive). Adding a template is a design
   project, not a config option.

## The five-section spine (components/dashboard.tsx)

1 Overview (KPIs, goal strip, revenue trend, What Changed notes, entity cards)
2 Payroll & Labor (labor ratio vs target band, payroll composition)
3 Revenue Drivers (revenue by business by month, hours paid)
4 Cash & Collections (bank, AR aging by payer, Action notes)
5 Businesses (entity comparison table)

## Configuration

Copy `.env.example` to `.env.local`. Only two variables are required in production —
the app refuses to serve without them (`assertProductionReady()` in `lib/config.ts`,
called from the root layout, so a bad deploy fails on the first request rather than
silently signing sessions with a key that is published in this repo):

- `AUTH_SECRET` — `openssl rand -base64 48`
- `NEXT_PUBLIC_BASE_URL`

Everything else is an optional integration. Each is independently switchable and the
platform is fully functional with all three off; the admin board shows which are live.

| Integration | Variables | Off behaviour |
|---|---|---|
| Email | `RESEND_API_KEY`, `RESEND_FROM` | Sends are silent no-ops |
| QuickBooks | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT` | Bookkeeper uploads all four CSVs |
| Story agent | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Commentary drafts from threshold signals |

## Design system and client branding

**Hathorn's craft is the constant; the client's brand is the accent layer.** Typography,
spacing, rhythm and hierarchy are Hathorn v2026.1 on every statement — that is what a
client cannot get from a generic reporting tool. What the client controls is their mark
in the masthead and two accent colours on rules, charts and emphasis. Never a page fill,
never a background behind body text. Same rule Hathorn's own gold follows.

Type is locked to the standard (`app/globals.css`):
Cormorant Garamond for display at 16pt and up and never body · EB Garamond for editorial
body and all commentary · Libre Franklin for anything under 10.5pt plus every label,
eyebrow, caption and table header · tabular lining numerals on every figure.

The commentary is set as editorial prose with a rule down the left, not as dashboard
callout boxes. That is deliberate and is the signature of the whole product: anyone can
draw the chart, the explanation is what the client is paying for.

### Contrast (`lib/brand.ts`)

WCAG sets two bars and conflating them mangles brand colours for no accessibility gain:
small text needs 4.5:1, graphics and large text need 3:1. Criterion's real orange is
3.62:1 on ivory — fine as a chart bar, marginal as an 11px label. So every colour yields
two values: `--brand` / `--accent` are the client's exact colours for fills, rules and
the 34px figures, while `--brand-text` / `--accent-text` are darkened only as far as
small text requires. A client's colour is never altered where anyone would notice.

Colours too pale to survive even the graphics bar are deepened automatically and the
studio says so. Two colours within 1.6:1 of each other raise a warning, because charts
using both become unreadable. Invalid input falls back rather than crashing.

The brand studio (`components/brand-studio.tsx`, the Brand tab on a client page) shows a
live preview with the masthead, KPIs, a commentary note and a two-colour chart, so the
boundary between what the client controls and what they don't is visible while editing.

### Templates

Editorial (ivory paper, deepest contrast — the Hathorn signature), Modern (lighter
surfaces, more air), Executive (rules instead of panels, larger figures). All three share
the same type system; they change density and surface, not craft. Adding a template is a
design project, not a config option.

## Multi-tenancy

Every client is a separate tenant. A CLIENT user sees only their own published periods,
their own branding, and their own comment threads — enforced at the query level, not by
hiding UI.

**Role alone is never sufficient for a client-facing route.** Every CLIENT user carries
the CLIENT role, so a check that stops at "is this a client?" lets one tenant reach
another's data by guessing an id. Client-facing routes must resolve the requested row to
its owning client and compare against `session.clientId`. This is exactly the bug that
shipped in the first cut of `/api/comments` and was caught by an adversarial probe: one
tenant's owner could read and write another tenant's private threads. `authorizePeriod()`
in that route is the pattern to copy for any future client-facing endpoint.

Staff roles (ADMIN, ADVISOR, BOOKKEEPER) deliberately span all clients — one bookkeeping
team serves the whole book. If you ever assign bookkeepers per client, that scoping has to
be added; it does not exist today.

The suite keeps a permanent **cross-tenant attack probe** section that stands up a second
tenant and tries to read comments, post comments, read the QBO link, edit settings, open
the review screen, approve a period, redraft the story, and upload a close — all against
the first tenant, all expected to fail — then confirms the legitimate owner and the advisor
still have access. Add a probe here whenever you add a client-facing route.

## Comparability, metric direction, and confidence

Three ideas adopted from a parallel platform review, each fixing a real defect here.

### The comparability gate (`lib/comparability.ts`)

Two numbers can both be correct and still not be comparable. Before any period is
measured against another, the pair is checked and **a blocking issue suppresses the
comparison rather than degrading it** — a delta nobody should trust is worse present
than absent.

| Check | Severity | Why |
|---|---|---|
| Accounting basis | blocking | Cash and accrual measure different events |
| Currency | blocking | No silent translation |
| Basis not published | blocking | A draft is not a fact |
| Period length > 20% apart | blocking | Not a comparison, a ratio problem |
| Period length, smaller gap | warning | February against March is a 10.7% "decline" that is pure calendar |
| Entity composition change | warning | The one that invents growth |
| Not reconciled | warning | Complete is not the same as verified |

**Entity composition is the one that mattered most here.** Criterion opened an adult day
center mid-year. Every consolidated comparison spanning that month silently mixed a
two-business figure with a three-business one, and read the difference as growth. The
check names the business, explains that consolidated movement is not like-for-like, and
stops raising the objection once the reader scopes to a single entity.

When a length difference is flagged, a **per-day strip** appears — revenue and hours per
operating day — so the reader can see whether the business actually moved or the month
was just short. Year-over-year and year-to-date modes are exempt from length nagging,
because spanning a leap day is inherent to those comparisons, not a defect.

### Metric direction (`lib/metric-rules.ts`)

The old comparison took a `higherIsBetter` boolean per line. That boolean was the bug: it
cannot express a labor ratio.

**Labor ratio was scored lower-is-better, so a home-care agency falling from 68% to 55%
read as a large improvement.** It is not one. Below the band the agency is either not
delivering the hours it billed or costs are posting to the wrong account. Both extremes
are unhealthy, which is a *range*, not a direction.

Four directions now: `higher_is_better`, `lower_is_better`, `target`, `target_range`.
Range metrics (labor ratio, current ratio) judge movement *toward the band*, and crossing
from one side to the other is never an improvement even when the distance shrinks.

Every rule also carries **materiality**. Movement below it renders grey and reads "flat"
rather than being dressed as good or bad news — colouring a $200 change green teaches
people to ignore the colours. On a typical month this drops twelve coloured lines to
about five, which is the point.

### Confidence (`lib/confidence.ts`)

Confidence answers "how much should anyone rely on this", separately from "what do the
numbers say". Five components — close status, tie-out, reconciliation, completeness,
freshness, plus comparability when a comparison is in play — each with its own score and
a plain-language reason, so low confidence is actionable rather than just discouraging.
It surfaces as a persistent badge in the masthead that expands into the breakdown.

**Deliberate departure from the source design.** A common approach shrinks the score
toward neutral in proportion to confidence: `50 + (raw − 50) × c`. That is mathematically
honest and psychologically misleading — a failing business with poor books lands on
"average", and a reader who glances sees "fine" when the truth is "we don't know".

**Figures are never adjusted here.** Revenue was $96.1K whatever the confidence. What
changes is what sits beside it, and whether an unsound comparison is shown at all. A test
asserts the figures are untouched after confidence runs.

The gate now records its verdict on the period (`gate_pass`, `gate_detail`, `gate_run_at`)
so tie-out is a durable fact rather than something confidence re-derives.

## Period selection and comparison (`lib/comparison.ts`)

Any month in the client's history is one dropdown away, grouped by year so a long book
stays navigable. A second dropdown chooses what that month is measured against, and every
mode is computed from data already on the page — switching is instant, nothing round-trips.

| Mode | Question it answers |
|---|---|
| Prior month | Did the thing we discussed last month move? |
| Same month last year | Is this seasonal, or is it real? |
| Year to date vs last year | Are we on track for the year, ignoring one noisy month? |
| Budget | Did we hit the number we agreed? |

**Direction of favour follows the metric, not the sign.** Overhead falling is good;
revenue falling is not. A comparison table that colours every negative number red is
worse than no colours at all, so each line declares whether higher or lower is better.
Percentage metrics move in *points*, never in "percent change of a percent" — a labor
ratio going 78% → 80% is +2 points, not +2.6%.

`aggregate()` builds a synthetic period for year-to-date work and is careful about the
distinction that catches people out: **flows sum, stocks don't.** Revenue and payroll add
across months; cash and receivables are balances, so the aggregate takes the closing
figure. Summing twelve months of cash would produce a number that means nothing.

When a comparison has no basis — the earliest month has no prior month, a new client has
no prior year — the mode is marked unavailable in the picker and the section explains why
rather than rendering zeros that look like a collapse.

Each period carries its own advisory bundle (`advisoryByPeriod`), so switching to March
shows March's balance sheet and cash outlook rather than the latest month's. At ten
periods the portal payload is ~134 KB and five full renders take 359 ms.

## The advisory layer (`lib/advisory.ts`)

Four things separate a report from an advisory meeting, and all four are computed
server-side and rendered as their own sections:

**Prior year.** Month-over-month is misleading in a seasonal business. `yearOverYear()`
finds the same month a year earlier and the revenue chart overlays it as a dashed line.
Only published or in-review periods count as a comparison basis.

**Budget variance.** `budgetVariance()` compares actual to plan for the month and year to
date. Sign convention matters: over-budget revenue is favourable, over-budget cost is
not, and a variance report that shows both as a bare positive number is useless.

**Balance sheet.** `balanceSheet()` computes working capital, current ratio, debt-to-equity
and debt service coverage. The gate refuses to publish a sheet that doesn't balance, and
checks that balance-sheet cash agrees with the separately uploaded bank balance.

**Thirteen-week cash.** `cashOutlook()` projects collections by ageing bucket against
payroll and overhead. For a business paid on a three-week lag while payroll runs
fortnightly, a claims delay shows up here weeks before it reaches the P&L. Assumptions are
stated on the page; the disclaimer says it is a projection.

**Action items outlive the period.** `action_items` carries commitments forward with an
ageing count, so "we agreed this three months ago" is visible rather than lost. Closing an
item records which period it closed in, so resolved work is shown rather than vanishing.

Every client statement carries management-prepared, unaudited language in the footer.

## Security posture

- Sessions: JWT in an httpOnly cookie, `secure` in production, 8-hour expiry.
- Passwords: bcrypt cost 12, minimum 10 characters, must mix letters and numbers,
  common passwords rejected (`validatePassword` in `lib/auth.ts`).
- Login throttling: 8 failed attempts per email per 15 minutes, then 429. Failed
  logins compare against a dummy hash so response time doesn't reveal whether an
  address is registered.
- Authorization is enforced twice: `middleware.ts` walls every guarded path, and each
  handler calls `requireRole` which throws a typed `AuthError`. APIs return 401/403
  JSON — never a redirect, never a 500.
- OAuth state tokens are single-use and expire in 15 minutes.
- Security headers in `next.config.mjs`: CSP with `frame-ancestors 'none'`, HSTS,
  nosniff, referrer policy, no `X-Powered-By`.
- **QuickBooks tokens are encrypted at rest** (AES-256-GCM, `lib/security.ts`). A refresh
  token is standing read access to a client's books; a leaked database file must not carry
  usable credentials. Rows written before encryption still read, and re-encrypt on write.
- **Every outbound call has a deadline.** Node's fetch has no default timeout, so one hung
  upstream holds a request slot indefinitely. `fetchWithTimeout` wraps Intuit, Anthropic
  and Resend.
- **Rate limits on anything metered.** The story agent and QuickBooks sync call paid APIs
  from authenticated routes; a stuck retry loop must not be able to bill the firm.
- **A password reset ends live sessions.** `token_version` on the user row is bumped and
  checked on every request, so a valid signature is not enough if the password changed.
- Email sends outside the request path — a slow mail API must not make "Approve & Publish" hang.
- `/api/health` reports schema version and integration status without leaking client data.
- Schema changes go through `lib/migrations.ts`. Never edit a shipped migration, only append.
- **Still to do before real client financials:** managed auth (Clerk or Supabase) for MFA
  and account recovery, and Postgres for backups and to remove the synchronous-driver
  concurrency ceiling (see Performance).

## Storage

### Backups (`lib/backup.ts`)

A single database file with no copies is a countdown, not a strategy. Three rules:

**Snapshots use SQLite's online backup API, not a file copy.** Copying a live WAL
database produces a file that opens without complaint and is subtly wrong.

**A backup that has never been restored is a rumour.** Every snapshot is opened,
integrity-checked and row-counted before it is trusted, and one that fails is deleted
rather than kept — a bad backup is worse than none because it invites confidence.

**Restore closes the connection before swapping the file.** This one was found by testing:
replacing the file underneath an open handle leaves the connection pointing at an inode
that no longer exists, and every query afterwards fails with `disk I/O error` — a message
that gives no hint of the cause. `closeDb()` then a lazy reopen is the only safe swap in
a running process. Restore also snapshots the current state first, so a restore is itself
reversible.

Retention is grandfather-father-son: everything from the last week, one per day for a
month, one per month beyond. Enough to recover from "someone published the wrong month
three weeks ago" without keeping every file forever. It never prunes to zero.

```bash
npm run backup            # snapshot + prune; put this in cron
0 * * * * cd /srv/ledger && npm run backup >> /var/log/ledger-backup.log 2>&1
```

Admins get a Storage panel on the board: status, snapshot list, one-click snapshot and
verify. Restore requires typing the word RESTORE, because it replaces every client's data.
`/api/health` reports snapshot age so a stale schedule is visible without logging in.
`data/backups/` and every `*.db` are gitignored — snapshots are complete client financials.

### Moving to Postgres (`lib/postgres.ts`, `scripts/migrate-to-postgres.ts`)

```bash
DATABASE_URL=postgres://user:pass@host/ledger npx tsx scripts/migrate-to-postgres.ts
```

The migration is one transaction — a partial migration is worse than none because it
looks like it worked — and it verifies twice: row counts per table, then **recomputed
financial totals** compared between the two databases. Counts prove the data arrived;
only recomputing proves it arrived correctly. A type coercion turning 114.2 into 114
passes a count check and fails a client.

The schema is read from `sqlite_master`, **not from `schema.sql`**. That distinction was
another testing find: migrations create tables the file never learns about, so a schema
built from it would silently omit `assets`, `budget_lines`, `balance_lines` and
`action_items` — and the failure would only surface the first time someone uploaded a
balance sheet. A test now asserts every live table is either in `TRANSFER_ORDER` or
explicitly declared in `EPHEMERAL_TABLES` (OAuth state, login attempts, rate events — all
short-lived by design and deliberately not carried across).

**HONEST LIMITATION.** The SQL translation is unit-tested — placeholders, question marks
inside string literals, interval arithmetic, type mapping — but this adapter has never
executed against a live Postgres server. Run the migration against a staging instance and
check the verification output before pointing production at it.

## Performance

Measured at **100 clients × 12 months** (1,200 periods, 7,200 P&L lines, 3 MB database):

| Path | Before | After |
|---|---|---|
| Queries per 12-month portal render | 205 | **8** |
| Portal render (query layer) | 91 ms | **1.4 ms** |
| 100 sequential portal renders | 8,610 ms | **141 ms** |
| 30 concurrent HTTP portal loads | — | **1.16 s wall, 30/30 × 200** |

Two things got it there, both worth preserving:

**Batched queries.** `computePeriods()` fetches a fixed six queries for *any* number of
periods and assembles in memory, instead of looping periods × entities × categories. Query
count is now flat as history grows. The naive per-entity `SUM` shape is what cost 205
queries; don't reintroduce it. The admin board follows the same rule — three queries total,
not two per client.

**Indexes.** Every foreign key on a hot path is indexed in `lib/schema.sql`. Without them
SQLite full-scans; the original schema had none beyond the automatic unique constraints.

### The real ceiling

`better-sqlite3` is **synchronous** — every query blocks the Node event loop, so requests
serialize inside one process. At 1.4 ms per render that is fine for a hundred clients who
log in a few times a month, and comfortably fine for a single firm's book. It is not fine
for hundreds of simultaneous users or any long-running query.

Moving to Postgres removes that ceiling and is the same work as getting real backups, which
you need anyway. The schema maps across unchanged; `lib/db.ts` is the only file that has to
learn a new client, and `computePeriods()` gets faster still because Postgres can run those
six queries concurrently.

## Stack

- Next.js 14 App Router, TypeScript, Tailwind.
- **better-sqlite3** with a hand-rolled data layer (`lib/db.ts`, `lib/schema.sql`).
  Prisma was rejected only because its binary CDN was blocked in the build environment —
  migrating to Prisma/Postgres later is fine; the schema maps 1:1.
- Auth: bcryptjs + jose JWT in an httpOnly cookie (`lib/auth.ts`), role guard in `middleware.ts`.
  **TODO for production: swap to Clerk or Supabase Auth + real AUTH_SECRET env + MFA.**
- Charts: pure SVG in `components/charts.tsx`. No chart library. Keep it that way.

## Roles

| Role | Lands on | Can |
|---|---|---|
| ADMIN (Regen) | /admin | everything |
| ADVISOR (Jeremiah) | /admin | review, edit story, approve, view any portal |
| BOOKKEEPER | /upload | upload closes, see gate results |
| CLIENT | /portal | read their own published dashboards only |

## Key files

- `lib/metrics.ts` — the one source of truth for every computed number (`computePeriod`, `clientHistory`).
- `lib/gate.ts` — named validation checks; period lifecycle AWAITING → (GATED on fail) → IN_REVIEW → PUBLISHED.
- `lib/seed.ts` — Criterion In-Home Care demo: 3 entities, Jan–Apr 2026 published, May in review,
  4 users (password `ledger2026`). The dataset is fully reconciled; the gate passes every month.
- `app/api/upload/route.ts` — CSV parse → atomic period replace → gate → named results back to bookkeeper.
- `components/dashboard.tsx` — shared by portal and review; template themes in `app/globals.css`;
  brand tokens injected as CSS vars from the client record.
- `components/review-panel.tsx` — advisor cockpit: gate panel, inline note editing, Approve & Publish.
- `samples/*.csv` — a June 2026 close that passes the gate; used for demos and E2E tests.

## CSV formats (amounts in $K)

- `pnl.csv` — entity,category,label,amount (category: REVENUE | DIRECT_COST | OPEX)
- `payroll.csv` — entity,wages,ot_premium,taxes,workers_comp,processing,hours
- `ar.csv` — payer,b0_30,b31_60,b61_90,b90p
- `cash.csv` — operating,reserve
- Gate rule: per entity, DIRECT_COST must equal payroll composition within $0.5K.

## Testing

`./test.sh` runs a 94-assertion regression suite against a live server. It covers
happy paths AND the things that must NOT work. Run it before every commit:

```bash
npm run seed && npm run start &   # server on :3000
./test.sh                          # exits non-zero on any failure
```

Sections: configuration guard · authentication · role walls · client CRUD · the gate ·
publish lifecycle · client isolation (multi-tenancy) · comments · metrics integrity ·
cross-tenant attack probes · brand system · hardening · advisory depth · period comparison · comparability and confidence · auth hardening · storage and backups · QuickBooks · story agent · audit trail.
The suite creates a throwaway client and cleans up after itself.

**Currently: 136 passed, 0 failed.**

## Stress testing

`./stress.sh` is a separate adversarial suite — 58 assertions that try to break things
rather than confirm they work: injection, hostile strings, simultaneous writes, degenerate
numbers, oversized payloads, forged credentials, and empty states. Run it alongside the
regression suite.

Sections: injection and hostile input · malformed and degenerate data · concurrency ·
auth under attack · resource abuse · business logic abuse · empty and boundary states ·
data integrity sweep.

**Currently: 136 passed, 0 failed.**

Four real defects came out of the first run and are fixed:

1. **Duplicate client names leaked the schema.** A second "Duplicate Co" returned
   `UNIQUE constraint failed: clients.slug` to the browser. Slugs now auto-uniquify
   (`uniqueSlug` in `lib/validate.ts`) and constraint text never reaches a user.
2. **Malformed request bodies returned 500.** `null`, an array, or broken JSON produced
   an unhandled crash instead of a 400. `jsonObject()` guards every JSON route.
3. **Out-of-range periods were accepted.** Month 13 created a phantom period no calendar
   view could reach. Year and month are range-checked on upload.
4. **Auth and body parsing sat outside the try block** in the approve and upload routes,
   so any validation failure escaped as a 500. Both now parse inside the handler.

A design lesson also came out of it: invalid data was being *sanitised on read* rather
than *rejected on write*. A hostile brand colour rendered safely because the brand engine
validated hex, but the garbage still persisted — waiting for a future export or component
that forgets to check. Validation now happens at the write boundary.

Two findings were false positives in the test itself, worth recording so they aren't
"re-found": React escapes the XSS payloads correctly (the assertion grepped a substring
that appears inside the escaped entity), and formula-leading strings are correctly stored
verbatim because they are data. `spreadsheetSafe()` exists and is tested for the day
something is exported to CSV.

Notable invariants the suite locks down:
- APIs return 401/403 JSON, never a 500 or a redirect, when auth fails
- A client cannot reach another tenant's book even by passing `?client=other-slug`
- A period failing the gate cannot be published, even by an advisor
- A published period is locked from re-upload until explicitly unpublished
- YTD revenue and net income tie exactly to the reconciled source dataset
- Production refuses to start without a real AUTH_SECRET
- Weak passwords are rejected; repeated failed logins throttle per-email, not globally
- A forged OAuth state token cannot complete a QuickBooks connection
- Only ADMIN and ADVISOR can invoke the story agent, and never on a published period

## Roadmap (agreed phases — build in order)

- **Phase 1 — DONE.** Client admin CRUD (`/admin/clients/[id]` — settings, entities, users,
  goals), logo image upload, template + brand picker, unpublish flow on the review panel,
  PDF export via print stylesheet, admin-driven password reset.
- **Phase 2 — DONE.** KPI drill-downs (tap any Overview KPI for composition),
  comment threads per metric (`comments` table; client asks, advisor answers, email fires),
  publish + reply email notifications via Resend, logo rendering in the portal header.
- **Phase 3 — DONE.** QuickBooks Online OAuth (`lib/qbo.ts`). Pulls the P&L by class and
  the AR aging summary for a month and writes them straight into the period, then runs the
  gate so a mismatch against the uploaded payroll register surfaces immediately. Refresh
  tokens rotate on every use and are re-persisted. Managed from the Integrations tab on the
  client page. Payroll and hours stay CSV — Paycor and ADP APIs are partner-gated.
- **Phase 4 — DONE.** Story agent (`lib/story-agent.ts`). Detects signals deterministically
  first (revenue swings, per-entity moves, hours changes, labor band breaches, OT share,
  aged AR, AR-to-revenue, cash coverage, loss-making entities), then hands those to Claude
  with the client's standing goals and last month's commentary. The prompt's core instruction
  is to separate *timing* from *operational* — a claims lag and a staffing loss look identical
  on a chart and mean opposite things. Without an API key it still drafts from the signals
  alone. The agent drafts; the advisor always edits and approves. It never publishes.

## Not built (deliberately)

- **Self-service analytics for clients.** The curated story is the product. A client
  building their own pivot table is a different, worse product.
- **Payroll API integrations.** Partner-gated, and the CSV step is 10 minutes a month.
- **Auto-publish.** No period reaches a client without a human approving the language.

## Dev

```bash
npm install
npm run seed     # builds data/ledger.db with the Criterion demo
npm run dev      # http://localhost:3000
./test.sh        # 94-assertion regression suite (needs `npm run start` running)
```

Optional `.env.local` — email is opt-in and silently skipped without a key:

```
RESEND_API_KEY=re_xxxxx
RESEND_FROM=Hathorn Advisory <noreply@yourdomain.com>
NEXT_PUBLIC_BASE_URL=https://ledger.yourdomain.com
AUTH_SECRET=<a long random string — REQUIRED in production>
```

Logins (password `ledger2026`):
regen@hathornadvisorygroup.com (ADMIN) · jeremiah@hathornadvisorygroup.com (ADVISOR) ·
books@hathornadvisorygroup.com (BOOKKEEPER) · natosha@criterionihc.com (CLIENT)
