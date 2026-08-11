/**
 * Docling / Python worker adapter.
 *
 * DOCLING PILOT: BLOCKED — MODULE STILL WORKS
 *
 * Full `docling` pulls Torch + CUDA (~GB). Not installed in this environment.
 * The worker (`services/document-intelligence/parse_document.py`) tries Docling
 * first, then falls back to openpyxl/pypdf lite parsing when available.
 *
 * Hathorn never requires the worker to boot. Native CSV parsing always works.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import type { ParsedDocument } from "./types";

export type DocIntelStatus = {
  enabled: boolean;
  doclingAvailable: boolean;
  workerPath: string;
  python: string;
  reason: string;
};

export function documentIntelligenceStatus(): DocIntelStatus {
  const enabled = !["0", "false", "no", "off", ""].includes(
    String(process.env.DOCUMENT_INTELLIGENCE_ENABLED ?? "0").toLowerCase(),
  );
  const python = process.env.DOCLING_PYTHON || "python3";
  const workerPath = path.join(process.cwd(), "services", "document-intelligence", "parse_document.py");
  const workerExists = existsSync(workerPath);
  if (!enabled) {
    return {
      enabled: false, doclingAvailable: false, workerPath, python,
      reason: "DOCUMENT_INTELLIGENCE_ENABLED is off (default). Native CSV parsing still available.",
    };
  }
  if (!workerExists) {
    return {
      enabled: true, doclingAvailable: false, workerPath, python,
      reason: "Worker script missing.",
    };
  }
  return {
    enabled: true,
    doclingAvailable: false, // until a successful docling probe; set by probe if needed
    workerPath,
    python,
    reason: "Worker enabled. Docling package not required — lite fallback used when Docling absent.",
  };
}

/**
 * Invoke the Python worker with a controlled absolute path (never user-supplied).
 * Uses spawn with fixed argv — no shell.
 */
export function runDocumentWorker(absoluteFilePath: string, timeoutMs = 45_000): Promise<ParsedDocument> {
  const st = documentIntelligenceStatus();
  if (!st.enabled) {
    throw new Error("Document intelligence worker is disabled.");
  }
  if (!existsSync(st.workerPath)) {
    throw new Error("Document worker is not installed.");
  }
  if (!absoluteFilePath || absoluteFilePath.includes("\0")) {
    throw new Error("Invalid file reference.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(st.python, [st.workerPath, absoluteFilePath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Document parsing timed out."));
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > 4_000_000) {
        child.kill("SIGKILL");
        reject(new Error("Parser output exceeded size limit."));
      }
    });
    child.stderr.on("data", (d) => {
      err += d;
      if (err.length > 200_000) err = err.slice(0, 200_000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start document worker: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("We couldn't process this document. The original file is still available."));
        return;
      }
      try {
        const json = JSON.parse(out);
        if (json.error) {
          reject(new Error("We couldn't process this document. The original file is still available."));
          return;
        }
        resolve(normalizeWorkerOutput(json));
      } catch {
        reject(new Error("We couldn't process this document. The original file is still available."));
      }
    });
  });
}

function normalizeWorkerOutput(json: any): ParsedDocument {
  return {
    engine: String(json.engine || "python-worker"),
    engineVersion: String(json.version || json.engine_version || "unknown"),
    pageCount: json.document?.page_count ?? json.page_count ?? null,
    textBlocks: Array.isArray(json.text_blocks)
      ? json.text_blocks.map((b: any) => ({ text: String(b.text || b), page: b.page }))
      : [],
    tables: Array.isArray(json.tables)
      ? json.tables.map((t: any, i: number) => ({
          headers: (t.headers || []).map(String),
          rows: (t.rows || []).map((r: any[]) => r.map((c) => (c == null ? "" : String(c)))),
          source: { page: t.page ?? t.source?.page, tableIndex: t.table_index ?? i },
        }))
      : [],
    metadata: json.metadata || {},
    warnings: Array.isArray(json.warnings) ? json.warnings.map(String) : [],
  };
}
