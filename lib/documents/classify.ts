import type { DocumentType, ParsedDocument } from "./types";

function headerBlob(parsed: ParsedDocument): string {
  const fromTables = parsed.tables.flatMap((t) => t.headers).join(" ");
  const fromText = parsed.textBlocks.slice(0, 8).map((b) => b.text).join(" ");
  return `${fromTables} ${fromText}`.toLowerCase();
}

/** Deterministic classification from filename + table headers + headings. */
export function classifyDocument(
  filename: string,
  parsed: ParsedDocument | null,
  hint?: DocumentType | null,
): DocumentType {
  if (hint && hint !== "OTHER") return hint;

  const name = (filename || "").toLowerCase();
  const blob = parsed ? headerBlob(parsed) : "";
  const hay = `${name} ${blob}`;

  const rules: [RegExp, DocumentType][] = [
    [/payroll|gross\s*pay|net\s*pay|employer\s*tax|wages/, "PAYROLL_REGISTER"],
    [/debt\s*sched|loan\s*sched|lender|maturity|principal|interest\s*rate/, "DEBT_SCHEDULE"],
    [/accounts?\s*receiv|\bar\b|aging|invoice\s*date|customer/, "AR_SCHEDULE"],
    [/accounts?\s*payab|\bap\b|vendor|payable/, "AP_SCHEDULE"],
    [/income\s*statement|balance\s*sheet|cash\s*flow|trial\s*balance|p\s*&\s*l|profit\s*and\s*loss/, "FINANCIAL_STATEMENT"],
    [/bank\s*statement|ending\s*balance|deposits/, "BANK_STATEMENT"],
    [/fixed\s*asset|depreciation|capex/, "FIXED_ASSET_SCHEDULE"],
    [/lease|rent\s*roll/, "LEASE"],
    [/invoice/, "INVOICE"],
  ];

  for (const [re, type] of rules) {
    if (re.test(hay)) return type;
  }

  if (/\.xlsx?$/i.test(filename)) return "EXCEL_SUPPORTING";
  return "OTHER";
}
