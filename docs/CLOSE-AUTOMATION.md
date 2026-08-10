# Close Automation

Automate the checklist. Automate the evidence. Automate the routing.
**Do not automate professional judgment.**

```text
DATA → DOCUMENTS → RECONCILIATIONS → CHECKS → VARIANCES
  → EXCEPTIONS → ASSIGNMENT → REVIEW → APPROVAL
  → EXISTING RELEASE ENGINE → PUBLISH
```

Phase 7 feeds the existing immutable release workflow. It does **not** replace
`lib/release.ts` publish / amendment.

---

## Objects

### Close Run (`close_runs`)

One row per `(client_id, period_id)`.

Statuses: `NOT_STARTED` · `IN_PROGRESS` · `BLOCKED` · `READY_FOR_REVIEW` ·
`READY_TO_PUBLISH` · `CLOSED` · `REOPENED`.

When a period is published through the existing approve path, `release_id` is linked
and status becomes `CLOSED`.

### Close Policy (`close_policies`)

Firm default (`client_id IS NULL`) plus optional client overrides. Defines required
documents, reconciliations, check keys, variance thresholds, and blocking overrides.

### Checklist Items (`close_checklist_items`)

Per-run checks with:

- `kind` — `AUTOMATED` or `MANUAL`
- `status` — `PENDING` · `PASS` · `FAIL` · `NEEDS_REVIEW` · `NOT_APPLICABLE` · `WAIVED` · `STALE`
- `input_hash` / `reviewed_hash` — stale-review control
- `blocking` — policy-aware

**WAIVED is never rewritten as PASS.**

### Exceptions

Reuses `accounting_exceptions` (Phase 5). Close evaluation may create/update rows with
`close_run_id`, `blocking`, `subsystem`. Firm queue at `/exceptions`.

---

## Checks (current)

### AUTOMATED

| Key | Category |
|---|---|
| `integration_sources_current` | DATA |
| `figures_present` | DATA |
| `gate_pass` | FINANCIAL_CHECKS |
| `doc_payroll_approved` / `doc_ar_approved` / `doc_debt_approved` | DOCUMENTS |
| `recon_payroll` / `recon_ar` / `recon_debt` / `recon_no_critical_open` | RECONCILIATIONS |
| `balance_sheet_balances` | FINANCIAL_CHECKS |
| `cash_present` | FINANCIAL_CHECKS |
| `variance_revenue_mom` / `variance_payroll_mom` / `variance_opex_mom` | VARIANCE_REVIEW |
| `commentary_present` | ADVISOR_REVIEW |
| `publish_evaluate_clear` | PUBLISHING_READINESS |

### MANUAL

| Key | Category |
|---|---|
| `manual_unusual_entries` | ACCOUNTING_REVIEW |
| `manual_related_party` | ACCOUNTING_REVIEW |

### DEFERRED

Bank reconciliation dollar-match · AP close · inventory · tax provision as monthly blocker ·
scheduled sync policies · client task portal · Temporal.

---

## Blocking logic

`evaluateCloseReadiness` is deterministic:

1. Required checks that are blocking and not `PASS` / `WAIVED` / `NOT_APPLICABLE` → **BLOCKED**
2. Open blocking / CRITICAL exceptions → **BLOCKED**
3. Otherwise, if release `evaluate` is clear and commentary passes → **READY_TO_PUBLISH**
4. Else if all required complete → **READY_FOR_REVIEW**
5. Else → **IN_PROGRESS** / **REOPENED**

AI never decides readiness.

---

## Stale review

Each automated check stores `input_hash` from dependency tags (ledger, payroll docs,
recon rows, etc.). After a human reviews (`reviewed_hash` set), a later refresh that
sees a different hash marks the item **STALE** and re-blocks readiness.

Unrelated dependency tags do not invalidate other checks (payroll change does not
stale debt).

---

## AI

May draft a close summary / investigation questions from structured state.

Must not: resolve, waive, approve, publish, post journals, or claim readiness.

---

## Security

| Action | Roles |
|---|---|
| View close / exceptions | ADMIN, ADVISOR, BOOKKEEPER |
| Complete manual / review check | ADMIN, ADVISOR, BOOKKEEPER |
| Assign / resolve exception | ADMIN, ADVISOR, BOOKKEEPER |
| Waive check / reopen close | ADMIN, ADVISOR |
| Publish | Existing approve path (ADMIN, ADVISOR) |

Clients cannot access `/close`, `/exceptions`, or the APIs.

---

## Integrity

Close automation never:

- posts journal entries
- modifies QuickBooks
- mutates published release snapshots
- auto-publishes

Publishing remains `lib/release.publish` only.
