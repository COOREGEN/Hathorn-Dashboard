/**
 * Source document persistence and extraction pipeline.
 * Never writes to pl_lines, payroll_lines, release_records, or QBO.
 */

import { db, uid } from "../db";
import { classifyDocument } from "./classify";
import { extractStructured } from "./extract";
import { parseDocumentBytes, documentIntelligenceStatus } from "./engine";
import { readFileSync } from "fs";
import {
  newDocumentId, readDocumentFile, resolveStoredAbsolute, sha256Buffer,
  storeDocumentFile, sanitizeExt,
} from "./storage";
import { validateUpload } from "./validate";
import { malwareScanEnabled, scanBytes } from "./malware";
import type {
  DocumentStatus, DocumentType, ExtractionRun, SourceDocument, StructuredDraft,
} from "./types";
import path from "path";

function rowToDoc(r: any): SourceDocument {
  return {
    id: r.id,
    clientId: r.client_id,
    periodId: r.period_id,
    documentType: r.document_type,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    sha256: r.sha256,
    status: r.status,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    reviewedJson: r.reviewed_json ? JSON.parse(r.reviewed_json) : null,
    notes: r.notes,
  };
}

function rowToExtraction(r: any): ExtractionRun {
  return {
    id: r.id,
    documentId: r.document_id,
    engine: r.engine,
    engineVersion: r.engine_version,
    status: r.status,
    rawResult: r.raw_result_json ? JSON.parse(r.raw_result_json) : null,
    structuredResult: r.structured_result_json ? JSON.parse(r.structured_result_json) : null,
    confidenceSummary: r.confidence_summary,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export function listDocuments(clientId: string, limit = 50): SourceDocument[] {
  const rows = db().prepare(
    `SELECT * FROM source_documents WHERE client_id=? ORDER BY uploaded_at DESC LIMIT ?`,
  ).all(clientId, limit);
  return rows.map(rowToDoc);
}

export function getDocument(id: string): SourceDocument | null {
  const r = db().prepare("SELECT * FROM source_documents WHERE id=?").get(id);
  return r ? rowToDoc(r) : null;
}

export function findDuplicates(clientId: string, sha256: string, excludeId?: string): SourceDocument[] {
  const rows = excludeId
    ? db().prepare(
        `SELECT * FROM source_documents WHERE client_id=? AND sha256=? AND id!=? ORDER BY uploaded_at DESC`,
      ).all(clientId, sha256, excludeId)
    : db().prepare(
        `SELECT * FROM source_documents WHERE client_id=? AND sha256=? ORDER BY uploaded_at DESC`,
      ).all(clientId, sha256);
  return rows.map(rowToDoc);
}

export function listExtractions(documentId: string): ExtractionRun[] {
  return db().prepare(
    `SELECT * FROM document_extractions WHERE document_id=? ORDER BY created_at DESC`,
  ).all(documentId).map(rowToExtraction);
}

export function latestExtraction(documentId: string): ExtractionRun | null {
  const r = db().prepare(
    `SELECT * FROM document_extractions WHERE document_id=? ORDER BY created_at DESC LIMIT 1`,
  ).get(documentId);
  return r ? rowToExtraction(r) : null;
}

export async function uploadDocument(opts: {
  clientId: string;
  periodId?: string | null;
  documentType?: DocumentType | null;
  file: File;
  uploadedBy: string;
  autoParse?: boolean;
}): Promise<{ document: SourceDocument; duplicates: SourceDocument[]; extraction?: ExtractionRun }> {
  const client = db().prepare("SELECT id FROM clients WHERE id=?").get(opts.clientId);
  if (!client) throw new Error("Client not found.");

  if (opts.periodId) {
    const p: any = db().prepare("SELECT id, client_id FROM periods WHERE id=?").get(opts.periodId);
    if (!p || p.client_id !== opts.clientId) throw new Error("Period not found for this client.");
  }

  const validated = await validateUpload(opts.file);
  const sha256 = sha256Buffer(validated.bytes);
  const duplicates = findDuplicates(opts.clientId, sha256);

  // Quarantine → scan → only then parse. Infected/error never reach Docling/AI.
  let initialStatus: DocumentStatus = "UPLOADED";
  let scanNote: string | null = null;
  if (malwareScanEnabled()) {
    const scan = scanBytes(validated.bytes, validated.filename);
    if (scan.status === "infected" || scan.status === "error") {
      initialStatus = "QUARANTINED";
      scanNote = `${scan.status}: ${scan.detail}`;
    } else if (scan.status === "clean") {
      scanNote = scan.detail;
    }
  }

  const id = newDocumentId();
  const { storageReference } = storeDocumentFile({
    clientId: opts.clientId,
    documentId: id,
    ext: validated.ext,
    bytes: validated.bytes,
  });

  const docType = opts.documentType || "OTHER";
  const uploadedAt = new Date().toISOString();

  db().prepare(`
    INSERT INTO source_documents
      (id, client_id, period_id, document_type, original_filename, mime_type, file_size,
       storage_reference, sha256, status, uploaded_by, uploaded_at, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, opts.clientId, opts.periodId || null, docType, validated.filename, validated.mimeType,
    validated.size, storageReference, sha256, initialStatus, opts.uploadedBy, uploadedAt,
    scanNote,
  );

  let extraction: ExtractionRun | undefined;
  if (initialStatus === "QUARANTINED") {
    return { document: getDocument(id)!, duplicates, extraction };
  }

  const st = documentIntelligenceStatus();
  const shouldParse = opts.autoParse !== false && (
    st.enabled ||
    validated.mimeType === "text/csv" ||
    validated.mimeType === "text/tab-separated-values" ||
    validated.mimeType === "text/plain"
  );

  if (shouldParse) {
    extraction = await processDocument(id, opts.documentType || null);
  }

  return { document: getDocument(id)!, duplicates, extraction };
}

export async function processDocument(
  documentId: string,
  typeHint?: DocumentType | null,
): Promise<ExtractionRun> {
  const docRow: any = db().prepare("SELECT * FROM source_documents WHERE id=?").get(documentId);
  if (!docRow) throw new Error("Document not found.");
  if (docRow.status === "QUARANTINED") {
    throw new Error("Document is quarantined — parser and AI processing are blocked.");
  }

  setStatus(documentId, "PROCESSING");
  const extractionId = uid();
  const createdAt = new Date().toISOString();
  db().prepare(`
    INSERT INTO document_extractions
      (id, document_id, engine, engine_version, status, created_at)
    VALUES (?,?,?,?,?,?)
  `).run(extractionId, documentId, "pending", "", "PENDING", createdAt);

  try {
    const ext = path.extname(docRow.original_filename) || ".bin";
    const abs = resolveStoredAbsolute(docRow.storage_reference);
    const bytes = readDocumentFile(docRow.client_id, documentId, sanitizeExt(ext));

    const parsed = await parseDocumentBytes({
      bytes,
      filename: docRow.original_filename,
      mimeType: docRow.mime_type,
      absolutePath: abs,
    });

    const classified = classifyDocument(
      docRow.original_filename,
      parsed,
      typeHint || docRow.document_type,
    );
    const structured = extractStructured(classified, parsed);
    const completedAt = new Date().toISOString();

    db().prepare(`
      UPDATE document_extractions SET
        engine=?, engine_version=?, status=?, raw_result_json=?, structured_result_json=?,
        confidence_summary=?, error_message=NULL, completed_at=?
      WHERE id=?
    `).run(
      parsed.engine, parsed.engineVersion, "OK",
      JSON.stringify(parsed), JSON.stringify(structured),
      structured.confidence, completedAt, extractionId,
    );

    db().prepare(`UPDATE source_documents SET document_type=?, status=? WHERE id=?`).run(
      classified,
      structured.confidence === "HIGH_CONFIDENCE" ? "NEEDS_REVIEW" : "NEEDS_REVIEW",
      documentId,
    );
    // Always NEEDS_REVIEW after parse — human must approve.
    setStatus(documentId, parsed.tables.length ? "NEEDS_REVIEW" : "PARSED");
    if (!parsed.tables.length && parsed.warnings.length) {
      // still mark parsed if we got something
      if (parsed.textBlocks.length) setStatus(documentId, "NEEDS_REVIEW");
      else setStatus(documentId, "FAILED");
    }

    return latestExtraction(documentId)!;
  } catch (e: any) {
    const msg = "We couldn't process this document. The original file is still available.";
    db().prepare(`
      UPDATE document_extractions SET status=?, error_message=?, engine=?, engine_version=?, completed_at=?
      WHERE id=?
    `).run("FAILED", msg, "error", "", new Date().toISOString(), extractionId);
    setStatus(documentId, "FAILED");
    // Log detail server-side only via throw message for caller logging
    console.error("[documents] parse failed", documentId, e?.message || e);
    return latestExtraction(documentId)!;
  }
}

function setStatus(id: string, status: DocumentStatus) {
  db().prepare("UPDATE source_documents SET status=? WHERE id=?").run(status, id);
}

export function updateDocumentType(id: string, documentType: DocumentType) {
  db().prepare("UPDATE source_documents SET document_type=? WHERE id=?").run(documentType, id);
}

export function saveReviewedDraft(id: string, draft: StructuredDraft, notes?: string) {
  db().prepare(
    `UPDATE source_documents SET reviewed_json=?, notes=COALESCE(?, notes), status='NEEDS_REVIEW' WHERE id=?`,
  ).run(JSON.stringify(draft), notes ?? null, id);
}

export function approveDocument(id: string) {
  const doc = getDocument(id);
  if (!doc) throw new Error("Document not found.");
  if (!["PARSED", "NEEDS_REVIEW"].includes(doc.status) && !doc.reviewedJson) {
    const ex = latestExtraction(id);
    if (!ex || ex.status !== "OK") throw new Error("Document has no successful extraction to approve.");
  }
  setStatus(id, "APPROVED");
}

export function rejectDocument(id: string, reason?: string) {
  db().prepare(
    `UPDATE source_documents SET status='REJECTED', notes=COALESCE(?, notes) WHERE id=?`,
  ).run(reason || null, id);
}

/** Fingerprint accounting tables for separation tests. */
export function accountingFingerprint(clientId: string) {
  const d = db();
  const periods = (d.prepare("SELECT COUNT(*) n FROM periods WHERE client_id=?").get(clientId) as any).n;
  const pl = (d.prepare(
    `SELECT COUNT(*) n FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id=?)`,
  ).get(clientId) as any).n;
  const payroll = (d.prepare(
    `SELECT COUNT(*) n FROM payroll_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id=?)`,
  ).get(clientId) as any).n;
  const releases = (d.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(length(snapshot)),0) bytes FROM release_records WHERE client_id=?`,
  ).get(clientId) as any);
  return { periods, pl, payroll, releaseCount: releases.n, releaseBytes: releases.bytes };
}

export function getDocumentFileBytes(documentId: string): { bytes: Buffer; filename: string; mimeType: string } {
  const r: any = db().prepare("SELECT * FROM source_documents WHERE id=?").get(documentId);
  if (!r) throw new Error("Document not found.");
  const abs = resolveStoredAbsolute(r.storage_reference);
  return { bytes: readFileSync(abs), filename: r.original_filename, mimeType: r.mime_type };
}
