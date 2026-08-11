/**
 * Ask Hathorn engine — route → authorized tools → deterministic facts → AI explanation.
 */

import type { Session } from "../../auth";
import { audit } from "../../auth";
import { mergeCitations } from "./citations";
import { buildCopilotContext } from "./context";
import {
  detectHostilePrompt, routeIntent, toolPlanForIntent,
  wantsPublishedData, wantsWorkingData,
} from "./router";
import {
  consolidateStatus, explainWithModel, extractKeyNumbers, groundedFallback,
  type FactBundle,
} from "./responses";
import { appendMessage, createConversation, getConversation } from "./store";
import { executeTool } from "./tools";
import type {
  CopilotAskInput, CopilotCitation, CopilotResponse, SourceStatus, ToolTrace,
} from "./types";
import { MAX_TOOL_CALLS, COPILOT_PRODUCT_NAME } from "./types";

export async function askCopilot(
  session: Session,
  input: CopilotAskInput,
): Promise<CopilotResponse> {
  const question = String(input.question || "").trim();
  if (!question) {
    return emptyError(session, input, "Ask a question about your books or practice.");
  }
  if (question.length > 4000) {
    return emptyError(session, input, "Question is too long. Narrow the ask.");
  }

  const ctx = buildCopilotContext(session, input);
  const hostile = detectHostilePrompt(question);

  let conversationId = input.conversationId || null;
  if (conversationId) {
    const existing = getConversation(conversationId, ctx.userId, ctx.firmId);
    if (!existing) conversationId = null;
    // Context switch: if conversation was bound to another client, start fresh for safety.
    if (existing && existing.clientId && ctx.clientId && existing.clientId !== ctx.clientId) {
      conversationId = null;
    }
  }
  if (!conversationId) {
    const title = question.slice(0, 80);
    const conv = createConversation({
      firmId: ctx.firmId,
      userId: ctx.userId,
      clientId: ctx.clientId,
      title,
    });
    conversationId = conv.id;
    audit(ctx.userId, "COPILOT_CONVERSATION_CREATED", conversationId, {
      firmId: ctx.firmId, clientId: ctx.clientId,
    });
  }

  appendMessage({
    conversationId,
    role: "user",
    content: question,
  });
  // Audit metadata only — never persist the question text (may contain NPI / tax identifiers).
  audit(ctx.userId, "COPILOT_QUERY", `${conversationId}:len=${question.length}`, {
    firmId: ctx.firmId, clientId: ctx.clientId,
  });

  // Hostile refusals that must not call inventing paths
  if (hostile.refuseEstimate) {
    return finalize(ctx, conversationId, {
      intent: "UNSUPPORTED",
      answer:
        "I cannot estimate or invent figures. Ask Hathorn only reports numbers from authorized Hathorn tools (ledger, releases, reconciliations, and related engines).",
      sourceStatus: "SOURCE_VERIFICATION_REQUIRED",
      citations: [],
      warnings: ["Model memory / estimation is not an allowed source for material figures."],
      toolsUsed: [],
      keyNumbers: [],
      modelProvider: null,
      modelName: null,
    });
  }
  if (hostile.refuseInventCitation) {
    return finalize(ctx, conversationId, {
      intent: "ACCOUNTING_GUIDANCE",
      answer:
        "I will not invent ASC, IRC, or other authority citations. Ask for a specific research issue or I will search only authorized Accounting Guidance / Tax Intelligence sources.",
      sourceStatus: "SOURCE_VERIFICATION_REQUIRED",
      citations: [],
      warnings: ["Citation invention refused."],
      toolsUsed: [],
      keyNumbers: [],
      modelProvider: null,
      modelName: null,
    });
  }
  if (hostile.refuseCrossFirm) {
    return finalize(ctx, conversationId, {
      intent: "UNSUPPORTED",
      answer:
        "Cross-firm comparison is not available. Ask Hathorn stays inside your active firm workspace.",
      sourceStatus: "UNAVAILABLE",
      citations: [],
      warnings: ["Cross-firm access is blocked."],
      toolsUsed: [],
      keyNumbers: [],
      modelProvider: null,
      modelName: null,
    });
  }

  // Client asking for internal exceptions / close / recon — refuse without leaking
  if (ctx.audience === "CLIENT") {
    if (/\b(exceptions?|reconcil(?:e|iation|iations)?|close blockers?|integration secrets?|tax research|technical memos?|working books)\b/i.test(question)) {
      return finalize(ctx, conversationId, {
        intent: "UNSUPPORTED",
        answer: "That information is not available in the client portal Copilot.",
        sourceStatus: "UNAVAILABLE",
        citations: [],
        warnings: [],
        toolsUsed: [],
        keyNumbers: [],
        modelProvider: null,
        modelName: null,
      });
    }
  }

  const intent = routeIntent(question);
  if (intent === "UNSUPPORTED" && !/\?/.test(question) && question.split(/\s+/).length < 3) {
    return finalize(ctx, conversationId, {
      intent,
      answer: `${COPILOT_PRODUCT_NAME} needs a clearer accounting or practice question. Try one of the suggested prompts.`,
      sourceStatus: "INSUFFICIENT_DATA",
      citations: [],
      warnings: [],
      toolsUsed: [],
      keyNumbers: [],
      modelProvider: null,
      modelName: null,
    });
  }

  const published = wantsPublishedData(question);
  const working = wantsWorkingData(question);
  if (published && working) {
    return finalize(ctx, conversationId, {
      intent: "FINANCIAL_ACTUALS",
      answer:
        "Do you want the published release (what the client was shown) or current working books? Those can differ after a close amendment window.",
      sourceStatus: "PARTIALLY_SUPPORTED",
      citations: [],
      warnings: ["Ambiguous source: published vs working."],
      toolsUsed: [],
      keyNumbers: [],
      modelProvider: null,
      modelName: null,
    });
  }

  const plan = toolPlanForIntent(intent, {
    hasClient: Boolean(ctx.clientId),
    audience: ctx.audience,
    wantsPublished: published,
  });

  const toolsUsed: ToolTrace[] = [];
  const citations: CopilotCitation[] = [];
  const warnings: string[] = [];
  const statuses: SourceStatus[] = [];
  const toolData: FactBundle["toolData"] = [];
  let calls = 0;

  for (const toolName of plan) {
    if (calls >= MAX_TOOL_CALLS) {
      warnings.push("The request is too broad. Narrow the question. Showing the best partial answer from tools already run.");
      break;
    }
    const args: Record<string, unknown> = {};
    if (ctx.clientId) args.clientId = ctx.clientId;
    if (ctx.periodId) args.periodId = ctx.periodId;
    if (ctx.year) args.year = ctx.year;
    if (ctx.month) args.month = ctx.month;
    if (toolName === "getCloseStatus" && !ctx.clientId) args.firmWide = true;
    if (toolName === "getExceptions" && /\bcritical\b/i.test(question)) args.blocking = true;
    if (toolName === "getExceptions" && /\bmy assigned\b|\bassigned to me\b/i.test(question)) args.mine = true;
    if (toolName === "searchDocuments") {
      const m = question.match(/\b(debt|lease|payroll|aging|bank|schedule)\b/i);
      if (m) args.query = m[1];
    }
    if (toolName === "resolvePeriod") args.phrase = question;

    const { result, trace } = await executeTool(ctx, toolName, args);
    calls += 1;
    toolsUsed.push(trace);
    audit(ctx.userId, "COPILOT_TOOL_CALLED", `${toolName}:${trace.ok ? "ok" : "err"}`, {
      firmId: ctx.firmId, clientId: ctx.clientId,
    });

    if (result.citations) citations.push(...result.citations);
    if (result.warnings) warnings.push(...result.warnings);
    if (result.sourceStatus) statuses.push(result.sourceStatus);
    toolData.push({
      tool: toolName,
      label: trace.label,
      ok: result.ok,
      data: result.data ?? null,
      error: result.error,
      warnings: result.warnings,
    });
  }

  // Meeting prep / financial: if published asked, prefer release numbers in key display
  const bundle: FactBundle = {
    intent,
    toolsUsed,
    toolData,
    citations: mergeCitations(citations),
    warnings: Array.from(new Set(warnings)),
    sourceStatus: consolidateStatus(statuses),
    keyNumbers: extractKeyNumbers(toolData),
  };

  const explained = await explainWithModel(ctx, question, bundle);
  if (explained.warning) bundle.warnings.push(explained.warning);

  // Never let a model answer with zero tools for material financial intents when tools failed
  let answer = explained.text;
  if (!toolData.some((t) => t.ok) && /revenue|margin|close|reconcil/i.test(question)) {
    answer = groundedFallback(bundle, question);
    bundle.sourceStatus = bundle.sourceStatus === "SUPPORTED_BY_SOURCE_DATA"
      ? "PARTIALLY_SUPPORTED"
      : bundle.sourceStatus;
  }

  return finalize(ctx, conversationId, {
    intent,
    answer,
    sourceStatus: bundle.sourceStatus,
    citations: bundle.citations,
    warnings: bundle.warnings,
    toolsUsed,
    keyNumbers: bundle.keyNumbers,
    modelProvider: explained.provider,
    modelName: explained.model,
  });
}

async function finalize(
  ctx: ReturnType<typeof buildCopilotContext>,
  conversationId: string,
  partial: Omit<CopilotResponse, "ok" | "conversationId" | "messageId">,
): Promise<CopilotResponse> {
  const msg = appendMessage({
    conversationId,
    role: "assistant",
    content: partial.answer,
    sourceStatus: partial.sourceStatus,
    citations: partial.citations,
    tools: partial.toolsUsed,
    warnings: partial.warnings,
    modelProvider: partial.modelProvider,
    modelName: partial.modelName,
  });
  audit(ctx.userId, "COPILOT_RESPONSE_GENERATED", `${conversationId}:${msg.id}:${partial.sourceStatus}`, {
    firmId: ctx.firmId, clientId: ctx.clientId,
  });
  return {
    ok: true,
    conversationId,
    messageId: msg.id,
    ...partial,
  };
}

function emptyError(
  session: Session,
  input: CopilotAskInput,
  message: string,
): CopilotResponse {
  return {
    ok: false,
    conversationId: input.conversationId || "",
    messageId: "",
    answer: message,
    intent: "UNSUPPORTED",
    sourceStatus: "INSUFFICIENT_DATA",
    citations: [],
    warnings: [],
    toolsUsed: [],
    modelProvider: null,
    modelName: null,
    error: message,
  };
}

/** Test helper: run tools without persistence / model. */
export async function runToolPlanForTest(
  session: Session,
  input: CopilotAskInput,
  tools: string[],
) {
  const ctx = buildCopilotContext(session, input);
  const out = [];
  let calls = 0;
  for (const name of tools) {
    if (calls >= MAX_TOOL_CALLS) break;
    const args: Record<string, unknown> = {};
    if (ctx.clientId) args.clientId = ctx.clientId;
    if (ctx.periodId) args.periodId = ctx.periodId;
    if (ctx.year) args.year = ctx.year;
    if (ctx.month) args.month = ctx.month;
    out.push(await executeTool(ctx, name, args));
    calls += 1;
  }
  return { ctx, results: out, calls };
}
