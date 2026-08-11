/**
 * Conversation persistence — firm + user scoped; citations/refs, not raw dumps.
 */

import { db, uid } from "../../db";
import type { CopilotCitation, SourceStatus, ToolTrace } from "./types";

export type ConversationRow = {
  id: string;
  firmId: string;
  userId: string;
  clientId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sourceStatus: SourceStatus | null;
  citations: CopilotCitation[];
  tools: ToolTrace[];
  warnings: string[];
  modelProvider: string | null;
  modelName: string | null;
  createdAt: string;
};

export function createConversation(input: {
  firmId: string;
  userId: string;
  clientId?: string | null;
  title?: string | null;
}): ConversationRow {
  const id = uid();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO copilot_conversations (id, firm_id, user_id, client_id, title, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(id, input.firmId, input.userId, input.clientId || null, input.title || null, now, now);
  return getConversation(id, input.userId, input.firmId)!;
}

export function getConversation(
  id: string, userId: string, firmId: string,
): ConversationRow | null {
  const r: any = db().prepare(
    `SELECT * FROM copilot_conversations WHERE id=? AND user_id=? AND firm_id=?`,
  ).get(id, userId, firmId);
  if (!r) return null;
  return {
    id: r.id, firmId: r.firm_id, userId: r.user_id, clientId: r.client_id,
    title: r.title, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function touchConversation(id: string) {
  db().prepare(
    `UPDATE copilot_conversations SET updated_at=datetime('now') WHERE id=?`,
  ).run(id);
}

export function listConversations(userId: string, firmId: string, limit = 20): ConversationRow[] {
  return (db().prepare(`
    SELECT * FROM copilot_conversations
    WHERE user_id=? AND firm_id=?
    ORDER BY updated_at DESC LIMIT ?
  `).all(userId, firmId, limit) as any[]).map((r) => ({
    id: r.id, firmId: r.firm_id, userId: r.user_id, clientId: r.client_id,
    title: r.title, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export function appendMessage(input: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sourceStatus?: SourceStatus | null;
  citations?: CopilotCitation[];
  tools?: ToolTrace[];
  warnings?: string[];
  modelProvider?: string | null;
  modelName?: string | null;
}): MessageRow {
  const id = uid();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO copilot_messages
      (id, conversation_id, role, content, source_status, citations_json, tools_json,
       warnings_json, model_provider, model_name, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    input.conversationId,
    input.role,
    input.content.slice(0, 20_000),
    input.sourceStatus || null,
    JSON.stringify((input.citations || []).slice(0, 24)),
    JSON.stringify((input.tools || []).slice(0, 20)),
    JSON.stringify((input.warnings || []).slice(0, 20)),
    input.modelProvider || null,
    input.modelName || null,
    now,
  );
  touchConversation(input.conversationId);
  return getMessage(id)!;
}

export function getMessage(id: string): MessageRow | null {
  const r: any = db().prepare("SELECT * FROM copilot_messages WHERE id=?").get(id);
  if (!r) return null;
  return rowMessage(r);
}

export function listMessages(conversationId: string, limit = 40): MessageRow[] {
  return (db().prepare(`
    SELECT * FROM copilot_messages WHERE conversation_id=?
    ORDER BY created_at ASC LIMIT ?
  `).all(conversationId, limit) as any[]).map(rowMessage);
}

function rowMessage(r: any): MessageRow {
  const parse = <T>(s: string, fallback: T): T => {
    try { return JSON.parse(s || "null") ?? fallback; } catch { return fallback; }
  };
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    sourceStatus: r.source_status,
    citations: parse(r.citations_json, []),
    tools: parse(r.tools_json, []),
    warnings: parse(r.warnings_json, []),
    modelProvider: r.model_provider,
    modelName: r.model_name,
    createdAt: r.created_at,
  };
}
