/**
 * Document Intelligence types — supporting evidence, never trusted accounting.
 *
 * Extraction creates draft data. Approval does not write GL / releases / QBO.
 */

export type DocumentType =
  | "PAYROLL_REGISTER"
  | "DEBT_SCHEDULE"
  | "AR_SCHEDULE"
  | "AP_SCHEDULE"
  | "FINANCIAL_STATEMENT"
  | "BANK_STATEMENT"
  | "INVOICE"
  | "FIXED_ASSET_SCHEDULE"
  | "LEASE"
  | "EXCEL_SUPPORTING"
  | "OTHER";

export type DocumentStatus =
  | "UPLOADED"
  | "QUARANTINED"
  | "PROCESSING"
  | "PARSED"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "FAILED";

export type ExtractionStatus = "PENDING" | "OK" | "FAILED";

export type ConfidenceLabel = "HIGH_CONFIDENCE" | "NEEDS_REVIEW" | "UNRESOLVED";

export type ParsedTextBlock = {
  text: string;
  page?: number;
};

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  source?: { page?: number; tableIndex?: number };
};

/** Hathorn-owned parse shape — never leak Docling types into app code. */
export type ParsedDocument = {
  engine: string;
  engineVersion: string;
  pageCount: number | null;
  textBlocks: ParsedTextBlock[];
  tables: ParsedTable[];
  metadata: Record<string, unknown>;
  warnings: string[];
};

export type StructuredField = {
  key: string;
  label: string;
  value: string | number | null;
  source?: { tableIndex?: number; row?: number; column?: number; page?: number };
};

export type StructuredDraft = {
  documentType: DocumentType;
  confidence: ConfidenceLabel;
  fields: StructuredField[];
  lineItems: Record<string, string | number | null>[];
  totals: Record<string, number | null>;
  warnings: string[];
  /** Human-readable rules that drove the confidence label. */
  confidenceRules: string[];
};

export type SourceDocument = {
  id: string;
  clientId: string;
  periodId: string | null;
  documentType: DocumentType;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  status: DocumentStatus;
  uploadedBy: string;
  uploadedAt: string;
  /** Staff-edited draft after review — never mutates raw extraction. */
  reviewedJson: StructuredDraft | null;
  notes: string | null;
};

export type ExtractionRun = {
  id: string;
  documentId: string;
  engine: string;
  engineVersion: string;
  status: ExtractionStatus;
  rawResult: ParsedDocument | null;
  structuredResult: StructuredDraft | null;
  confidenceSummary: ConfidenceLabel | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "PAYROLL_REGISTER", label: "Payroll Register" },
  { value: "DEBT_SCHEDULE", label: "Debt Schedule" },
  { value: "AR_SCHEDULE", label: "AR Schedule" },
  { value: "AP_SCHEDULE", label: "AP Schedule" },
  { value: "FINANCIAL_STATEMENT", label: "Financial Statement" },
  { value: "BANK_STATEMENT", label: "Bank Statement" },
  { value: "INVOICE", label: "Invoice" },
  { value: "FIXED_ASSET_SCHEDULE", label: "Fixed Asset Schedule" },
  { value: "LEASE", label: "Lease Document" },
  { value: "EXCEL_SUPPORTING", label: "Excel Supporting Schedule" },
  { value: "OTHER", label: "Other Supporting Document" },
];

export const NATIVE_DOC_ENGINE_VERSION = "hathorn-native-docs-1.0.0";
export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024; // 12 MB

export const ALLOWED_MIME: Record<string, string[]> = {
  "text/csv": [".csv"],
  "text/plain": [".txt", ".tsv", ".csv"],
  "text/tab-separated-values": [".tsv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};
