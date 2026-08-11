import { db, uid } from "../db";
import { audit } from "../auth";
import { firmIdForClient } from "../tenancy";
import type { QuestionStatus } from "./types";

export type ManagementQuestion = {
  id: string;
  firmId: string;
  clientId: string;
  periodId: string | null;
  releaseId: string | null;
  insightId: string | null;
  question: string;
  status: QuestionStatus;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  responseBody: string | null;
  responseBy: string | null;
  responseAt: string | null;
  responseReviewedBy: string | null;
  responseReviewedAt: string | null;
};

function row(r: any): ManagementQuestion {
  return {
    id: r.id, firmId: r.firm_id, clientId: r.client_id,
    periodId: r.period_id, releaseId: r.release_id, insightId: r.insight_id,
    question: r.question, status: r.status,
    createdBy: r.created_by, createdAt: r.created_at,
    publishedAt: r.published_at,
    responseBody: r.response_body, responseBy: r.response_by, responseAt: r.response_at,
    responseReviewedBy: r.response_reviewed_by, responseReviewedAt: r.response_reviewed_at,
  };
}

export function listQuestions(opts: {
  clientId: string;
  forClient?: boolean;
}): ManagementQuestion[] {
  let sql = `SELECT * FROM client_management_questions WHERE client_id=?`;
  const params: any[] = [opts.clientId];
  if (opts.forClient) {
    sql += ` AND status IN ('PUBLISHED','ANSWERED','CLOSED')`;
  }
  sql += ` ORDER BY COALESCE(published_at, created_at) DESC LIMIT 100`;
  return (db().prepare(sql).all(...params) as any[]).map(row);
}

export function getQuestion(id: string): ManagementQuestion | null {
  const r = db().prepare("SELECT * FROM client_management_questions WHERE id=?").get(id);
  return r ? row(r) : null;
}

export function createQuestion(input: {
  clientId: string;
  periodId?: string | null;
  releaseId?: string | null;
  insightId?: string | null;
  question: string;
  actorId: string;
  publish?: boolean;
}): ManagementQuestion {
  const firmId = firmIdForClient(input.clientId);
  if (!firmId) throw new Error("Client has no firm.");
  const id = uid();
  const status = input.publish ? "PUBLISHED" : "DRAFT";
  db().prepare(`
    INSERT INTO client_management_questions
      (id, firm_id, client_id, period_id, release_id, insight_id, question,
       status, created_by, published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, firmId, input.clientId, input.periodId || null, input.releaseId || null,
    input.insightId || null, input.question.trim(), status, input.actorId,
    input.publish ? new Date().toISOString() : null,
  );
  audit(input.actorId, input.publish ? "CLIENT_QUESTION_PUBLISHED" : "CLIENT_QUESTION_CREATED", id, {
    firmId, clientId: input.clientId,
  });
  return getQuestion(id)!;
}

export function publishQuestion(opts: {
  questionId: string; firmId: string; actorId: string;
}): ManagementQuestion | null {
  const existing: any = db().prepare(
    "SELECT * FROM client_management_questions WHERE id=? AND firm_id=?",
  ).get(opts.questionId, opts.firmId);
  if (!existing) return null;
  db().prepare(`
    UPDATE client_management_questions
    SET status='PUBLISHED', published_at=datetime('now') WHERE id=?
  `).run(opts.questionId);
  audit(opts.actorId, "CLIENT_QUESTION_PUBLISHED", opts.questionId, {
    firmId: opts.firmId, clientId: existing.client_id,
  });
  return getQuestion(opts.questionId);
}

/**
 * Client answers a published question. Response is engagement evidence —
 * not a verified accounting fact until staff reviews it.
 */
export function answerQuestion(opts: {
  questionId: string;
  clientId: string;
  userId: string;
  body: string;
}): ManagementQuestion | null {
  const existing: any = db().prepare(`
    SELECT * FROM client_management_questions
    WHERE id=? AND client_id=? AND status IN ('PUBLISHED','ANSWERED')
  `).get(opts.questionId, opts.clientId);
  if (!existing) return null;
  const body = opts.body.trim();
  if (body.length < 2 || body.length > 4000) throw new Error("Response must be 2–4000 characters.");
  db().prepare(`
    UPDATE client_management_questions
    SET status='ANSWERED', response_body=?, response_by=?, response_at=datetime('now')
    WHERE id=?
  `).run(body, opts.userId, opts.questionId);
  audit(opts.userId, "CLIENT_QUESTION_ANSWERED", opts.questionId, {
    firmId: existing.firm_id, clientId: opts.clientId,
  });
  return getQuestion(opts.questionId);
}

/** Staff may mark a response reviewed — still not an accounting fact. */
export function reviewQuestionResponse(opts: {
  questionId: string; firmId: string; actorId: string;
}): ManagementQuestion | null {
  const existing: any = db().prepare(
    "SELECT * FROM client_management_questions WHERE id=? AND firm_id=?",
  ).get(opts.questionId, opts.firmId);
  if (!existing || !existing.response_body) return null;
  db().prepare(`
    UPDATE client_management_questions
    SET response_reviewed_by=?, response_reviewed_at=datetime('now') WHERE id=?
  `).run(opts.actorId, opts.questionId);
  return getQuestion(opts.questionId);
}
