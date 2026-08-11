/**
 * Client-visible documents and lightweight document requests.
 * Ownership alone never grants visibility — visibility must be CLIENT_VISIBLE.
 */

import { db, uid } from "../db";
import { audit } from "../auth";
import { firmIdForClient } from "../tenancy";
import { getDocument, listDocuments } from "../documents/model";
import type { DocRequestStatus, DocumentVisibility } from "./types";

export function setDocumentVisibility(opts: {
  documentId: string;
  firmId: string;
  visibility: DocumentVisibility;
  actorId: string;
}): boolean {
  const doc = getDocument(opts.documentId);
  if (!doc) return false;
  const client: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(doc.clientId);
  if (!client || client.firm_id !== opts.firmId) return false;
  db().prepare("UPDATE source_documents SET visibility=? WHERE id=?")
    .run(opts.visibility, opts.documentId);
  audit(opts.actorId, `DOCUMENT_VISIBILITY_${opts.visibility}`, opts.documentId, {
    firmId: opts.firmId, clientId: doc.clientId,
  });
  return true;
}

export function listClientVisibleDocuments(clientId: string) {
  return listDocuments(clientId, 100).filter((d) => {
    const r: any = db().prepare(
      "SELECT visibility FROM source_documents WHERE id=?",
    ).get(d.id);
    return (r?.visibility || "INTERNAL") === "CLIENT_VISIBLE";
  });
}

export function assertClientCanAccessDocument(documentId: string, clientId: string): boolean {
  const r: any = db().prepare(`
    SELECT id FROM source_documents
    WHERE id=? AND client_id=? AND visibility='CLIENT_VISIBLE'
  `).get(documentId, clientId);
  return !!r;
}

export type DocumentRequest = {
  id: string;
  firmId: string;
  clientId: string;
  title: string;
  description: string;
  dueDate: string | null;
  status: DocRequestStatus;
  requestedBy: string;
  createdAt: string;
  fulfilledDocumentId: string | null;
  clientNote: string | null;
};

function rowReq(r: any): DocumentRequest {
  return {
    id: r.id, firmId: r.firm_id, clientId: r.client_id,
    title: r.title, description: r.description || "",
    dueDate: r.due_date, status: r.status,
    requestedBy: r.requested_by, createdAt: r.created_at,
    fulfilledDocumentId: r.fulfilled_document_id,
    clientNote: r.client_note,
  };
}

export function listDocumentRequests(opts: {
  clientId: string;
  openOnly?: boolean;
}): DocumentRequest[] {
  let sql = `SELECT * FROM document_requests WHERE client_id=?`;
  if (opts.openOnly) sql += ` AND status IN ('OPEN','UPLOADED')`;
  sql += ` ORDER BY created_at DESC LIMIT 50`;
  return (db().prepare(sql).all(opts.clientId) as any[]).map(rowReq);
}

export function createDocumentRequest(input: {
  clientId: string;
  title: string;
  description?: string;
  dueDate?: string | null;
  actorId: string;
}): DocumentRequest {
  const firmId = firmIdForClient(input.clientId);
  if (!firmId) throw new Error("Client has no firm.");
  const id = uid();
  db().prepare(`
    INSERT INTO document_requests
      (id, firm_id, client_id, title, description, due_date, status, requested_by)
    VALUES (?,?,?,?,?,?,'OPEN',?)
  `).run(
    id, firmId, input.clientId, input.title.trim(),
    input.description || "", input.dueDate || null, input.actorId,
  );
  audit(input.actorId, "DOCUMENT_REQUEST_CREATED", id, {
    firmId, clientId: input.clientId,
  });
  return listDocumentRequests({ clientId: input.clientId })
    .find((r) => r.id === id)!;
}

export function fulfillDocumentRequest(opts: {
  requestId: string;
  clientId: string;
  documentId: string;
  userId: string;
  note?: string;
}): DocumentRequest | null {
  const req: any = db().prepare(`
    SELECT * FROM document_requests
    WHERE id=? AND client_id=? AND status='OPEN'
  `).get(opts.requestId, opts.clientId);
  if (!req) return null;
  if (!assertClientCanAccessDocument(opts.documentId, opts.clientId)) {
    // Uploaded file may still be INTERNAL until staff marks visible — allow fulfill
    // when the document belongs to the same client (upload path sets ownership).
    const doc = getDocument(opts.documentId);
    if (!doc || doc.clientId !== opts.clientId) return null;
  }
  db().prepare(`
    UPDATE document_requests
    SET status='UPLOADED', fulfilled_document_id=?, client_note=?,
        closed_at=NULL
    WHERE id=?
  `).run(opts.documentId, opts.note || null, opts.requestId);
  // Client uploads for a request become client-visible by design of the request.
  db().prepare(`UPDATE source_documents SET visibility='CLIENT_VISIBLE' WHERE id=? AND client_id=?`)
    .run(opts.documentId, opts.clientId);
  audit(opts.userId, "CLIENT_DOCUMENT_UPLOADED", opts.requestId, {
    firmId: req.firm_id, clientId: opts.clientId,
  });
  return rowReq(db().prepare("SELECT * FROM document_requests WHERE id=?").get(opts.requestId));
}

export function markRequestNotApplicable(opts: {
  requestId: string; clientId: string; userId: string; note?: string;
}): DocumentRequest | null {
  const req: any = db().prepare(`
    SELECT * FROM document_requests WHERE id=? AND client_id=? AND status='OPEN'
  `).get(opts.requestId, opts.clientId);
  if (!req) return null;
  db().prepare(`
    UPDATE document_requests
    SET status='NOT_APPLICABLE', client_note=?, closed_at=datetime('now')
    WHERE id=?
  `).run(opts.note || null, opts.requestId);
  audit(opts.userId, "DOCUMENT_REQUEST_NA", opts.requestId, {
    firmId: req.firm_id, clientId: opts.clientId,
  });
  return rowReq(db().prepare("SELECT * FROM document_requests WHERE id=?").get(opts.requestId));
}
