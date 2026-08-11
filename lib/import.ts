/**
 * Document intake.
 *
 * The platform used to demand CSVs with exact column names. Nobody has those. A firm has
 * a QuickBooks P&L with the company name in row 1, the report title in row 2, blanks in
 * row 3, headers in row 4, a "Total Income" subtotal partway down, and a "TOTAL" row at
 * the bottom that must not be imported as a line. Payroll arrives from a different system
 * with different words for the same things.
 *
 * Reshaping that by hand is around forty minutes per client per month. At twenty clients
 * that is a working week, and the service model fails on arithmetic before anyone
 * evaluates the dashboard. **Intake is the constraint on the business**, which is why it
 * is worth this much code.
 *
 * The approach: read the file as it arrives, work out what it is and what the columns
 * mean, show that interpretation once for a human to approve, then remember it for that
 * client. The second month is one click.
 */

import { db, uid } from "./db";

export type DocType = "PNL" | "PAYROLL" | "AR" | "CASH" | "BALANCE" | "VOLUME" | "UNKNOWN";

export type Detection = {
  docType: DocType;
  /**
   * True when each business is a column rather than a row value — the shape QuickBooks
   * "by Class" and "by Location" reports actually arrive in. The rows have to be
   * unpivoted before anything downstream can use them.
   */
  wideFormat: boolean;
  /** Column index -> entity name, for a wide file. */
  entityColumns: Record<number, string>;
  confidence: number;          // 0–1
  sourceLabel: string;         // "QuickBooks P&L", so a human recognises it
  headerRow: number;           // zero-based index of the real header row
  headers: string[];
  /** Field name -> incoming column index. */
  columnMap: Record<string, number>;
  /** Rows the parser intends to skip, and why. */
  skipped: { row: number; reason: string; preview: string }[];
  issues: string[];
  sampleRows: Record<string, any>[];
};

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Splits a CSV line respecting quotes.
 *
 * Exports routinely contain `"Smith, John"` and `"1,234.56"`, so naive splitting on
 * commas corrupts real data silently — which is the worst kind of import bug because the
 * numbers look plausible.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Sniffs the delimiter across several lines, not just the first.
 *
 * The first line of an export is usually a title — "PAYROLL REGISTER SUMMARY" — which
 * contains no delimiter at all. Judging on that line alone picks the wrong one and the
 * entire file parses as a single column, which then looks like an empty import rather
 * than a parsing failure.
 */
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  const score = (d: string) => {
    const counts = lines.map((l) => (l.split(d).length - 1));
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length < 2) return 0;
    // A real delimiter appears consistently across most rows.
    const mode = nonZero.sort((a, b) => a - b)[Math.floor(nonZero.length / 2)];
    const consistent = counts.filter((c) => c === mode).length;
    return mode * consistent;
  };
  const best = [["\t", score("\t")], [",", score(",")], [";", score(";")], ["|", score("|")]]
    .sort((a, b) => (b[1] as number) - (a[1] as number))[0];
  return (best[1] as number) > 0 ? (best[0] as string) : ",";
}

export function parseRows(text: string): string[][] {
  const delim = detectDelimiter(text);
  return text.split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => (delim === "," ? splitCsvLine(l) : l.split(delim).map((s) => s.trim().replace(/^"|"$/g, ""))));
}

/**
 * Reads a number the way accounting software writes them.
 *
 * `$1,234.56`, `(1,234.56)` for negative, `1 234,56` in some locales, `—` for nil, and a
 * trailing `CR`. Returning null rather than zero matters: a cell that could not be read
 * is not the same as a zero, and treating it as one silently changes a total.
 */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "—" || s === "–" || s.toLowerCase() === "n/a") return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/CR$/i.test(s)) { negative = true; s = s.replace(/CR$/i, ""); }
  if (/DR$/i.test(s)) s = s.replace(/DR$/i, "");

  s = s.replace(/[$£€\s]/g, "");
  // European format: 1.234,56 — dot as thousands, comma as decimal.
  if (/,\d{2}$/.test(s) && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/* ------------------------------------------------------------------ */
/* Recognising what a file is                                          */
/* ------------------------------------------------------------------ */

/**
 * Vocabulary each document type uses.
 *
 * Deliberately generous — the same concept is called "Total Pay", "Gross Wages" and
 * "Regular Earnings" by three payroll systems, and an importer that only knows one of
 * them is an importer that does not work.
 */
const SIGNATURES: { type: DocType; label: string; terms: string[]; strong: string[] }[] = [
  { type: "PNL", label: "Profit & Loss",
    strong: ["profit and loss", "profit & loss", "income statement", "statement of operations"],
    terms: ["income", "revenue", "sales", "cost of goods", "cogs", "gross profit", "expense",
            "net income", "net ordinary income", "operating income"] },
  { type: "PAYROLL", label: "Payroll register",
    strong: ["payroll register", "payroll summary", "payroll detail"],
    terms: ["gross pay", "gross wages", "regular", "overtime", "employer tax", "fica",
            "workers comp", "hours", "net pay", "earnings", "employee"] },
  { type: "AR", label: "Receivables ageing",
    strong: ["a/r aging", "ar aging", "accounts receivable aging", "aged receivables"],
    terms: ["current", "1 - 30", "31 - 60", "61 - 90", "over 90", "91 and over",
            "customer", "payer", "total", "days"] },
  { type: "BALANCE", label: "Balance sheet",
    strong: ["balance sheet", "statement of financial position"],
    terms: ["assets", "liabilities", "equity", "current assets", "fixed assets",
            "accounts payable", "retained earnings"] },
  { type: "CASH", label: "Cash / bank balances",
    strong: ["bank balance", "cash summary", "statement of cash"],
    terms: ["operating", "reserve", "savings", "checking", "balance", "account"] },
  { type: "VOLUME", label: "Volume / units",
    strong: [],
    terms: ["units", "nights", "occupancy", "enrolled", "capacity", "jobs", "covers", "sold"] },
];

/** Header words that map to each of our fields, in priority order. */
const FIELD_HINTS: Record<DocType, Record<string, string[]>> = {
  PNL: {
    entity: ["class", "location", "department", "entity", "business", "segment", "division"],
    label: ["account", "description", "line", "name", "item", "category"],
    amount: ["amount", "total", "balance", "current period", "actual", "ytd", "value"],
  },
  PAYROLL: {
    entity: ["class", "location", "department", "entity", "division", "cost center"],
    wages: ["gross pay", "gross wages", "regular pay", "regular", "earnings", "wages", "salary"],
    otPremium: ["overtime", "ot premium", "o/t", "ot pay", "overtime pay"],
    taxes: ["employer tax", "er tax", "payroll tax", "fica", "futa", "suta", "taxes"],
    workersComp: ["workers comp", "work comp", "wc", "comp premium"],
    processing: ["fee", "processing", "admin", "service charge"],
    hoursPaid: ["hours", "total hours", "hrs", "regular hours", "paid hours"],
  },
  AR: {
    payer: ["customer", "payer", "client", "name", "account", "insurer"],
    b0_30: ["current", "0 - 30", "1 - 30", "0-30", "1-30", "not yet due"],
    b31_60: ["31 - 60", "31-60", "30 - 60", "30-60"],
    b61_90: ["61 - 90", "61-90", "60 - 90", "60-90"],
    b90p: ["over 90", "91 and over", "90+", "> 90", "91+", "older"],
  },
  CASH: {
    label: ["account", "name", "description", "bank"],
    amount: ["balance", "amount", "total", "ending balance"],
  },
  BALANCE: {
    section: ["section", "type", "classification"],
    label: ["account", "description", "line", "name"],
    amount: ["amount", "total", "balance"],
  },
  VOLUME: {
    entity: ["class", "location", "property", "room", "entity", "business", "unit"],
    unitsSold: ["sold", "units", "nights", "enrolled", "delivered", "actual", "count"],
    unitsAvailable: ["available", "capacity", "licensed", "possible"],
  },
  UNKNOWN: {},
};

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Finds the real header row.
 *
 * Accounting exports put the company name, report title and date range above the headers,
 * so row 0 is almost never right. The header row is the one whose cells look like labels
 * rather than data: mostly non-numeric, mostly non-empty, and containing several distinct
 * values.
 */
function findHeaderRow(rows: string[][]): number {
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i];
    const filled = r.filter((c) => c.trim()).length;
    if (filled < 2) continue;
    const numeric = r.filter((c) => parseAmount(c) !== null).length;
    const distinct = new Set(r.map(norm).filter(Boolean)).size;
    // Labels, not figures: reward filled distinct cells, penalise numbers heavily.
    const score = filled * 2 + distinct - numeric * 4 - i * 0.5;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Rows that are structure rather than data. */
function skipReason(cells: string[]): string | null {
  const joined = norm(cells.join(" "));
  if (!joined) return "blank";
  const first = norm(cells[0]);
  // Totals and subtotals would double-count if imported as lines.
  if (/^total\b/.test(first) || /\btotal$/.test(first)) return "total row";
  if (/^(net income|net ordinary income|gross profit|net profit)/.test(first)) return "computed subtotal";
  if (/^(report generated|printed|page \d)/.test(joined)) return "report footer";
  const numeric = cells.filter((c) => parseAmount(c) !== null).length;
  if (numeric === 0 && cells.filter((c) => c.trim()).length === 1) return "section heading";
  return null;
}

/**
 * Works out what a file is and what its columns mean.
 *
 * Never guesses silently — the detection is returned with its confidence and its skipped
 * rows so a human can confirm it once. An importer that quietly gets a column wrong is
 * worse than one that refuses, because the numbers still look plausible.
 */
export function detect(text: string, filename = ""): Detection {
  const rows = parseRows(text);
  const issues: string[] = [];

  if (!rows.length) {
    return { docType: "UNKNOWN", wideFormat: false, entityColumns: {}, confidence: 0,
      sourceLabel: "", headerRow: 0, headers: [], columnMap: {}, skipped: [],
      issues: ["The file is empty."], sampleRows: [] };
  }

  // Score every signature against the whole document, headers weighted heaviest.
  const head = rows.slice(0, 15).map((r) => norm(r.join(" "))).join(" ");
  const fileHint = norm(filename);
  let bestType: DocType = "UNKNOWN", bestScore = 0, bestLabel = "";

  for (const sig of SIGNATURES) {
    let score = 0;
    for (const s of sig.strong) if (head.includes(s) || fileHint.includes(s)) score += 6;
    for (const t of sig.terms) if (head.includes(t)) score += 1;
    for (const t of sig.terms) if (fileHint.includes(t)) score += 0.5;
    if (score > bestScore) { bestScore = score; bestType = sig.type; bestLabel = sig.label; }
  }

  const headerRow = findHeaderRow(rows);
  const headers = rows[headerRow] ?? [];

  /**
   * Detect a pivot layout.
   *
   * A "by Class" report has a blank or label-ish first cell followed by several columns
   * that are business names, usually ending in a TOTAL column. The giveaway is that two
   * or more non-total columns carry mostly numeric data beneath a non-numeric header.
   */
  const entityColumns: Record<number, string> = {};
  let wideFormat = false;
  if (["PNL", "BALANCE", "VOLUME"].includes(bestType)) {
    const candidates: number[] = [];
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c].trim();
      if (!h || parseAmount(h) !== null) continue;
      if (/^total$/i.test(h)) continue;
      const numeric = rows.slice(headerRow + 1, headerRow + 30)
        .filter((r) => parseAmount(r[c] ?? "") !== null).length;
      if (numeric >= 3) candidates.push(c);
    }
    if (candidates.length >= 2) {
      wideFormat = true;
      for (const c of candidates) entityColumns[c] = headers[c].trim();
    }
  }

  // Map our fields onto incoming columns.
  const hints = FIELD_HINTS[bestType] ?? {};
  const columnMap: Record<string, number> = {};
  const taken = new Set<number>();

  for (const [field, words] of Object.entries(hints)) {
    let found = -1;
    // Exact-ish match first, then substring, so "Total" does not steal "Total Hours".
    for (const w of words) {
      found = headers.findIndex((h, i) => !taken.has(i) && norm(h) === norm(w));
      if (found >= 0) break;
    }
    if (found < 0) {
      for (const w of words) {
        found = headers.findIndex((h, i) => !taken.has(i) && norm(h).includes(norm(w)));
        if (found >= 0) break;
      }
    }
    if (found >= 0) { columnMap[field] = found; taken.add(found); }
  }

  if (wideFormat) {
    // The label is whichever early column carries text rather than figures.
    const labelCol = headers.findIndex((h, i) =>
      !entityColumns[i] && !/^total$/i.test(h.trim()));
    columnMap.label = labelCol >= 0 ? labelCol : 0;
    delete columnMap.entity;   // entity comes from the column header, not a cell
    delete columnMap.amount;   // one amount per entity column
    issues.push(`This looks like a report with one column per business (${Object.values(entityColumns).join(", ")}). Each column will be imported as its own business.`);
  }

  // An amount column is essential; if the hints missed it, take the most numeric column.
  const needsAmount = ["PNL", "CASH", "BALANCE"].includes(bestType) && !wideFormat;
  if (needsAmount && columnMap.amount === undefined) {
    let bestCol = -1, bestCount = 0;
    for (let c = 0; c < headers.length; c++) {
      if (taken.has(c)) continue;
      const count = rows.slice(headerRow + 1, headerRow + 40)
        .filter((r) => parseAmount(r[c] ?? "") !== null).length;
      if (count > bestCount) { bestCount = count; bestCol = c; }
    }
    if (bestCol >= 0) {
      columnMap.amount = bestCol;
      issues.push(`Amount column guessed as "${headers[bestCol] || `column ${bestCol + 1}`}" — please confirm.`);
    }
  }

  // Body rows, with structural rows flagged rather than dropped silently.
  const skipped: Detection["skipped"] = [];
  const sampleRows: Record<string, any>[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const reason = skipReason(rows[i]);
    if (reason) {
      skipped.push({ row: i, reason, preview: rows[i].slice(0, 3).join(" · ").slice(0, 80) });
      continue;
    }
    if (sampleRows.length < 8) {
      if (wideFormat) {
        // One sample row per business, so the reader sees the unpivot immediately.
        for (const [colStr, name] of Object.entries(entityColumns)) {
          const col = Number(colStr);
          const amt = parseAmount(rows[i][col] ?? "");
          if (amt === null) continue;
          sampleRows.push({ entity: name, label: rows[i][columnMap.label ?? 0] ?? "", amount: amt });
          if (sampleRows.length >= 8) break;
        }
      } else {
        const obj: Record<string, any> = {};
        for (const [field, col] of Object.entries(columnMap)) obj[field] = rows[i][col] ?? "";
        sampleRows.push(obj);
      }
    }
  }

  const dataRows = rows.length - headerRow - 1 - skipped.length;
  if (dataRows <= 0) issues.push("No data rows found beneath the header.");
  if (bestType === "UNKNOWN") issues.push("Could not tell what kind of document this is — choose the type below.");
  if (!wideFormat && Object.keys(columnMap).length < 2) {
    issues.push("Only one column was recognised; the mapping needs checking.");
  }

  // Confidence is deliberately conservative — over-confident intake is how wrong numbers
  // reach a client.
  const expected = Object.keys(hints).length || 1;
  const coverage = Object.keys(columnMap).length / expected;
  const confidence = Math.min(1, Math.max(0,
    (Math.min(bestScore, 10) / 10) * 0.5 + coverage * 0.4 + (dataRows > 0 ? 0.1 : 0)));

  return {
    docType: bestType, wideFormat, entityColumns,
    confidence: Math.round(confidence * 100) / 100,
    sourceLabel: bestLabel, headerRow, headers, columnMap, skipped, issues, sampleRows,
  };
}

/* ------------------------------------------------------------------ */
/* Remembering                                                         */
/* ------------------------------------------------------------------ */

export function saveMapping(clientId: string, docType: DocType, d: {
  sourceLabel: string; headerRow: number; columnMap: Record<string, number>;
  entityMap?: Record<string, string>; categoryMap?: Record<string, string>;
}) {
  db().prepare(`INSERT INTO import_mappings
    (id,client_id,doc_type,source_label,column_map,header_row,entity_map,category_map,times_used,last_used)
    VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))
    ON CONFLICT(client_id,doc_type) DO UPDATE SET
      source_label=excluded.source_label, column_map=excluded.column_map,
      header_row=excluded.header_row, entity_map=excluded.entity_map,
      category_map=excluded.category_map,
      times_used=import_mappings.times_used+1, last_used=datetime('now')`)
    .run(uid(), clientId, docType, d.sourceLabel, JSON.stringify(d.columnMap), d.headerRow,
      JSON.stringify(d.entityMap ?? {}), JSON.stringify(d.categoryMap ?? {}));
}

export function savedMapping(clientId: string, docType: DocType) {
  const r: any = db().prepare("SELECT * FROM import_mappings WHERE client_id=? AND doc_type=?")
    .get(clientId, docType);
  if (!r) return null;
  return {
    sourceLabel: r.source_label, headerRow: r.header_row,
    columnMap: JSON.parse(r.column_map || "{}") as Record<string, number>,
    entityMap: JSON.parse(r.entity_map || "{}") as Record<string, string>,
    categoryMap: JSON.parse(r.category_map || "{}") as Record<string, string>,
    timesUsed: r.times_used, lastUsed: r.last_used,
  };
}

export function clientMappings(clientId: string) {
  return db().prepare(
    "SELECT doc_type, source_label, times_used, last_used FROM import_mappings WHERE client_id=? ORDER BY doc_type",
  ).all(clientId) as any[];
}

/**
 * Applies a remembered mapping. This is the second month: no questions asked.
 *
 * Returns rows plus anything that could not be read, because a row silently dropped is a
 * figure silently wrong.
 */
export function applyMapping(text: string, mapping: {
  headerRow: number; columnMap: Record<string, number>;
  wideFormat?: boolean; entityColumns?: Record<number, string>;
}, numericFields: string[]) {
  const rows = parseRows(text);
  const out: Record<string, any>[] = [];
  const rejected: { row: number; reason: string; preview: string }[] = [];

  for (let i = mapping.headerRow + 1; i < rows.length; i++) {
    const cells = rows[i];
    const reason = skipReason(cells);
    if (reason) { rejected.push({ row: i, reason, preview: cells.slice(0, 3).join(" · ") }); continue; }

    // Unpivot: one output row per business column.
    if (mapping.wideFormat && mapping.entityColumns) {
      const label = cells[mapping.columnMap.label ?? 0] ?? "";
      for (const [colStr, name] of Object.entries(mapping.entityColumns)) {
        const amt = parseAmount(cells[Number(colStr)] ?? "");
        if (amt === null || amt === 0) continue;
        out.push({ entity: name, label, amount: amt });
      }
      continue;
    }

    const obj: Record<string, any> = {};
    let bad: string | null = null;
    for (const [field, col] of Object.entries(mapping.columnMap)) {
      const raw = cells[col] ?? "";
      if (numericFields.includes(field)) {
        const n = parseAmount(raw);
        if (n === null && raw.trim()) bad = `"${raw}" in ${field} is not a number`;
        obj[field] = n ?? 0;
      } else obj[field] = raw;
    }
    if (bad) { rejected.push({ row: i, reason: bad, preview: cells.slice(0, 3).join(" · ") }); continue; }
    out.push(obj);
  }
  return { rows: out, rejected };
}

/** Numeric fields per document type, so parsing knows what to coerce. */
export const NUMERIC_FIELDS: Record<DocType, string[]> = {
  PNL: ["amount"],
  PAYROLL: ["wages", "otPremium", "taxes", "workersComp", "processing", "hoursPaid"],
  AR: ["b0_30", "b31_60", "b61_90", "b90p"],
  CASH: ["amount"],
  BALANCE: ["amount"],
  VOLUME: ["unitsSold", "unitsAvailable"],
  UNKNOWN: [],
};
