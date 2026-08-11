# Service provider register

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Related:** FTC Safeguards service-provider oversight themes; IRS WISP vendor themes; `VENDOR-DUE-DILIGENCE-CHECKLIST.md`

Do not invent contract execution dates. Status reflects technical integration presence only.

| Provider | Purpose | Data categories that may be processed | Env / flags | Subprocessors known? | Diligence status | Contract / DPA | Security contact | Review due |
|---|---|---|---|---|---|---|---|---|
| Anthropic | Copilot, story/tax AI completions | CONFIDENTIAL financial tool JSON; possible RESTRICTED TAX / IDENTITY in prompts (post-sanitize) | `ANTHROPIC_API_KEY`, `AI_PROVIDER_ENABLED`, model flags | Check Anthropic docs — VENDOR ACTION REQUIRED | PARTIAL | LEGAL REVIEW REQUIRED — not stored in repo | MANAGEMENT MUST ASSIGN | Annual |
| Intuit QuickBooks Online | Accounting sync (P&L, AR) | OAuth tokens (RESTRICTED); report financials (CONFIDENTIAL) | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT` | Intuit | PARTIAL — live sandbox not proven here | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | Annual |
| Resend | Transactional email | Names, emails, notification content (CONFIDENTIAL) | `RESEND_API_KEY`, `RESEND_FROM` | Resend | PARTIAL | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | Annual |
| ClamAV | Optional malware scan of uploads | File bytes (may include CONFIDENTIAL / TAX / IDENTITY) | `MALWARE_SCAN_ENABLED` (default off) | N/A if local `clamscan` | PARTIAL | N/A local OSS; if hosted scanner — treat as new vendor | MANAGEMENT MUST ASSIGN | Annual |
| Docling / document worker | Optional parse / extraction | Document bytes & text | Document intelligence flags | Deployment-dependent | PARTIAL | VENDOR ACTION REQUIRED if third-party | MANAGEMENT MUST ASSIGN | Annual |
| Forge / experimental tools | Optional research surfaces | Possible guidance queries | Feature flags | Deployment-dependent | PARTIAL | LEGAL REVIEW REQUIRED | MANAGEMENT MUST ASSIGN | Before enablement |
| Hosting provider `[NAME]` | App compute, TLS, volumes | Full stack data | Production host | Host subprocessors | **NOT STARTED** — name host | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | Annual |
| Managed Postgres `[NAME]` | Optional DB | Full DB | `DATABASE_URL` | Provider | NOT STARTED until chosen | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | Annual |
| DNS / email domain `[NAME]` | SPF/DKIM/DMARC, domain | Metadata | DNS | Provider | POLICY REQUIRED | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | Annual |
| GitHub | Source, CI | Code; Actions logs (should exclude secrets) | Repo | GitHub | PARTIAL | Platform terms | MANAGEMENT MUST ASSIGN | Annual |

## Onboarding a new provider

1. Complete `VENDOR-DUE-DILIGENCE-CHECKLIST.md`  
2. Update this register  
3. Update `SECTION-7216-DATA-FLOW-REVIEW.md` if tax-related data possible  
4. Update `DATA-INVENTORY.md` / `SENSITIVE-DATA-FLOWS.md`  
5. Legal approve before production enablement  

## Offboarding

Revoke API keys; delete/export data per contract; remove flags; rotate any shared secrets; note completion in MANAGEMENT-ACTION-REGISTER (do not invent completion).
