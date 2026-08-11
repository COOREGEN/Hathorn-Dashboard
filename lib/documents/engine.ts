/**
 * Parse engine router — native CSV always; Python/Docling worker when enabled.
 */

import { parseNativeBuffer } from "./native-parser";
import { documentIntelligenceStatus, runDocumentWorker } from "./docling-adapter";
import type { ParsedDocument } from "./types";

export async function parseDocumentBytes(opts: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  absolutePath?: string;
}): Promise<ParsedDocument> {
  const st = documentIntelligenceStatus();
  const isText =
    opts.mimeType === "text/csv" ||
    opts.mimeType === "text/plain" ||
    opts.mimeType === "text/tab-separated-values" ||
    /\.(csv|tsv|txt)$/i.test(opts.filename);

  // Prefer native for delimited text — fast, deterministic, no Python.
  if (isText) {
    return parseNativeBuffer(opts.bytes, opts.filename, opts.mimeType);
  }

  if (st.enabled && opts.absolutePath) {
    try {
      return await runDocumentWorker(opts.absolutePath);
    } catch (e: any) {
      const fallback = parseNativeBuffer(opts.bytes, opts.filename, opts.mimeType);
      fallback.warnings = [
        ...fallback.warnings,
        e?.message || "Worker parse failed.",
      ];
      return fallback;
    }
  }

  return parseNativeBuffer(opts.bytes, opts.filename, opts.mimeType);
}

export { documentIntelligenceStatus };
