/**
 * Native document parser — CSV/TSV/plain tables without Docling.
 * Never evaluates spreadsheet formulas.
 */

import { NATIVE_DOC_ENGINE_VERSION, type ParsedDocument, type ParsedTable } from "./types";

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseDelimitedText(text: string, filename = "file.csv"): ParsedDocument {
  const warnings: string[] = [];
  const delim = filename.toLowerCase().endsWith(".tsv") || text.indexOf("\t") > text.indexOf(",")
    ? "\t"
    : ",";
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) {
    return {
      engine: "native",
      engineVersion: NATIVE_DOC_ENGINE_VERSION,
      pageCount: 1,
      textBlocks: [],
      tables: [],
      metadata: { filename },
      warnings: ["File contained no rows."],
    };
  }

  const rows = lines.map((l) => splitCsvLine(l, delim));
  const width = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  });

  // Heuristic: first row is header if it has more alpha than digits
  const headerCandidate = normalized[0];
  const alpha = headerCandidate.join("").replace(/[^a-zA-Z]/g, "").length;
  const digits = headerCandidate.join("").replace(/[^0-9]/g, "").length;
  const hasHeader = alpha >= digits;

  let table: ParsedTable;
  if (hasHeader) {
    table = {
      headers: headerCandidate.map((h) => h || "Column"),
      rows: normalized.slice(1),
      source: { page: 1, tableIndex: 0 },
    };
  } else {
    table = {
      headers: headerCandidate.map((_, i) => `Column ${i + 1}`),
      rows: normalized,
      source: { page: 1, tableIndex: 0 },
    };
    warnings.push("No clear header row — synthetic column names assigned.");
  }

  return {
    engine: "native",
    engineVersion: NATIVE_DOC_ENGINE_VERSION,
    pageCount: 1,
    textBlocks: [{ text: lines.slice(0, 5).join("\n"), page: 1 }],
    tables: [table],
    metadata: { filename, delimiter: delim === "\t" ? "tab" : "comma", rowCount: table.rows.length },
    warnings,
  };
}

export function parseNativeBuffer(bytes: Buffer, filename: string, mimeType: string): ParsedDocument {
  if (
    mimeType === "text/csv" ||
    mimeType === "text/plain" ||
    mimeType === "text/tab-separated-values" ||
    /\.(csv|tsv|txt)$/i.test(filename)
  ) {
    return parseDelimitedText(bytes.toString("utf8"), filename);
  }
  return {
    engine: "native",
    engineVersion: NATIVE_DOC_ENGINE_VERSION,
    pageCount: null,
    textBlocks: [],
    tables: [],
    metadata: { filename, mimeType },
    warnings: [
      "Native parser supports CSV/TSV only. Enable document intelligence worker for PDF/XLSX, or convert to CSV.",
    ],
  };
}
