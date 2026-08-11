/**
 * Build authorized Copilot context from the session. Never trust client/firm ids
 * from the model — only from the authenticated session + UI binding.
 */

import { AuthError, type Session } from "../../auth";
import { db } from "../../db";
import type { CopilotAskInput, CopilotContext } from "./types";

export function buildCopilotContext(session: Session, input: CopilotAskInput): CopilotContext {
  const audience: CopilotContext["audience"] = session.role === "CLIENT" ? "CLIENT" : "STAFF";
  const firmId = session.firmId;
  if (!firmId) {
    throw new AuthError(403, "An active firm context is required for Ask Hathorn.");
  }

  let clientId: string | null = null;
  if (audience === "CLIENT") {
    clientId = session.clientId;
    if (!clientId) throw new AuthError(403, "Resource not found.");
  } else if (input.clientId) {
    const row: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(input.clientId);
    if (!row?.firm_id || row.firm_id !== firmId) {
      throw new AuthError(403, "Resource not found.");
    }
    const mem: any = db().prepare(
      `SELECT 1 FROM firm_memberships WHERE user_id=? AND firm_id=? AND status='ACTIVE'`,
    ).get(session.userId, firmId);
    if (!mem) throw new AuthError(403, "Resource not found.");
    clientId = String(input.clientId);
  }

  let periodId: string | null = input.periodId ? String(input.periodId) : null;
  if (periodId && clientId) {
    const p: any = db().prepare(
      "SELECT id FROM periods WHERE id=? AND client_id=?",
    ).get(periodId, clientId);
    if (!p) periodId = null;
  } else if (periodId && !clientId) {
    periodId = null;
  }

  return {
    userId: session.userId,
    role: session.role,
    firmId,
    isPlatformAdmin: Boolean(session.isPlatformAdmin),
    clientId,
    periodId,
    year: input.year != null ? Number(input.year) : null,
    month: input.month != null ? Number(input.month) : null,
    audience,
  };
}

export function suggestedQuestions(ctx: CopilotContext): string[] {
  if (ctx.audience === "CLIENT") {
    return [
      "What was published for the latest month?",
      "What commentary did we share?",
      "Show the published release summary.",
    ];
  }
  if (ctx.clientId) {
    return [
      "Why did revenue change?",
      "Is AR reconciled?",
      "What is blocking close?",
      "What should I review?",
    ];
  }
  return [
    "What needs my attention today?",
    "Which closes are blocked?",
    "Show critical exceptions.",
    "Which integrations are stale?",
  ];
}
