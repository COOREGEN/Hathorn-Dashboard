# Hathorn Dashboard — Full System Audit

**Date:** 2026-08-11  
**Branch audited:** `cursor/activity-audit-monitor-c8e9` (includes Client Intelligence UX stack)  
**Environment:** Local SQLite production build (`npm start`), `REQUIRE_STAFF_MFA=0`, `ENABLE_MOCK_INTEGRATION=1` for hub proofs  
**Scope:** Backend · Frontend · UX/UI · Auth/tenancy · Feature inventory · Stress / regression execution  

---

## Executive verdict

| Area | Grade | One-line |
|---|---|---|
| **Financial spine** (upload → gate → release → portal) | **A** | Hardest product rules enforced and proven live |
| **Auth & role walls** | **A−** | Strong middleware + handler checks; `/api/assets` is handler-only |
| **Multi-tenant isolation** | **A** | Firm A ⇄ Firm B probes pass after clean seed |
| **Staff workflow modules** | **A−** | Close, recon, docs, tax, research, FPA, integrations all unit + workflow green |
| **Client portal** | **B+** | Polished statement; Tier-1 drift (insights Q&A, uploads, optional Ask) |
| **UX craft (production surfaces)** | **A−** | Typography lock + editorial notes hold; dual IA density |
| **Intelligence prototypes** | **B** | Real math, parallel chrome; not production Overview |
| **Ops / activity monitor** | **B+** | New audit trail readable; stuck SYNCING is a real ops footgun |
| **External integrations** | **C+ (honest)** | Code + mock hub proven; live QBO / Resend / Postgres E2E **not** claimed |
| **Overall readiness** | **B+ / soft launch** | Safe for advisory demo & internal use; not “unverified claims = production” |

**Bottom line:** This is a serious advisory platform, not a thin dashboard. The release authority and tenant walls are the strongest parts. The risk is product sprawl (many modules) and claiming live Intuit/Postgres/email readiness that the suite does not prove.

---

## What was executed (evidence)

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| Unit domains (14 scripts) | **167 passed, 0 failed** |
| `npm run smoke` (after clean seed) | **11 / 11** |
| `npm run proof` (workflow-proof.sh) | **217 / 217** |
| Adversarial HTTP battery | **24 / 25** (1 soft: array body login → 401 not 400) |
| Browser visual spot-check | **PASS** (10 screenshots under this folder) |
| Prior browser QA (`00-QA-SUMMARY.txt`) | Aligns (portal/dash/today/access control) |

**Unit breakdown:** security 9 · tenancy 10 · ops 17 · copilot 20 · intelligence 23 · client-portal 8 · close 11 · recon 12 · documents 11 · tax 10 · research 11 · fpa 12 · integrations 13.

**Important test hygiene finding:** An interrupted Integration Hub sync left `integration_connections.status=SYNCING`, which made the next workflow run fail mock sync until cleared. After `npm run seed` + `ENABLE_MOCK_INTEGRATION=1`, the full 217-assert proof was green. **Stuck SYNCING without auto-recovery is a real defect.**

**Smoke flake (pre-reseed):** Firm B login missing when DB lacked Example CPA seed → false “isolation failure” (401). Clean seed restores the fixture.

---

## Feature possibility map — everything this system can do

### A. Core monthly advisory loop (the product)

1. **Bookkeeper CSV upload** (`/upload`) — P&L, payroll, AR, cash → atomic period replace → **gate**
2. **Gate** — vertical-aware tie-outs; fail blocks publish
3. **Advisor review** (`/review/[periodId]`) — gate panel, story notes, story agent draft, Approve & Publish
4. **Immutable release** — snapshot freezes figures + branding + language; amendments with required reason
5. **Client portal** — published periods only; branded five-section statement; print/PDF
6. **Unpublish / revoke** — staff can pull a published month back
7. **Commentary rules** — editorial notes (number · cause · action), not callout spam
8. **Metric comments** — client asks / advisor answers with optional email

### B. Comparison, confidence, advisory depth

9. Period picker + comparison modes: prior month · same month LY · YTD · budget  
10. Comparability gate (basis, currency, length, entity composition) — blocks bad deltas  
11. Confidence badge (never mutates figures)  
12. YoY overlay, budget variance, balance sheet ratios, 13-week cash outlook  
13. Action items that age across periods  
14. Per-day strip when period length differs  
15. Metric direction: higher/lower/target/target_range + materiality  

### C. Verticals & KPI registry

16. Industry presets (home care, childcare, STR, property management, NIL, services, restaurant, contractor, retail, generic)  
17. Direct-cost models + selective gate rules (rental can publish without payroll tie)  
18. Management-basis bridge (property manager gross → fee NOI) + fee recovery + channel mix  
19. Formula-based KPI library (no `eval`)  
20. Client targets: AGREED / DERIVED / BENCHMARK / NONE (“reported, not judged”)  
21. Volume units by vertical (hours, nights, enrolment, …)  

### D. Staff command surfaces

22. **Today** — personal briefing / next actions  
23. **Portfolio / Attention** — urgency 0–100 with named reasons; filters & cohort stats  
24. **Clients** list + **Admin client page** — entities, users, goals, brand studio, integrations tab  
25. **Dash** URL-state tool: Overview · Financials · Businesses · Cash · Comparison · Alerts · Reports · Vendors · Metrics · Volume · Management · Settings  
26. **Ask Hathorn** — grounded copilot (staff); read-only tools; refuses invention  
27. **Intelligence** — trends, anomalies, profitability, cash/forecast signals  
28. **Client Experience** — curate portal modules, insights, reports, doc requests, preview-as-client  
29. **Engagement** — discovery / cleanup / goals / sessions  
30. **Planning / FP&A** — native forecast scenarios + AI explanation (never posts to books)  
31. **Documents** — upload, classify/extract, approve drafts (never auto-post actuals)  
32. **Tax** — issues, Sec.179 rule, scenarios, analysis requiring professional review  
33. **Guidance / Research** — source-backed accounting research; balanced JE check  
34. **Reconciliations** — payroll/AR/debt packs, exceptions, AI draft that cannot change controls  
35. **Close automation** — checklist, readiness, waive (advisor), exceptions board  
36. **Integrations hub** — QBO / file / mock; sync history; secrets never in JSON  
37. **Activity audit monitor** (`/admin`, `/platform`) — who touched what  

### E. Client-facing possibilities

38. Portal home + statement (published only)  
39. Insights (published) + management Q&A answers  
40. Shared planning scenarios  
41. Shared monthly reports  
42. Client documents + fulfill requests / upload  
43. Optional portal Ask (if enabled) — still tool-scoped  
44. Logo + two brand accents; template themes (editorial / modern / executive)  
45. Month / entity / compare interactivity (Tier-1+)  

### F. Platform / firm ops

46. Multi-firm tenancy + firm switch  
47. Platform console — provision firms/clients, jobs, usage, diagnostics, integrity  
48. Backups — online snapshot, verify, GFS prune, restore (type RESTORE)  
49. MFA (staff TOTP) + password reset (session revoke via token_version)  
50. Health live/ready + dependency matrix + correlation IDs  
51. Feature capabilities per firm  
52. Audit trail query APIs (firm + platform)  

### G. Prototypes (real data, not production Overview)

53. `/dash/overview-v2` — 6–3–1 Client Intelligence paper canvas  
54. `/dash/command-center` — connected intelligence canvas  
55. `/play/intelligence` — public fixture playground  

### H. Deliberately NOT possible (by design)

- Client self-service pivots / query builders  
- Auto-publish without human approval  
- Peer benchmarking across firms  
- Client-facing 0–100 “grade”  
- Payroll partner APIs (CSV remains)  
- Invented industry bands as hard truth without AGREED/DERIVED provenance  

---

## Role matrix (capability access)

| Capability | ADMIN | ADVISOR | BOOKKEEPER | CLIENT | Platform admin flag |
|---|---|---|---|---|---|
| Today / Portfolio / Review / Publish | ✓ | ✓ | ✗ | ✗ | — |
| Upload / Close / Recon / Docs / Integrations | ✓ | ✓ | ✓ | ✗ | — |
| Waive close / resolve recon / QBO connect | ✓ | ✓ | ✗ | ✗ | — |
| Tax / Guidance / Planning / Intelligence / CE | ✓ | ✓ | ✗ | ✗ | — |
| Create users / backups / firm audit log | ✓ | ✗ | ✗ | ✗ | — |
| Dash | ✓ | ✓ | ✓ | ✗ | — |
| Portal (own / preview) | preview | preview | ✗ | own only | — |
| Ask UI | ✓ | ✓ | ✓ | ✗ | — |
| Copilot API | ✓ | ✓ | ✓ | scoped | — |
| Platform / ops APIs | MW ADMIN | ✗ | ✗ | ✗ | **required** |

---

## Surface inventory counts

- **57** pages (`app/**/page.tsx`)  
- **63** API route modules  
- **~169** `lib/` modules across financial, AI, ops, verticals  
- Middleware GUARDS for every production staff/client path (matcher must stay in sync)

---

## UX / UI audit

### Grades by surface

| Surface | Grade | Notes |
|---|---|---|
| Login / branding | A | Hathorn Dashboard mark correct |
| Today | A | Briefing, not a dashboard |
| Portfolio | A− | Dense but purposeful |
| Dash | A− | URL state; honest empty Vendors |
| Upload | A− | Clear gate feedback |
| Review | B+ | Powerful; `prompt()`/`confirm()` chrome |
| Portal statement | B+ | Polished; double masthead risk |
| Client Experience | B | Workspace-heavy |
| Admin + Activity log | B+ | Ops-useful; Activity Monitor live |
| overview-v2 / CC / play | B / B− / C+ | Prototypes; ECharts vs SVG doctrine |

### Product-rule scorecard

| Rule | Status |
|---|---|
| Typography lock | **Pass** |
| Brand accent-only | **Pass** on statement/dash; partial on prototypes |
| Editorial commentary | **Pass** |
| Client Tier-1 read-only | **Drift** (Q&A, uploads, optional Ask) |
| Dash URL state | **Pass** |
| Templates | **Pass** |
| Gate = release authority | **Pass** (proven) |
| Confidence never moves figures | **Pass** (proven) |

### Visual spot-check (this run)

Screenshots: `ui-login.png`, `ui-today.png`, `ui-portfolio.png`, `ui-dash.png`, `ui-upload.png`, `ui-admin.png` (Activity log present), `ui-portal-preview.png`, `ui-portal-owner.png`.  
`/review` bare URL 404 is expected — route is `/review/[periodId]`. No JS console errors on portal.

---

## Security & stress findings

### Proven good

- Unauth APIs → **401 JSON** (not redirects/500)  
- Client blocked from admin/dash/upload/ops/approve  
- Bookkeeper blocked from portfolio/approve/audit  
- XSS/SQLi-ish audit search strings → 200, no crash  
- Concurrent health 20/20  
- Cross-firm intelligence/planning/documents/integrations blocked  
- Copilot refuses estimates / client internal exceptions  
- Password throttle path alive  
- AI sanitation / secret redaction unit-proven  

### Issues found

1. **Stuck `SYNCING` connection** — interrupted sync blocks further syncs until manual DB/ops clear. Workflow proof crashed here before reseed. **Priority: High (ops reliability).**  
2. **Array JSON body on login → 401** instead of 400 (malformed should be 400). Soft inconsistency.  
3. **`/api/assets` not in middleware matcher** — relies on handler auth only. Risk if handler regresses.  
4. **RC smoke depends on Example CPA seed** — stale DB falsely fails Firm B probe.  
5. **Portal Tier-1 erosion** — product rule vs shipped interactivity.  
6. **ECharts vs “pure SVG” doctrine** — planning/intelligence/ov2 diverge from AGENTS.md.  
7. **Client MFA** — not implemented (staff MFA only).  
8. **Live QBO / Resend / Postgres** — not E2E proven in this audit.  

### Unverified (do not overclaim)

| Integration | Status |
|---|---|
| QuickBooks live | Written + hub unit; sandbox E2E not run here |
| Resend email | Opt-in no-op without key |
| Postgres runtime | Translation/unit + scripts exist; this audit ran SQLite |
| ClamAV | Implemented, default off |
| Human visual QA of every module | Spot-checked core; tax/guidance/recon UIs not fully walked |

---

## Backend architecture snapshot

```
CSV/QBO/file → period tables → gate → IN_REVIEW
Advisor story → release.publish() → immutable release_records
Portal/statement ← frozen snapshot (not live ledger)
Staff dash/intelligence ← live computePeriods engine
Copilot/tax/research/FPA/docs ← side engines; must not mutate releases
Ops jobs + audit_logs ← monitoring plane
```

**Non-negotiables verified in proof:** publish re-evaluates gate; amendment required; notes blocked when locked; hub/docs/tax/research/FPA/recon/close do not mutate releases; client only sees published-shaped insights.

---

## Recommendations (ordered)

1. **Auto-recover stuck SYNCING** (timeout → FAILED + retryable) — unblocks Integration Hub ops.  
2. **Keep `npm run seed` before smoke/proof** in CI/docs (Firm B fixture).  
3. **Decide Tier-1 portal scope** — either document the expanded modules as intentional or gate Q&A/upload/Ask behind firm capability flags default-off.  
4. **Promote or quarantine prototypes** — overview-v2 / command-center need an approval gate before replacing `/dash`.  
5. **Middleware-guard `/api/assets`**.  
6. **Staging drill:** live QBO connect, Resend publish email, Postgres migrate+financial verify.  
7. **Human design pass** on review chrome and portal double-header.  
8. **Client MFA + managed auth** before real client financials (already in backlog).  

---

## Artifact index

| File | Contents |
|---|---|
| `FULL-SYSTEM-AUDIT.md` | This report |
| `workflow-proof-final.txt` | 217/217 workflow |
| `rc-smoke-final.txt` | 11/11 smoke |
| `unit-results.txt` | Unit suite log |
| `adversarial-http.txt` | HTTP stress battery |
| `ui-*.png` / `ui-visual-audit.md` | Browser spot-check |
| `reseed.txt` | Clean seed with Firm B |

---

## Feature count summary

Roughly **55+ distinct product capabilities** across advisory close, intelligence, tax, documents, planning, integrations, multi-firm ops, and client experience — with a hard core of ~8 that define the business (upload → gate → story → release → portal). Everything else is force-multiplier around that spine.

**Verified this run:** typecheck · 167 unit · 217 workflow · 11 smoke · adversarial walls · visual core path.  
**Not verified this run:** live Intuit, live mail, live Postgres cutover, full UI walk of every secondary module.
