/**
 * Secure on-disk storage for source documents under DATA_DIR/documents.
 * Paths never leave the server — APIs expose IDs only.
 */

import { createHash, randomBytes } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import path from "path";

export function documentsRoot(): string {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dir, "documents");
}

/** Resolve a controlled storage path; rejects traversal. */
export function documentFilePath(
  clientId: string,
  documentId: string,
  ext: string,
  opts?: { quarantine?: boolean },
): string {
  const safeClient = sanitizeId(clientId);
  const safeDoc = sanitizeId(documentId);
  const safeExt = sanitizeExt(ext);
  const root = path.resolve(documentsRoot());
  const dir = opts?.quarantine
    ? path.resolve(root, "quarantine", safeClient, safeDoc)
    : path.resolve(root, safeClient, safeDoc);
  if (!dir.startsWith(root + path.sep) && dir !== root) {
    throw new Error("Invalid document storage path.");
  }
  return path.join(dir, `original${safeExt}`);
}

export function sanitizeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid identifier.");
  return id;
}

export function sanitizeExt(ext: string): string {
  const e = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (!/^\.[a-z0-9]{1,8}$/.test(e)) return ".bin";
  return e;
}

/** Strip path components from an uploaded filename. */
export function safeOriginalFilename(name: string): string {
  const base = path.basename(name || "upload.bin").replace(/[\x00-\x1f]/g, "");
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
  return cleaned || "upload.bin";
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function storeDocumentFile(opts: {
  clientId: string;
  documentId: string;
  ext: string;
  bytes: Buffer;
  quarantine?: boolean;
}): { storageReference: string; absolutePath: string } {
  const absolutePath = documentFilePath(opts.clientId, opts.documentId, opts.ext, {
    quarantine: opts.quarantine,
  });
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, opts.bytes);
  // Relative reference stored in DB — never return absolute to clients.
  const parts = opts.quarantine
    ? ["documents", "quarantine", sanitizeId(opts.clientId), sanitizeId(opts.documentId), `original${sanitizeExt(opts.ext)}`]
    : ["documents", sanitizeId(opts.clientId), sanitizeId(opts.documentId), `original${sanitizeExt(opts.ext)}`];
  const storageReference = path.posix.join(...parts);
  return { storageReference, absolutePath };
}

export function readDocumentFile(clientId: string, documentId: string, ext: string): Buffer {
  const p = documentFilePath(clientId, documentId, ext);
  if (!existsSync(p)) throw new Error("Source file missing.");
  return readFileSync(p);
}

export function resolveStoredAbsolute(storageReference: string): string {
  const root = path.resolve(documentsRoot());
  const dataRoot = path.resolve(path.dirname(root)); // DATA_DIR
  const abs = path.resolve(dataRoot, storageReference);
  if (!abs.startsWith(root + path.sep)) throw new Error("Invalid storage reference.");
  return abs;
}

export function newDocumentId(): string {
  return randomBytes(12).toString("hex");
}

export function removeDocumentFile(clientId: string, documentId: string, ext: string) {
  try {
    const p = documentFilePath(clientId, documentId, ext);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* best-effort */ }
}
