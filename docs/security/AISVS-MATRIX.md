# OWASP AISVS 1.0 mapping — Copilot / tax AI

**Standard:** OWASP Artificial Intelligence Security Verification Standard **1.0** (24 Jun 2026)  
**Scope:** Ask Hathorn Copilot, story agent, tax analysis paths that call Anthropic  
**Status:** DRAFT self-assessment — not an AISVS certification  
**Owner:** MANAGEMENT MUST ASSIGN  

Status vocabulary: VERIFIED · PARTIAL · NOT IMPLEMENTED · LEGAL REVIEW REQUIRED · POLICY REQUIRED

---

## Relevant control themes

### Model & provider governance

| Control theme | Implementation | Status |
|---|---|---|
| Explicit enablement / kill switch | `AI_PROVIDER_ENABLED` and related flags; degrade without key | VERIFIED |
| Documented provider | Anthropic via API; timeouts | PARTIAL (vendor diligence LEGAL/VENDOR) |
| No silent training on customer prompts asserted in code | Cannot be proven in app code — contract terms | LEGAL REVIEW REQUIRED / VENDOR ACTION REQUIRED |

### Authorization & tenancy for AI tools

| Control theme | Implementation | Status |
|---|---|---|
| Tools cannot bypass auth | Same JWT session; middleware on `/api/copilot` | VERIFIED |
| Tool allowlists by audience | `STAFF_TOOLS` vs `CLIENT_TOOLS` enforced in `canUseTool` / `executeTool` | VERIFIED |
| CLIENT_TOOLS (current) | `getPublishedRelease`, `resolvePeriod`, `getClientInsights`, `getClientSharedForecast`, `getClientReport`, `getClientManagementQuestions` | VERIFIED |
| Cross-tenant refusal | Firm/client checks; adversarial tests | VERIFIED |
| No write tools (publish, email, disconnect) | Read-only registry by design | VERIFIED |

### Prompt injection & untrusted content

| Control theme | Implementation | Status |
|---|---|---|
| Treat user + retrieved docs as untrusted | Hostile detection; sanitizeForPrompt; TOOL_RESULTS framing | PARTIAL |
| Document-borne injection tests | Unit/adversarial coverage | PARTIAL |
| Quarantined docs excluded from parse/AI | Status blocks | VERIFIED |

### Sensitive data minimization (pre-model)

| Control theme | Implementation | Status |
|---|---|---|
| Redact SSN/ITIN, EIN, bank, secrets, card-shaped | `sanitizeAiContext` / `sanitizeAiPayload` | VERIFIED (unit) |
| Reject SSN keys in tax facts | Tax module | VERIFIED |
| Avoid storing raw questions in audit | `COPILOT_QUERY` metadata-only | VERIFIED |
| Minimize tool JSON schemas | Compact JSON; residual full JSON after sanitize may still send | PARTIAL |

### Output integrity & over-reliance

| Control theme | Implementation | Status |
|---|---|---|
| Ground in tool facts | Tool-first; fallback grounded | PARTIAL |
| Refuse invented authority / estimates per tests | Adversarial suite | PARTIAL |
| Draft vs final tax status | `DRAFT_NOT_FINAL` warnings | PARTIAL |
| Human approval for publish | AI never publishes | VERIFIED |

### Abuse, rate limits, availability

| Control theme | Implementation | Status |
|---|---|---|
| Per-user rate limits | `LIMITS.copilot` | VERIFIED |
| Tool budget | Max tool calls per ask | VERIFIED |
| Provider timeout | `fetchWithTimeout` | VERIFIED |

### Logging & monitoring

| Control theme | Implementation | Status |
|---|---|---|
| Usage events without secrets | `ai_usage_events` | PARTIAL |
| Security-relevant AI audits | COPILOT_* events | PARTIAL |
| Alerting on abuse | NOT IMPLEMENTED (ops) | NOT IMPLEMENTED |

### Safety / prohibited content

| Control theme | Implementation | Status |
|---|---|---|
| Hostile / jailbreak refusals | detectHostilePrompt paths | PARTIAL |
| PHI not supported | Policy HIPAA-SCOPE; not a model filter guarantee | POLICY REQUIRED |

---

## Residual AI risks (honest)

1. Regex sanitization is not cryptographic anonymization.  
2. Financial tool JSON after sanitize can still identify a taxpayer’s business performance.  
3. §7216 / consent posture is LEGAL REVIEW REQUIRED.  
4. Model hallucinations mitigated by grounding but not eliminated — advisor/client must not treat AI as authority.

---

## Suggested verification commands

```bash
npm run copilot:test   # adversarial Copilot suite (when configured)
npx tsx scripts/security-unit.ts   # sanitize + quarantine path checks
```

Do not claim “AISVS compliant.”
