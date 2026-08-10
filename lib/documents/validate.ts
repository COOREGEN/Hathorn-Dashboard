import path from "path";
import { ALLOWED_MIME, MAX_DOCUMENT_BYTES } from "./types";
import { safeOriginalFilename } from "./storage";

export type ValidatedUpload = {
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  bytes: Buffer;
};

const EXT_TO_MIME: Record<string, string> = {
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Magic-byte sniff for a few common types — never trust extension alone. */
function sniffMime(buf: Buffer, claimed: string, ext: string): string | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "application/pdf";
  }
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // ZIP container — xlsx/docx/pptx
    if (ext === ".xlsx") return EXT_TO_MIME[".xlsx"];
    if (ext === ".docx") return EXT_TO_MIME[".docx"];
    if (ext === ".pptx") return EXT_TO_MIME[".pptx"];
    if (claimed.includes("spreadsheet")) return EXT_TO_MIME[".xlsx"];
    if (claimed.includes("wordprocessing")) return EXT_TO_MIME[".docx"];
    return EXT_TO_MIME[".xlsx"];
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // Textual CSV/TSV — allow if mostly printable
  const sample = buf.subarray(0, Math.min(buf.length, 2048)).toString("utf8");
  if (/^[\x09\x0a\x0d\x20-\x7e]+$/.test(sample) || sample.includes(",") || sample.includes("\t")) {
    if (ext === ".tsv") return "text/tab-separated-values";
    if (ext === ".txt") return "text/plain";
    return "text/csv";
  }
  return null;
}

export function validateUpload(file: File | { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ValidatedUpload> {
  return (async () => {
    const filename = safeOriginalFilename(file.name || "upload.bin");
    const ext = path.extname(filename).toLowerCase() || ".bin";
    if (file.size <= 0) throw new Error("Empty file rejected.");
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new Error(`File exceeds ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB limit.`);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(bytes, file.type || "", ext);
    const mimeType = sniffed || (EXT_TO_MIME[ext] ?? "");
    if (!mimeType || !ALLOWED_MIME[mimeType]) {
      throw new Error("File type not allowed. Upload CSV, XLSX, PDF, DOCX, or an image.");
    }
    const allowedExts = ALLOWED_MIME[mimeType];
    if (!allowedExts.includes(ext) && !(mimeType === "text/csv" && ext === ".txt")) {
      // Extension mismatch after sniff — still allow if sniff is authoritative
      if (!sniffed) throw new Error("Filename extension does not match file contents.");
    }
    // Path traversal already stripped by safeOriginalFilename
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      throw new Error("Invalid filename.");
    }
    return { filename, ext, mimeType, size: bytes.length, bytes };
  })();
}
