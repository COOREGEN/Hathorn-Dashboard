# Ask Hathorn — Unified AI Accounting Copilot

## Principle

```
QUESTION → INTENT ROUTER → PERMISSION LAYER → TOOL REGISTRY
        → DOMAIN SERVICES / DETERMINISTIC ENGINES
        → STRUCTURED FACTS → AI EXPLANATION → CITATIONS → HUMAN
```

The AI is the **interface**. It is not the accounting database, calculation engine, tax code, GAAP database, bookkeeper, or approver.

## Product name

**Ask Hathorn** — staff global `/ask`, contextual launch with `?client=&period=`, limited client panel on `/portal`.

## Module map

```
lib/ai/copilot/
  types.ts         intents, citations, budgets
  permissions.ts   STAFF_TOOLS vs CLIENT_TOOLS
  router.ts        intent + hostile-prompt detection + tool plans
  tools.ts         approved read-only registry + executeTool
  calc.ts          deterministic math
  citations.ts     provenance helpers + sanitizeForPrompt
  context.ts       session → CopilotContext
  store.ts         conversations / messages (refs, not dumps)
  responses.ts     grounded fallback + Anthropic explanation
  engine.ts        orchestration
```

## Tool registry (read-only)

| Tool | Audience |
|---|---|
| `resolvePeriod` | Staff + Client |
| `getPublishedRelease` | Staff + Client |
| `getFinancialSummary` | Staff |
| `getMetricHistory` | Staff (+ published-only path for client history flag) |
| `getPlanningScenario` | Staff |
| `searchDocuments` | Staff |
| `getReconciliationStatus` | Staff |
| `getCloseStatus` | Staff |
| `getExceptions` | Staff |
| `getIntegrationHealth` | Staff |
| `getTaxIssue` | Staff |
| `searchAccountingGuidance` | Staff |
| `getClientPortfolioStatus` | Staff |
| `getAttentionDigest` | Staff |

No write tools in Phase 9.

## Authorization

1. JWT session (`requireRole`)  
2. Active `firmId` required  
3. Every tool validates `client.firm_id === ctx.firmId` and membership  
4. Client audience cannot leave `session.clientId`  
5. Tool names not in the audience registry fail at `executeTool` — not prompt-only  

## Routing

Keyword / pattern router selects an intent and a **bounded tool plan** (≤ `MAX_TOOL_CALLS` = 10). Multi-tool questions (e.g. close blockers) call close + exceptions + recon + integrations, then synthesize.

## Working vs published

- “Latest books / working” → `getFinancialSummary`  
- “What did we report / published” → `getPublishedRelease`  
- Both requested → ask which source  

## Response metadata

```
answer · sourceStatus · citations · warnings · toolsUsed · keyNumbers · modelProvider/modelName
```

Source statuses: `SUPPORTED_BY_SOURCE_DATA` | `PARTIALLY_SUPPORTED` | `INSUFFICIENT_DATA` | `SOURCE_VERIFICATION_REQUIRED` | `DRAFT_NOT_FINAL` | `UNAVAILABLE`

No fake “98% confidence” scores.

## Model provider

Reuses existing Anthropic config (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`). Temperature 0.2. Without a key, deterministic grounded fallback from tool JSON.

## Persistence

- `copilot_conversations` — firm_id, user_id, client_id nullable  
- `copilot_messages` — role, content, citations_json, tools_json, warnings_json, model_*  
- No OAuth tokens, raw QBO payloads, or chain-of-thought  

## APIs

- `GET/POST /api/copilot`  
- `GET /api/copilot/capabilities`  
- `POST /api/copilot/feedback` (helpful / not helpful + coarse reason)  

Rate limit: `LIMITS.copilot`.

## Client Copilot

**LIMITED** — reduced tool registry (`getPublishedRelease`, `resolvePeriod` only). Staff-only surfaces (exceptions, close, recon, tax drafts, integrations) refuse without leaking detail.
