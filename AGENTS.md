# AGENTS.md

Briefing for anyone — human or AI — picking up Hathorn Dashboard.

Drop this in the repo root. Cursor, Claude Code, and Codex all read it automatically.
`CLAUDE.md` alongside it goes deeper on individual subsystems; this file is the map and
the rules. **`docs/PLATFORM-REVIEW.md` is the current state of the whole system** — what
is built, what is proven, and what is blocking a first real client.

Where this file and the code disagree, the code wins and this file is wrong: it has been
corrected three times already for exactly that reason.

---

## Run it

```bash
npm install
cp .env.example .env.local          # then: openssl rand -base64 48  -> AUTH_SECRET
npm run seed
npm run dev
```

`http://localhost:3000` — sign in as `regen@hathornadvisorygroup.com` / `ledger2026`.
Staff land on `/dash`; clients land on `/portal`.
Other seeded logins: `jeremiah@` (advisor), `books@` (bookkeeper),
`natosha@criterionihc.com` (client). Same password.

```bash
npm run start & npm run proof   # 239 assertions — the full workflow
npm run smoke                   #  11 assertions — release-candidate smoke
npm run backup                # verified snapshot + prune
```

**Re-seed between suites.** Several suites mutate the book — publishing, amending,
withdrawing — so a suite run against another suite's leftovers fails for reasons that are
interference rather than regression:

```bash
npm run seed && npm run proof    # then
npm run seed && npm run smoke
```

Thirteen more suites run offline against temporary databases, no server needed:

```bash
npm run tenancy:test && npm run security:test && npm run ops:test
npm run close:test && npm run recon:test && npm run integrations:test
npm run copilot:test && npm run intelligence:test && npm run client-portal:test
npm run fpa:test && npm run documents:test && npm run tax:test && npm run research:test
```

**On Postgres**, the same proof suite runs against the Postgres runtime, plus two
Postgres-only proofs:

```bash
POSTGRES_RUNTIME_ENABLED=1 DATABASE_URL=… npm run proof
npm run db:rls-proof          # 13 assertions — row-level security
npm run db:financial-proof    # 16 assertions — cross-engine financial parity
```

Both suites must stay green. If a change breaks one, the change is wrong until proven
otherwise — several of those assertions exist because something subtle broke once.

---

## What this is

A monthly financial statement platform for Hathorn Advisory Group. A bookkeeper uploads
a close, an automated gate refuses anything that doesn't tie, an advisor writes the
explanation and approves, and the client sees a branded statement in a portal.

**The product thesis, which everything else serves:** anyone can draw the chart. The
explanation is what the client is paying for. Design and code both privilege the
commentary over the visuals — that is deliberate, not an oversight.

Stack: Next.js 14 App Router · TypeScript · better-sqlite3 · bcryptjs · jose · pure SVG
charts. No ORM (Prisma binaries were blocked and never re-added; raw prepared statements
are fine here). No chart library.

---

## Ground rules

These are not style preferences. Each one exists because ignoring it produced a real
defect during the build.

**1. Never let a wrong number reach a client.** The gate (`lib/gate.ts`) is the release
authority — labor ties to payroll, the balance sheet balances, balance-sheet cash agrees
with the bank. Do not add a bypass. Do not make a check advisory "for now."

**2. A comparison that can't be trusted is removed, not degraded.** Blocking
comparability issues suppress the comparison and explain why. A delta nobody should
believe is worse present than absent.

**3. Confidence never touches the figures.** Revenue was $96.1K regardless of how good
the books are. Confidence sits *beside* the number. Do not implement shrink-toward-neutral
(`50 + (raw − 50) × c`) — it makes a failing business with poor data read as "average,"
which is the exact misreading the feature is supposed to prevent.

**4. Direction of favour follows the metric.** Overhead falling is good; revenue falling
is not; a labor ratio has a floor *and* a ceiling. Never add a `higherIsBetter` boolean —
that boolean was the bug. Use `lib/metric-rules.ts`.

**5. Flows sum, stocks don't.** Year-to-date adds revenue and payroll; it takes the
*closing* figure for cash and receivables. Summing twelve months of bank balance produces
a number that means nothing.

**6. Percentage metrics move in points.** 78% → 80% is +2 points, not "up 2.6%."

**7. Validate on write, not on read.** Sanitising at render leaves garbage in the
database for the next component that forgets to check. `lib/validate.ts` guards the
boundary.

**8. Typography is locked.** Hathorn v2026.1: Cormorant Garamond display ≥16pt only,
EB Garamond editorial body, Libre Franklin for anything <10.5pt and all labels, tabular
lining numerals on every figure. Client brand is an *accent layer* — their mark and two
colours on rules and charts, never a page fill. Do not introduce Inter or a system sans.

**9. Every figure is tabular.** `font-variant-numeric: tabular-nums lining-nums`.
Jittering digits in a financial column read as amateur.

---

## The portfolio (`lib/portfolio.ts`, `/portfolio`)

**The screen that makes advisory scale.** One question: which of these clients needs me
this month? Advisors land here, not on a client dashboard.

Every client is scored 0–100 for advisory urgency and banded urgent / watch / steady. The
signals are things the platform already computes and a pure reporting tool does not have:

| Signal | Weight | Why it ranks where it does |
|---|---:|---|
| No close on record | 25 | Every view is empty until a month closes |
| Close overdue | 22 | Advice cannot run ahead of the books |
| Gate failing | 20 | The numbers on screen are not trustworthy yet |
| Cash projected negative | 20 | |
| Revenue collapse (−25%+) | 16 | |
| Loss-making month | 14 | |
| Thin cash cover (<6 weeks) | 12 | |
| Low confidence (<60%) | 10 | |
| Commitment open 3+ months | 9 | Follow-through is the advisory product |
| Metric outside an agreed target | 7 each, capped at 21 | |

**Every score decomposes into named reasons with detail.** A bare "attention: 62" is a
horoscope — the advisor has to read the reason and be able to disagree with it.

**Metrics with no agreed target are excluded from scoring.** Otherwise the invented-number
problem simply moves to a new screen: a client would be ranked urgent against a band
nobody set.

Tags, industry and band filter the book, and **cohort statistics follow the filter** so
like is compared with like — filtering the demo book to "Monthly advisory" moves the median
net margin from 36.5% to 29.8%. Sorts include steepest decline, fastest growth, and weakest
evidence, which are the three questions that actually start a conversation.

Clients and bookkeepers cannot reach `/portfolio`. It is the firm looking at itself.

## The metric registry (`lib/kpi-registry.ts`, `lib/formula.ts`)

**Hardcoded verticals were the wrong shape**, and the objection that broke them is the
right one: *where did those numbers come from?* I invented them. An invented band is worse
than no band — it looks authoritative and nobody can defend it.

The model, which follows what Fathom and Syft actually do:

- **Metrics are formulas over named inputs**, held in a firm-level library. Adding one
  needs no code: `grossProfit / revenue * 100`, `revenue / hoursPaid * 1000`.
- **Inputs** come from the ledger (revenue, payroll, balance sheet, volume, period length)
  and from `kpi_inputs` — operational data the ledger does not carry, like headcount or
  units. Most genuinely useful ratios need one of each.
- **Targets live on the client, never in the definition**, and every one records where it
  came from: `AGREED` with the client, `DERIVED` from their own trailing history,
  `BENCHMARK` from a documented external source, or `NONE`.
- **`NONE` produces no verdict.** The metric is reported without judgement. That is the
  honest state for a new engagement and the UI says so plainly: "Reported, not judged".
- **Derived targets** are the interquartile range of the client's own last six-plus closed
  months. "Normal for you is 68–74%" is defensible; "the industry does 65–72%" invites the
  question of whose data.

**Verticals survive as presets** — a selection and a priority, never a target. That a
rental operator should watch occupancy and home care should watch the hourly rate is
structural and requires no benchmark. That childcare labour "should be" 45–55% does, and
is not shipped.

**The formula evaluator is a hand-written parser, not `eval`.** Formula text is authored by
users and stored in the database, so an eval would be a code execution path straight
through the metric editor. It understands arithmetic and nothing else — no calls, no
property access, no reachable globals. Tests probe all three.

Division by zero and missing inputs return **null, not zero**. A startup with no revenue
has no margin; showing 0% is a number an owner would act on.

## Verticals as presets (`lib/verticals.ts`)

The platform was built from one home-care client, which made three things accidentally
universal that are not: **direct cost equals payroll**, **volume is hours**, and
**receivables are owed by payers**. The first was the serious one — the gate would have
blocked a restaurant, a rental operator and a retailer from publishing a single period,
because none of them has direct cost equal to payroll.

Nine profiles: home care, childcare, short-term rental, NIL athlete, professional
services, restaurant, contractor, retail, generic. Each declares:

- **Direct cost model** — labour only, labour plus materials, cost of goods, property costs, or none
- **Tie-out rules** the gate applies, selected from a named set
- **Bands** that carry an opinion (home care labour 65–72%, childcare 45–55%, rental occupancy 60–80%)
- **Volume unit** — hours, nights, enrolled children, jobs, covers
- **Collections behaviour** — the ageing curve and immediate share driving the cash projection
- **Sections** to show or hide, and **language** so copy never reads generic

**The bands are the product.** A configurable ratio with no default is a form field —
it hands the judgement back to the client, which is the work the firm is paid for. The
vertical supplies the opinion; the client record overrides it where a business genuinely
differs.

**NIL athletes are an entity type, not an industry.** No direct cost, no balance sheet,
personal finance instead — tax reserve and savings rate, not margin. Bending the business
profile to fit would have produced a wrong statement.

Seeded demos prove it rather than assert it: Lakeside Stays (rental, no payroll at all)
and Bright Path (childcare, enrolment-driven). A test asserts the rental would have been
blocked under the old rule and publishes under the new one.

**Cash cover ranges 6.8 to 28.8 weeks across the three** — same code, different collections
assumptions. Medicaid pays slowly and denies aged claims; Airbnb remits in days.

### Property management is not short-term rental

Two profiles, deliberately separate, because the economics do not transfer.

An **owner-operator** (`short_term_rental`) owns the property: booking revenue is theirs,
cleaning and platform fees are the cost, mortgage is below the line.

A **property manager** (`property_management`) runs buildings for owners. Gross bookings
flow through their account but are not their revenue — tax is remitted to the state, the
balance is disbursed to owners, and they keep a management fee. **Book revenue can be five
times management revenue.** Report the gross figure and the owner thinks the business is
enormous; report only the fee and it will not tie to the return.

`lib/management-basis.ts` builds the bridge — gross bookings, pass-through by kind
(sales tax, occupancy tax, owner disbursement, reserve), management revenue, operating
expense, management NOI — and the gate refuses to publish if it does not reconcile.

**The reconciliation had to be rewritten once.** The first version checked that
`gross − passthrough − expense = managementNOI`, which is an identity: NOI is *derived*
from that expression, so the gap was always zero and the check could never fail. A check
that cannot fail is worse than no check — it manufactures confidence. It now compares
derived management revenue against the revenue actually posted to the ledger, which come
from different places, so a missing or double-counted pass-through category shows up. A
test injects a $9.4K error and asserts the gate blocks.

Two things this vertical surfaces that a normal P&L hides:

**Fee recovery.** Fees billed, collected, and what the service cost. A manager charging a
$150 cleaning fee against $168 of cleaner cost loses money on every turn, and it is
invisible because the two sides land in different accounts. Usually the fastest margin
available — raising the fee requires no new bookings.

**Channel mix.** Gross and fee by platform, blended rate, and concentration. Shifting ten
points from a 15% platform to direct booking beats most cost cutting, and 60%+ through one
platform is exposure to that platform's terms.

## Security headers that break the dev server

The CSP was written for production and silently broke `next dev`. The dev compiler uses
eval-based source maps and a websocket for hot reload; `script-src 'self' 'unsafe-inline'`
blocks both. **Nothing fails loudly** — the page renders, the API works, and no client
JavaScript executes, so every button is dead with nothing in the server log. It presented
as "the sign-in button doesn't work" while the login endpoint was returning 200.

`next.config.mjs` now adds `'unsafe-eval'` and `ws:` **only when `NODE_ENV !== production`**.
A test asserts dev has them and production does not.

Same root cause as the seed bug below: **every test ran `npm run start`.** Nothing exercised
the one command a developer uses every day. When adding anything that behaves differently
between dev and production — headers, cookie flags, caching — assume it is broken in the
mode you did not test.

## The bug that only a clean checkout finds

`npm run seed` failed on the first machine that was not mine, twice over:

1. **`data/` did not exist.** better-sqlite3 will not create a missing parent and fails
   with "directory does not exist", which gives no hint that a `mkdir` was all it needed.
2. **The seed only applied `schema.sql`, never the migrations.** Every table added since the
   baseline — budgets, balance sheets, volume, the metric registry, tags — exists solely as
   a migration, so a clean checkout died on "no such table: budget_lines".

Neither surfaced during the build because the container's database had been created and
migrated long before. **511 tests all ran against an already-seeded database, so not one of
them could see it.** A new developer could not start the project at all.

`npm run proof` now has a CLEAN CHECKOUT section that seeds into a fresh `DATA_DIR` and
asserts every migrated table exists afterwards. Anything that only works on a machine with
history gets caught there.

The same reasoning applies to any future setup step: if it depends on state a running
machine already has, it needs a test that starts from nothing.

## Release authority (`lib/release.ts`)

**One module decides whether a period may be published, and it is the only thing that can
publish.** Every surface — button, export, scheduled job, email — calls it. Duplicated
publish logic is how a system ends up with a path that skips a check nobody remembers.

Two rules make this different from a status flag.

**Evaluate again inside the transaction.** A browser verdict from thirty seconds ago is not
evidence. Data can change between the advisor seeing a green gate and pressing publish, and
two advisors can press it at the same moment.

**A release is an immutable snapshot.** Previously "published" was a column while the
figures stayed in editable tables, so a statement a client had already read could silently
change — someone corrects a payroll line in September and the June statement becomes a
different document. There was no answer to "what did you send me". A release now freezes
the entire statement, including branding and the language it was published under, and
client-facing surfaces read the frozen copy. Verified: editing the ledger by $50K does not
move the published figure.

**Correcting a published month means an amendment** — a new version that supersedes the
previous one and records why. The reason is required. Superseded versions are kept forever,
never deleted. That is how accountants already work, and the software should not invent a
different model.

`assertEditable(periodId)` is the guard every write path must call. Upload already refused
to overwrite a published period, but that was one check on one route; anything else that
writes would have gone straight through.

**A derived identity that cannot fail is not a control.** Checking `gross − passthrough −
expense = NOI` when NOI is derived from that expression proves nothing. This shipped once
in the management bridge. Any tie-out must compare against an independently sourced figure.

## Two surfaces, one engine

**Clients get a statement. Staff get a dashboard.** Same figures, same engine, different
shape — because they are different jobs. Natosha needs one calm narrative document each
month; Jeremiah needs cross-month navigation, alerts and a vendor tab. Collapsing them
into one screen makes it worse for both.

- `/portal` — the client statement. Editorial document, one month, commentary-led.
- `/dash` — the staff tool. Rail, eight views, period and entity controls in the topbar.

**Dashboard state lives in the URL**, never in component state. `?client=&month=&entity=&mode=`
means a link to a specific month of a specific client on the Cash view is something you
can paste into Slack. View state would make every one of those a screen-share.

Views: Overview · Financials · Businesses · Cash · Comparison · Alerts · Reports · Vendors.
Alerts are derived live from the engine — labor band breaches, loss-making entities, aged
AR, comparability issues, confidence gaps and open commitments — never a hand-kept list.

Two views are deliberately empty in places. **Vendors** has no data because vendor
concentration needs transaction-level detail the monthly close doesn't carry; it arrives
with QuickBooks. **Position** disappears when a period has no balance sheet. Both say so
and name what unlocks them, rather than rendering a figure nobody should trust.

**The dashboard defaults to the most recent period with figures**, not the newest row.
Landing an advisor on an empty draft month hides the real state of the book one dropdown away.

### A guard is only real if the matcher knows about it

Next requires `config.matcher` in `middleware.ts` to be a static literal, so it cannot be
derived from `GUARDS`. Two lists that must agree and nothing checking they do — a client
briefly reached `/dash` because the guard existed and the matcher didn't list it. The proof
suite now asserts every guarded prefix has a matcher entry. **Add to both, always.**

## Map

```
lib/
  db.ts            connection singleton, closeDb(), structured log()
  migrations.ts    numbered, append-only. NEVER edit a shipped migration.
  schema.sql       base tables. NOTE: migrations add tables this file never learns about.
  metrics.ts       computePeriod/computePeriods — batched, 6 flat queries
  gate.ts          release authority; persists its verdict to the period
  comparison.ts    period comparison, all modes
  comparability.ts the gate on comparisons themselves
  metric-rules.ts  what "better" means per metric, incl. target ranges + materiality
  confidence.ts    evidence strength, reported separately from performance
  advisory.ts      prior year, budget variance, balance sheet, 13-week cash, actions
  brand.ts         client accent palette + WCAG contrast (3:1 graphics, 4.5:1 text)
  auth.ts          JWT sessions, token versioning, role walls
  security.ts      AES-256-GCM at rest, fetch timeouts, rate limits
  backup.ts        online snapshots, verify, retention, restore
  postgres.ts      SQL translation + migration path  ⚠ never run against a live server
  validate.ts      write-boundary validation
  qbo.ts           QuickBooks OAuth + sync  ⚠ never run against live Intuit
  story-agent.ts   drafts commentary; falls back to deterministic signals without a key
  reconciliation/  deterministic payroll / AR / debt tie-outs + exceptions
                   (tolerance ≠ financial-statement materiality; never posts GL)

app/
  portal           client view (published periods only)
  review/[id]      advisor cockpit — gate panel, story editor, approve
  admin            the book; /admin/clients/[id] full CRUD + Brand + Storage
  upload           bookkeeper CSV intake
  reconciliations  staff-only control vs supporting schedule pack
  api/…            guarded by middleware.ts
```

**Roles:** ADMIN · ADVISOR · BOOKKEEPER · CLIENT. `middleware.ts` guards every route —
pages redirect (307), APIs return 401/403 JSON, never a 500.

**Tenancy** is enforced in application code and covered by 13 permanent adversarial
probes. A cross-tenant read bug shipped once in this codebase; the probes exist so it
can't return.

---

## Decisions that look like bugs and aren't

Do not "fix" these without reading the reasoning.

**No ORM.** Prisma binaries were blocked. Raw prepared statements throughout. Fine at
this size and the migration path to Postgres is already written.

**`data/` is a real directory in the container.** Ephemeral. `BACKUP_DIR` should point at
a mounted volume in production.

**Email is fire-and-forget.** A slow Resend call used to make "Approve & Publish" hang in
front of an advisor. Publishing must not depend on mail delivery.

**`restoreBackup` closes the connection before swapping the file.** Replacing a SQLite
file underneath an open handle produces `disk I/O error` on every subsequent query, with
nothing in the message pointing at the cause. Do not "simplify" this.

**Postgres schema is read from `sqlite_master`, not `schema.sql`.** Migrations create
tables that file never learns about; building from it silently omits `assets`,
`budget_lines`, `balance_lines`, `action_items`. A test asserts every live table either
transfers or is declared ephemeral.

**Charts are hand-rolled SVG.** Deliberate — full control over type and tabular figures.
They now have hover, crosshair, tooltips and keyboard-reachable data points. Swapping in
a chart library would cost the typography.

**Advisory is computed per period, not once.** Switching to March must show March's
balance sheet, not the latest month's.

**Storage tests run last.** The restore test rolls the database back and would undo every
prior section's teardown.

**Backup and restore are not in the main suite.** They are exercised by `npm run
restore-check` and `npm run restore:drill`, which are deliberate, offline operations.

---

## What is verified, and what is not

Be precise about this. 447 passing assertions are real evidence and they are not the
same as production use.

**Verified by execution:** the gate, all metric math, comparison across every mode,
comparability, confidence, role walls, cross-tenant isolation, session revocation,
encryption round-trip, rate limits, backup create/verify/prune and restore drills,
retention windows, CSV parsing, injection and malformed-input handling, concurrency,
empty states.

**Also verified, contrary to what this file used to say:**
- **Postgres runs the whole application.** `POSTGRES_RUNTIME_ENABLED=1` with a
  `DATABASE_URL` boots the app on `lib/db-pg.ts`, and the entire 239-assertion proof suite
  passes against it, alongside `db:rls-proof` (13) and `db:financial-proof` (16).
  **One gap remains before cutover: `runMigrations()` is called on the SQLite path only**,
  so a new migration has no automatic Postgres apply path.
- **MFA exists.** TOTP with backup codes, encrypted secrets, and `REQUIRE_STAFF_MFA`
  defaulting on in production with forced enrolment at first login. Managed auth (Clerk or
  Supabase) is still not integrated; that is a different question from having MFA.

**Written and unit-tested but never run against the real thing:**
- **QuickBooks.** OAuth and sync are written against Intuit's documented shapes. Sandbox
  egress was blocked. The first real connection is where you find out if the report JSON
  matches the parsing. Budget an hour.
- **Email.** Resend integration is opt-in and unexercised.
- **Every LLM path.** The story agent, copilot, tax and research drafting have never called
  Anthropic here. What the suites exercise is the deterministic fallback each one degrades
  to without a key — which is worth knowing: the product works with the model switched off.

**Deliberately disabled, each with a working native substitute:** Docling document parsing
(`DOCUMENT_INTELLIGENCE_ENABLED`), Forge FP&A (`FORGE_ENABLED`), the IRS Fact Graph
(`IRS_FACT_GRAPH_ENABLED`) and RAGFlow retrieval (`RAGFLOW_ENABLED`).

**Seen by a human:** the staff shell, Today, Attention, the client dashboard, the portal
and the mobile drawer have all now been looked at on screen and on a phone, and several
defects were found and fixed that way. Print output and dark mode still have not been.

---

## Backlog, in order

**Before a real client**
0. **Merge to `main`.** It is still an empty initial commit; the product lives on a stack
   of unmerged branches. Nothing else on this list is safe until there is a trunk.
1. Deploy somewhere permanent, on managed Postgres, with `npm run backup` and
   `npm run jobs:tick` on a schedule — there is no in-process scheduler by design.
   Close the Postgres migration gap first (see above).
2. Run a real close through it. Actual numbers, not the seed. Worth more than another
   hundred assertions.
3. First live QuickBooks connection.
4. Account recovery. MFA is done; the hand-rolled JWT still has no self-service recovery
   path, which is the remaining argument for managed auth (Clerk or Supabase).

**Before selling it**
5. Server-side PDF. Currently `window.print()` with a proper stylesheet. A WeasyPrint-style
   server render is the right answer for a Forbes-tier deliverable — the pipeline exists
   elsewhere in the practice.
6. Vertical config. Sections on volume drivers and receivables are home-care shaped.
   Migration 8 added `vertical`, `volume_unit`, `receivable_label`; the components don't
   read them yet. Until then this is a home-care product — which may be the better
   strategy anyway.
7. Row-level security on by default with the Postgres cutover. The policies exist in
   `docs/postgres-rls.sql` and pass their proof; on SQLite there is no database-level
   isolation at all, so today tenancy rests entirely on application code.
8. Tax layer. You're a CPA firm and there's nothing on estimates, reasonable comp, or
   distributions.

**Deliberately not built**
- **Peer benchmarking.** Theatre with one client, and it needs an engagement letter before
  it's anything else. If it happens later: consent belongs per *client*, not per firm.
- **A single 0–100 score.** Good internal triage across a book. Grading a client's
  business "C+" to their face is a product decision with consequences.

---

## Working style

Direct at a high level; execute without asking permission on implementation details.
Self-audit before delivering. Say plainly what was verified and what wasn't — a confident
claim about untested code is worse than no claim.

When something is wrong, say so and fix it rather than working around it. Several of the
best changes in this codebase came from a test failing and the failure being real.
