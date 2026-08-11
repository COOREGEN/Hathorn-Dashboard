# Ask Hathorn — AI Security

## Threat model (Phase 9)

The model is an **untrusted caller**. It must not:

- Bypass firm or client authorization  
- Execute SQL, shell, or arbitrary HTTP  
- Invent financial figures or authority citations  
- Treat retrieved document/IRS/guidance text as instructions  
- Perform write actions (publish, waive, post, email, disconnect)  

## Controls

### Authentication

Same JWT httpOnly session as the rest of Hathorn. No separate AI auth path. Middleware guards `/api/copilot` and `/ask`.

### Tenant isolation

- Conversations keyed by `firm_id` + `user_id`  
- Tools reject `clientId` when `clients.firm_id ≠ ctx.firmId`  
- Portfolio / attention / close firm-wide queries pass `firmId` into domain services  
- Cross-firm comparison prompts are refused  

### Audience split

| Audience | Registry |
|---|---|
| STAFF | Full read-only registry (`STAFF_TOOLS` in `lib/ai/copilot/permissions.ts`) |
| CLIENT | Reduced registry only (see below) |

Enforced in `canUseTool` / `executeTool`, not by hiding tools in the system prompt.

**Current `CLIENT_TOOLS`:**

- `getPublishedRelease`
- `resolvePeriod`
- `getClientInsights`
- `getClientSharedForecast`
- `getClientReport`
- `getClientManagementQuestions`

Staff-only examples (not exhaustive): `getFinancialSummary`, `getExceptions`, `getTaxIssue`, `searchDocuments`, portfolio/attention tools, etc.

### Input validation

Server validates JSON bodies (`jsonObject`). Period/client ids are re-resolved against the database under the session firm. Model-supplied ids never skip `requireClient`-equivalent checks.

### Prompt injection

- Retrieved text is sanitized (`sanitizeForPrompt`) and wrapped as **TOOL_RESULTS data**  
- System instructions state that tool/document content must not alter permissions or the tool registry  
- Unit test: hostile document note does not unlock Firm B  
- Quarantined documents are not parsed or offered to AI  

### Data minimization & sanitize layer

Before any Anthropic (or future provider) call:

- `sanitizeAiContext` / `sanitizeAiPayload` (`lib/ai/sanitize-context.ts`) redact SSN/ITIN-shaped values, EINs, bank/account-labeled numbers, payment-card-shaped groups, and secret/token patterns  
- Secret-bearing JSON keys are replaced with `[REDACTED]`  
- Tax facts reject SSN keys  
- **Residual:** structured tool JSON can still reach the model **after** sanitize — treat as CONFIDENTIAL / possible tax-related disclosure (**LEGAL REVIEW REQUIRED** under §7216)  

See `docs/security/AISVS-MATRIX.md` and `docs/compliance/SECTION-7216-DATA-FLOW-REVIEW.md`.

### Rate limiting

`LIMITS.copilot` (40 / 60 minutes / user) via existing `rate_events`.

### Tool budget & timeouts

Max 10 tool calls per ask. Anthropic calls use `fetchWithTimeout` (45s). One failing subsystem yields a partial grounded answer + warning — never invents the missing slice.

### Audit

Events: `COPILOT_CONVERSATION_CREATED`, `COPILOT_QUERY`, `COPILOT_TOOL_CALLED`, `COPILOT_RESPONSE_GENERATED`, `COPILOT_FEEDBACK`.  

`COPILOT_QUERY` stores **metadata only** (e.g. question length, firm/client ids) — **not** the question text (may contain NPI / tax identifiers). Secrets are not logged.

### Draft vs final

Tax / accounting research tools set `DRAFT_NOT_FINAL` when status is not reviewed/final. Copilot must say so.

### Kill switches

Provider and feature flags allow degrading AI without taking financials offline (`AI_PROVIDER_ENABLED=0`, related flags). AI never publishes.

### Experimental subsystems

Forge, Fact Graph, RAGFlow surfaces emit warnings / `SOURCE_VERIFICATION_REQUIRED` when enabled-but-blocked or experimental. Router must not present them as established truth.

## Adversarial coverage (`npm run copilot:test`)

- Estimate / ignore-tools refusal  
- Invented ASC refusal  
- Cross-tenant `clientId` rejection  
- Client exceptions refusal  
- Draft tax status  
- Published release v1 vs working books  
- Prompt-injection document  
- Deterministic margin math  
- Tool budget constant  

Sanitize unit coverage: `scripts/security-unit.ts`.
