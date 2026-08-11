# Vendor due diligence checklist

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Use:** Complete one copy per service provider before production enablement. Store completed copies in the compliance vault; optionally add a redacted index under `evidence/`.

---

## Vendor identity

| Field | Value |
|---|---|
| Legal name | |
| Product / service | |
| Primary contact | |
| Security contact / email | |
| Subprocessors list URL | |
| Data processing regions | |

---

## Data & purpose

| Question | Response |
|---|---|
| Business purpose in Hathorn Dashboard | |
| Data categories (per DATA-INVENTORY) | |
| May include tax return information? | Yes / No / Uncertain → if not No, trigger §7216 review |
| Data retained how long by vendor? | |
| Used for model training? | Yes / No / Unknown — LEGAL REVIEW |
| Encryption in transit (TLS) | |
| Encryption at rest | |

---

## Security & assurance

| Control | Evidence obtained? | Notes |
|---|---|---|
| SOC 2 / ISO / equivalent report | Yes / No / N/A | Collecting a SOC report ≠ Hathorn is SOC 2 certified |
| Penetration test summary | | |
| Incident notification commitment | | |
| Vulnerability disclosure process | | |
| MFA for vendor admin consoles | | |
| Vulnerability SLA | | |

---

## Contractual (counsel)

| Clause | Present? | LEGAL REVIEW |
|---|---|---|
| Confidentiality | | REQUIRED |
| Security safeguards | | REQUIRED |
| Breach notice timeline | | REQUIRED |
| Data return/deletion | | REQUIRED |
| Subprocessor change notice | | REQUIRED |
| §7216 / tax-specific language if needed | | REQUIRED |
| AI training opt-out / zero-retention options | | REQUIRED if AI vendor |

---

## Operational integration

| Item | Status |
|---|---|
| Secrets stored in host secret manager (not git) | |
| Feature flag / kill switch available | |
| Least-privilege API scopes | |
| Logging excludes secrets | |
| Offboarding steps documented | |
| Added to SERVICE-PROVIDER-REGISTER | |
| Flows updated in SENSITIVE-DATA-FLOWS | |

---

## Decision

| Outcome | Sign-off |
|---|---|
| Approved for production / Approved with conditions / Rejected | MANAGEMENT MUST ASSIGN |
| Conditions | |
| Review date | |
| Counsel | MANAGEMENT MUST ASSIGN |
