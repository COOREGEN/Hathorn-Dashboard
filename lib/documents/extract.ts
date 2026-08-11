/**
 * Document-specific structured drafts from ParsedDocument tables.
 * Deterministic only — no LLM inventing totals.
 */

import type {
  ConfidenceLabel, DocumentType, ParsedDocument, ParsedTable, StructuredDraft, StructuredField,
} from "./types";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findCol(headers: string[], aliases: string[]): number {
  const h = headers.map(norm);
  for (const a of aliases) {
    const i = h.findIndex((x) => x === a || x.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

function parseMoney(raw: string): number | null {
  if (raw == null || raw === "") return null;
  const cleaned = String(raw).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function sumCol(table: ParsedTable, idx: number): number | null {
  if (idx < 0) return null;
  let s = 0;
  let any = false;
  for (const row of table.rows) {
    const v = parseMoney(row[idx] ?? "");
    if (v != null) { s += v; any = true; }
  }
  return any ? Math.round(s * 100) / 100 : null;
}

function confidenceFrom(
  requiredFound: number,
  requiredTotal: number,
  numericOk: boolean,
  rules: string[],
): ConfidenceLabel {
  if (requiredFound >= requiredTotal && numericOk) {
    rules.push("Required columns identified and numeric cells parse.");
    return "HIGH_CONFIDENCE";
  }
  if (requiredFound === 0) {
    rules.push("Missing required headings.");
    return "UNRESOLVED";
  }
  rules.push("Some required headings missing or numbers incomplete.");
  return "NEEDS_REVIEW";
}

function emptyDraft(type: DocumentType, warnings: string[]): StructuredDraft {
  return {
    documentType: type,
    confidence: "UNRESOLVED",
    fields: [],
    lineItems: [],
    totals: {},
    warnings,
    confidenceRules: ["No usable table found."],
  };
}

export function extractPayroll(parsed: ParsedDocument): StructuredDraft {
  const table = parsed.tables[0];
  if (!table) return emptyDraft("PAYROLL_REGISTER", parsed.warnings);
  const rules: string[] = [];
  const emp = findCol(table.headers, ["employee", "name", "worker"]);
  const gross = findCol(table.headers, ["gross pay", "gross", "gross wages", "wages"]);
  const taxes = findCol(table.headers, ["employer taxes", "employer tax", "taxes", "er tax"]);
  const benefits = findCol(table.headers, ["benefits"]);
  const ded = findCol(table.headers, ["deductions", "deduction"]);
  const net = findCol(table.headers, ["net pay", "net"]);
  const dept = findCol(table.headers, ["department", "dept", "cost center"]);
  const period = findCol(table.headers, ["period", "pay period", "pay date"]);

  const required = [
    ["employee", emp],
    ["gross", gross],
  ] as const;
  const found = required.filter(([, i]) => i >= 0).length;

  const lineItems = table.rows.map((row, ri) => {
    const item: Record<string, string | number | null> = {
      employee: emp >= 0 ? row[emp] ?? null : null,
      grossPay: gross >= 0 ? parseMoney(row[gross] ?? "") : null,
      employerTaxes: taxes >= 0 ? parseMoney(row[taxes] ?? "") : null,
      benefits: benefits >= 0 ? parseMoney(row[benefits] ?? "") : null,
      deductions: ded >= 0 ? parseMoney(row[ded] ?? "") : null,
      netPay: net >= 0 ? parseMoney(row[net] ?? "") : null,
      department: dept >= 0 ? row[dept] ?? null : null,
      period: period >= 0 ? row[period] ?? null : null,
      _row: ri,
    };
    return item;
  });

  const totals = {
    grossPay: sumCol(table, gross),
    employerTaxes: sumCol(table, taxes),
    benefits: sumCol(table, benefits),
    deductions: sumCol(table, ded),
    netPay: sumCol(table, net),
  };
  const numericOk = totals.grossPay != null;
  const confidence = confidenceFrom(found, required.length, numericOk, rules);

  const fields: StructuredField[] = [
    { key: "grossPay", label: "Gross payroll", value: totals.grossPay, source: { tableIndex: 0, column: gross } },
    { key: "employerTaxes", label: "Employer payroll taxes", value: totals.employerTaxes, source: { tableIndex: 0, column: taxes } },
    { key: "netPay", label: "Net pay", value: totals.netPay, source: { tableIndex: 0, column: net } },
  ];

  return {
    documentType: "PAYROLL_REGISTER",
    confidence,
    fields,
    lineItems,
    totals,
    warnings: [...parsed.warnings],
    confidenceRules: rules,
  };
}

export function extractDebt(parsed: ParsedDocument): StructuredDraft {
  const table = parsed.tables[0];
  if (!table) return emptyDraft("DEBT_SCHEDULE", parsed.warnings);
  const rules: string[] = [];
  const lender = findCol(table.headers, ["lender", "bank", "creditor"]);
  const orig = findCol(table.headers, ["original balance", "original", "principal original"]);
  const bal = findCol(table.headers, ["current balance", "balance", "outstanding"]);
  const rate = findCol(table.headers, ["interest rate", "rate"]);
  const payment = findCol(table.headers, ["payment", "monthly payment"]);
  const maturity = findCol(table.headers, ["maturity", "maturity date"]);
  const principal = findCol(table.headers, ["principal"]);
  const interest = findCol(table.headers, ["interest"]);

  const found = [lender, bal].filter((i) => i >= 0).length;
  const lineItems = table.rows.map((row, ri) => ({
    lender: lender >= 0 ? row[lender] ?? null : null,
    originalBalance: orig >= 0 ? parseMoney(row[orig] ?? "") : null,
    currentBalance: bal >= 0 ? parseMoney(row[bal] ?? "") : null,
    interestRate: rate >= 0 ? row[rate] ?? null : null,
    payment: payment >= 0 ? parseMoney(row[payment] ?? "") : null,
    maturity: maturity >= 0 ? row[maturity] ?? null : null,
    principal: principal >= 0 ? parseMoney(row[principal] ?? "") : null,
    interest: interest >= 0 ? parseMoney(row[interest] ?? "") : null,
    _row: ri,
  }));
  const totals = { currentBalance: sumCol(table, bal), originalBalance: sumCol(table, orig) };
  const confidence = confidenceFrom(found, 2, totals.currentBalance != null, rules);
  return {
    documentType: "DEBT_SCHEDULE",
    confidence,
    fields: [
      { key: "currentBalance", label: "Outstanding debt", value: totals.currentBalance, source: { tableIndex: 0, column: bal } },
    ],
    lineItems,
    totals,
    warnings: [...parsed.warnings],
    confidenceRules: rules,
  };
}

export function extractAr(parsed: ParsedDocument): StructuredDraft {
  return extractAging(parsed, "AR_SCHEDULE", ["customer", "client", "payer"], "customer");
}

export function extractAp(parsed: ParsedDocument): StructuredDraft {
  return extractAging(parsed, "AP_SCHEDULE", ["vendor", "supplier", "payee"], "vendor");
}

function extractAging(
  parsed: ParsedDocument,
  type: "AR_SCHEDULE" | "AP_SCHEDULE",
  partyAliases: string[],
  partyKey: string,
): StructuredDraft {
  const table = parsed.tables[0];
  if (!table) return emptyDraft(type, parsed.warnings);
  const rules: string[] = [];
  const party = findCol(table.headers, partyAliases);
  const invoice = findCol(table.headers, ["invoice", "invoice number", "inv"]);
  const invDate = findCol(table.headers, ["invoice date", "date"]);
  const due = findCol(table.headers, ["due date", "due"]);
  const balance = findCol(table.headers, ["balance", "amount", "outstanding"]);
  const aging = findCol(table.headers, ["aging", "aging bucket", "bucket", "days"]);

  const found = [party, balance].filter((i) => i >= 0).length;
  const lineItems = table.rows.map((row, ri) => ({
    [partyKey]: party >= 0 ? row[party] ?? null : null,
    invoice: invoice >= 0 ? row[invoice] ?? null : null,
    invoiceDate: invDate >= 0 ? row[invDate] ?? null : null,
    dueDate: due >= 0 ? row[due] ?? null : null,
    balance: balance >= 0 ? parseMoney(row[balance] ?? "") : null,
    agingBucket: aging >= 0 ? row[aging] ?? null : null,
    _row: ri,
  }));
  const totals = { balance: sumCol(table, balance) };
  const confidence = confidenceFrom(found, 2, totals.balance != null, rules);
  return {
    documentType: type,
    confidence,
    fields: [
      { key: "balance", label: type === "AR_SCHEDULE" ? "AR total" : "AP total", value: totals.balance, source: { tableIndex: 0, column: balance } },
    ],
    lineItems,
    totals,
    warnings: [...parsed.warnings],
    confidenceRules: rules,
  };
}

export function extractFinancial(parsed: ParsedDocument): StructuredDraft {
  const table = parsed.tables[0];
  if (!table) return emptyDraft("FINANCIAL_STATEMENT", parsed.warnings);
  const rules: string[] = ["Financial statement tables extracted for review only — not trusted actuals."];
  const label = findCol(table.headers, ["account", "line", "description", "item"]);
  const amount = findCol(table.headers, ["amount", "balance", "total"]);
  const lineItems = table.rows.map((row, ri) => ({
    label: label >= 0 ? row[label] ?? null : row[0] ?? null,
    amount: amount >= 0 ? parseMoney(row[amount] ?? "") : parseMoney(row[row.length - 1] ?? ""),
    _row: ri,
  }));
  return {
    documentType: "FINANCIAL_STATEMENT",
    confidence: "NEEDS_REVIEW",
    fields: [],
    lineItems,
    totals: {},
    warnings: [...parsed.warnings, "Extracted statement is a draft. It does not update the general ledger."],
    confidenceRules: rules,
  };
}

export function extractStructured(type: DocumentType, parsed: ParsedDocument): StructuredDraft {
  switch (type) {
    case "PAYROLL_REGISTER": return extractPayroll(parsed);
    case "DEBT_SCHEDULE": return extractDebt(parsed);
    case "AR_SCHEDULE": return extractAr(parsed);
    case "AP_SCHEDULE": return extractAp(parsed);
    case "FINANCIAL_STATEMENT": return extractFinancial(parsed);
    default: {
      const table = parsed.tables[0];
      if (!table) return emptyDraft(type, parsed.warnings);
      return {
        documentType: type,
        confidence: "NEEDS_REVIEW",
        fields: [],
        lineItems: table.rows.map((row, ri) => {
          const o: Record<string, string | number | null> = { _row: ri };
          table.headers.forEach((h, i) => { o[h || `col_${i}`] = row[i] ?? null; });
          return o;
        }),
        totals: {},
        warnings: [...parsed.warnings, "Generic table capture — no specialized extractor for this type."],
        confidenceRules: ["Stored as generic table for later research."],
      };
    }
  }
}
