# Hathorn Dashboard — Platform Review

**Prepared for the team review, 12 August 2026.**
Everything in this document is stated from the code as it stands, with the evidence
named. Where something is written but unproven, it says so — a confident claim about
untested code is worse than no claim.

---

## 1. What this is, in one paragraph

Hathorn Dashboard is the monthly financial statement and advisory platform for Hathorn
Advisory Group. A bookkeeper uploads the close, an automated **gate** refuses anything
that does not tie, an advisor writes the explanation and approves it, and the client
reads a branded statement in a portal. Around that spine sits the advisory work the firm
actually sells: which clients need attention this month, what changed and why, the
thirteen-week cash position, budget variance, commitments carried forward, tax and
technical research, and a close-management workspace. **Clients never open QuickBooks.
As far as they are concerned, this platform is the books.**

**The product thesis, which every design decision serves:** anyone can draw the chart.
The explanation is what the client is paying for. The commentary is set as editorial
prose with a rule down the left, not as dashboard callout boxes, because that is the
signature of the whole product.

---

## 2. The workflow

```
  bookkeeper            the gate              advisor              client
  ──────────            ────────              ───────              ──────
  upload the      →   validate that     →   write the       →   reads a branded
  close (CSV or       every number          explanation,         statement of only
  QuickBooks)         ties                  approve, publish     published months
                          │                        │
                    fails → GATED          publishes an
                    nothing proceeds       immutable release
```

**Period lifecycle:** `AWAITING` → (`GATED` if a check fails) → `IN_REVIEW` → `PUBLISHED`.
Correcting a published month is an **amendment** — a new version that supersedes the
previous one and records why. Superseded versions are kept forever. That is how
accountants already work, and the software does not invent a different model.

### What the gate actually checks

Named checks in `lib/gate.ts`, selected per industry profile:

| Check | Applies to |
|---|---|
| Revenue present · Cash balance present · Receivables reported | all |
| Every active entity reported | all |
| Margin within a plausible range | all |
| **Labor ties — *per entity*** | labour-based profiles |
| **Payroll sits inside direct cost — *per entity*** | labour-plus-materials profiles |
| Balance sheet balances · Cash ties to the bank balance | any client with a balance sheet |
| Occupancy within capacity | short-term rental |
| Enrolment within licensed capacity | childcare |
| Pass-through identified · Management bridge closes · Management revenue is a plausible share of gross | property management |
| Fee recovery reported | property management |
| Distributions recorded | NIL athlete |

The labour and receivable checks are named with the client's own language, so a childcare
statement says "enrolled children" where a home-care one says "hours paid". The management
bridge check compares derived management revenue against the revenue actually posted to
the ledger — an earlier version compared a figure against the expression it was derived
from, which is an identity that can never fail, and a check that cannot fail manufactures
confidence rather than providing it.

**The gate is the release authority.** Publishing re-runs it inside the transaction —
a verdict the browser showed thirty seconds ago is not evidence. There is no bypass, and
`assertEditable()` guards every write path against touching a published period.

### Three rules that make the numbers trustworthy

1. **A comparison that cannot be trusted is removed, not degraded.** Different accounting
   basis, different currency, an unpublished basis, or a period-length gap over 20% will
   suppress the comparison and explain why, rather than show a delta nobody should believe.
   Entity composition changes raise a warning — the client that opened a third business
   mid-year would otherwise read that as growth.
2. **Direction of favour follows the metric.** Overhead falling is good; revenue falling is
   not; a labour ratio has a floor *and* a ceiling. Movement below a materiality threshold
   renders grey and reads "flat", because colouring a $200 change green teaches people to
   ignore the colours.
3. **Confidence sits beside the figure and never touches it.** Revenue was $190.9K whatever
   the state of the books. What changes is what is reported next to it, and whether an
   unsound comparison is shown at all.

---

## 3. What is built

**Scale of the thing:** 57 pages, 63 API routes, 43 library modules, 70 components,
32 database migrations, 94 tables, roughly 52,000 lines of application code.

### The core spine — working end to end

| Area | What it does |
|---|---|
| **Upload & close** | CSV intake (P&L, payroll, AR, cash), atomic period replace, gate run, named results back to the bookkeeper |
| **The gate** | Named validation checks per industry profile; records its verdict on the period |
| **Review** | Advisor cockpit — gate panel, inline story editing, Approve & Publish |
| **Release** | One module may publish; a release is an immutable snapshot including branding and language |
| **Client portal** | Overview, Financials, Insights, Planning, Reports, Documents — each independently switchable per client |
| **Metrics engine** | One source of truth for every computed figure; batched queries, flat with history size |

### The advisory layer — working

Prior-year comparison · budget variance · balance sheet with working capital, current
ratio, debt-to-equity and debt service coverage · thirteen-week cash projection by ageing
bucket · action items that outlive the period with an ageing count.

### The practice layer — working

| Surface | Purpose |
|---|---|
| **Today** | One next action and a short queue. The advisor's arrival screen. |
| **Attention** (portfolio) | The whole book scored 0–100 for advisory urgency, every score decomposed into named reasons |
| **Clients** | The book by engagement lifecycle stage |
| **Dashboard** | Per-client staff views: overview, financials, businesses, cash, comparison, alerts, reports, vendors, metrics, volume, management basis, settings — plus two design prototypes (`overview-v2`, `command-center`) not yet promoted |
| **Close** | Close management and checklist |
| **Exceptions** | Firm-wide open work from reconciliations, documents, variance and close checks |
| **Reconciliations** | Deterministic tie-outs with AI analysis that cannot change a control total |
| **Documents** | Document intake and extraction; drafts never post |
| **Integrations** | Provider registry, sync history, connection states |
| **Intelligence** | Client financial intelligence overview |
| **Engagement** | Discovery, cleanup, goals, sessions — the lifecycle before advisory |
| **Planning / FP&A** | Scenarios and forecasts, shareable to the portal |
| **Tax** | Tax research workspace, no accounting mutation |
| **Guidance** | Source-backed accounting research |
| **Firm / Ops / Platform** | Firm settings, activity log, storage and backups, platform operations |
| **Ask Hathorn** | Grounded copilot over the firm's own data |

### Industry profiles

Ten: home care, childcare, short-term rental, **property management** (separate from
rental — book revenue can be five times management revenue), NIL athlete, professional
services, restaurant, contractor, retail, generic. Each declares its direct-cost model,
the tie-outs the gate applies, volume unit, collections behaviour, sections to show, and
language, so no copy reads generic.

The platform was built from one home-care client, which had made three things
accidentally universal: direct cost equals payroll, volume is hours, receivables are owed
by payers. The first was serious — under the old rule the gate would have blocked a
restaurant, a rental operator and a retailer from publishing a single period.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router, TypeScript | Server components; the financial math never reaches the browser |
| Styling | Tailwind + a locked type system (`app/globals.css`) | Hathorn v2026.1: Cormorant Garamond display, EB Garamond body, Libre Franklin labels, tabular figures everywhere |
| Database | **better-sqlite3** today, **Postgres** proven and ready | Hand-rolled data layer, raw prepared statements, no ORM |
| Auth | bcryptjs + jose JWT in an httpOnly cookie, TOTP MFA | Hand-rolled; survived adversarial testing |
| Charts | Hand-written SVG | No chart library — full control over typography and tabular figures |
| AI | Anthropic (optional) | Every feature degrades to deterministic output without a key |

**No ORM** was a forced choice originally (Prisma's binary CDN was blocked) that turned
out fine at this size. **No chart library** is deliberate and worth keeping: a library
would cost the typography, which is the product's whole visual argument.

### Security posture

- Sessions: JWT in an httpOnly cookie, `secure` in production, 8-hour expiry, token
  versioning so a password change kills live sessions.
- **MFA is implemented and required for staff in production by default**
  (`REQUIRE_STAFF_MFA`, defaults on when `NODE_ENV=production`). First login forces
  enrolment. Clients may enable it too.
- Passwords: bcrypt cost 12, minimum 10 characters, common passwords rejected. Login
  throttling per email; failed logins compare against a dummy hash so timing does not
  reveal whether an address is registered.
- Authorisation enforced twice: `middleware.ts` walls every guarded path, and each handler
  calls `requireRole`. APIs return 401/403 JSON — never a redirect, never a 500.
- QuickBooks tokens and MFA secrets encrypted at rest (AES-256-GCM), with key rotation
  support.
- Every outbound call has a deadline; anything metered is rate limited.
- **Row-level security in Postgres**, proven by execution (see below).
- Append-only audit trail of who touched what, readable from the Ops screen.

---

## 5. How complete is it — the evidence

Everything below was **executed today**, against the current build.

| Suite | What it covers | Result |
|---|---|---|
| `workflow-proof.sh` on **SQLite** | 22 sections: auth, role walls, the gate, publish, amendments, lock enforcement, upload, FP&A, documents, tax, guidance, reconciliation, integrations, close, tenancy, copilot, intelligence, client experience, staff shell, platform ops | **239 passed, 0 failed** |
| `workflow-proof.sh` on **Postgres** | the same suite against the Postgres runtime | **239 passed, 0 failed** |
| `rc-smoke.sh` on both engines | release-candidate smoke, incl. cross-firm isolation | **11 + 11 passed** |
| 13 unit suites | FP&A, documents, tax, research, reconciliation, integrations, close, tenancy, copilot, intelligence, client portal, ops, security | **168 passed, 0 failed** |
| `db:rls-proof` | Postgres row-level security, incl. pooled-connection context clearing | **13 passed, 0 failed** |
| `db:financial-proof` | recomputed financial totals across engines; release immutability under a $50K working mutation | **16 passed, 0 failed** |

**Total: 447 distinct assertions passing, with the main suite passing on both database
engines.** Typecheck and production build are clean.

### Performance, measured today

At demo scale (5 clients, 20 periods): median server response 12–29 ms across Today,
Attention, the client dashboard and the portal statement. Twenty concurrent portal loads
completed in 0.53 s wall, all 200s, slowest single request 504 ms — that tail is the
synchronous SQLite driver serialising requests inside one process, and it is the reason
Postgres matters at scale rather than a bug.

### Two documented limitations that are now out of date

`AGENTS.md` says Postgres "has never executed against a live server" and that there is no
MFA. **Both are stale.** Today the full application booted on Postgres with RLS active and
passed the entire suite, and MFA is implemented and on by default in production. The
briefing docs need correcting — noted in the actions below.

---

## 6. What is *not* proven

Be precise about this in the room. These are real gaps, not hedging.

| Item | State | What it needs |
|---|---|---|
| **QuickBooks Online** | Written against Intuit's documented shapes, unit-tested, **never run against live Intuit** — sandbox egress was blocked | One real connection. The first sync is where you learn whether the report JSON matches the parsing. |
| **Email (Resend)** | Integration written, opt-in, **never exercised** | An API key and one publish notification |
| **A real close** | Every number in the system is seeded demo data | Run one actual client month end to end. Worth more than another hundred assertions. |
| **Postgres at scale** | Proven functionally on a test database | A managed instance with backups, and a load test with real history |
| **The rendered UI on real devices** | Reviewed on desktop and phone by screenshot and recording; one iOS defect was reported by a human and fixed | More eyes on real hardware |
| **Vertical config in the client-facing components** | Profiles exist and the gate uses them; some portal copy is still home-care shaped | Wire `volume_unit` / `receivable_label` through the remaining components |

---

## 7. Blockers, in the order they have to be cleared

### 1. There is no trunk — this is the biggest one

`main` contains a single empty initial commit. **The entire product — 494 files, 78,000
lines — lives on a chain of 21 unmerged draft pull requests.** The good news is that the
chain is linear and the tip contains everything, so one merge collapses it. Until that
happens there is no single reviewable artifact, no branch protection worth anything, and
no safe way for a second person to contribute.

**Action:** merge the stack tip into `main`, then work in short-lived branches off it.

### 2. Nowhere to run it

The demo runs on a temporary tunnel out of a development sandbox and dies with the
session. Nothing is deployed. This is the blocker to Jeremiah using it for real work
rather than a walkthrough.

**Needs:** a host (Vercel or Fly are both fine for this shape), a managed Postgres, a
domain, `AUTH_SECRET` and `ENCRYPTION_KEY` in a secret store, `BACKUP_DIR` on a mounted
volume, and the cron entry for `npm run backup`.

### 3. No real client data has ever gone through it

Every figure is seeded. The first real close will surface things no test can: chart of
accounts that does not map cleanly, an entity structure the CSV format does not express,
a payroll register that does not tie the way the gate expects.

### 4. QuickBooks has never touched live Intuit

Until it does, the bookkeeper uploads four CSVs a month. That is a ten-minute manual step,
so it is a limitation rather than a stopper — but it is the difference between "a reporting
tool" and "connected to the books".

### 5. Operational unknowns

No monitoring or alerting beyond `/api/health`. No error tracking. Backups are implemented
and verified by test, but have never run on a schedule against a production volume.

---

## 8. What we are building next

**Before a real client**

1. **Trunk and deployment.** Merge to `main`, deploy to staging on managed Postgres, put
   backups on a schedule, turn staff MFA on.
2. **One real close, start to finish.** Pick the client with the cleanest books. Watch what
   the gate says about real numbers.
3. **First live QuickBooks connection.** Budget an hour for the report-shape mismatch.
4. **Email on.** Publish notifications are the thing that makes the portal feel alive.

**Before selling it**

5. **Server-side PDF.** Today it is `window.print()` with a proper stylesheet. A real
   server render is the right answer for a deliverable with the firm's name on it.
6. **Finish vertical config in the client-facing components** so a childcare statement never
   says "hours paid".
7. **Tax layer with teeth.** This is a CPA firm and there is nothing yet on estimates,
   reasonable compensation, or distributions planning. The research workspace exists; the
   client-facing advice does not.
8. **Row-level security everywhere, with the Postgres cutover.** Tenancy belongs in the
   database as well as the application code. The RLS policies already exist and pass their
   proof — extend and enable them by default.

**Deliberately not built, and worth defending in the room**

- **Self-service analytics for clients.** The curated story is the product. A client
  building their own pivot table is a different, worse product.
- **Auto-publish.** No period reaches a client without a human approving the language.
- **Peer benchmarking.** Theatre with one client, and it needs an engagement letter before
  it is anything else. If it ever happens, consent belongs per client, not per firm.
- **A single 0–100 grade shown to the client.** Good internal triage; telling an owner their
  business is a "C+" is a product decision with consequences.

---

## 9. Decisions we need from the team

1. **Host and database** — Vercel + Neon, or Fly + managed Postgres? This unblocks
   everything else.
2. **Which client goes first**, and are we prepared to run their close in parallel with the
   existing process for a month?
3. **Does the firm-wide activity log stay visible to advisors**, or become admin-only?
   It currently shows who touched what across the whole firm to any staff member.
4. **How much does the AI write?** The story agent drafts from deterministic signals and the
   advisor always edits and approves. That boundary is enforced in code and should stay,
   but the team should agree on it explicitly.
5. **Do we keep the client portal read-only?** Answering questions and uploading documents
   are already switchable per client, defaulting off.

---

## 10. Seeing it for yourself

```bash
npm install
cp .env.example .env.local     # then: openssl rand -base64 48 -> AUTH_SECRET
npm run seed                   # builds the demo book
npm run dev                    # http://localhost:3000
```

Demo logins, password `ledger2026` for all:

| Role | Email | Lands on |
|---|---|---|
| Admin | `regen@hathornadvisorygroup.com` | Today |
| Advisor | `jeremiah@hathornadvisorygroup.com` | Today |
| Bookkeeper | `books@hathornadvisorygroup.com` | Upload |
| Client | `owner@northbridge.example` | Portal |
| Second firm (isolation fixture) | `admin@example-cpa.test` | Today |

Run the suites before every commit:

```bash
npm run seed && npm run start & ./scripts/workflow-proof.sh   # 239 assertions
npm run seed && bash scripts/rc-smoke.sh                      # 11 assertions
```

**A five-minute walkthrough:** Today → Attention → open Northbridge → the month in review
→ write the commentary and publish → Client Experience → preview as the client.
