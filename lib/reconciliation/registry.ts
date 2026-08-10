import type { ReconciliationType, SubledgerDefinition } from "./types";

export const SUBLEDGERS: Record<ReconciliationType, SubledgerDefinition> = {
  PAYROLL: {
    key: "PAYROLL",
    label: "Payroll",
    sourceType: "PAYROLL_REGISTER",
    controlDescription:
      "Ledger payroll_lines employer cost (wages + OT premium + taxes + workers’ comp + processing), converted from $K to dollars.",
    supportingDescription:
      "Approved payroll register employer cost (gross pay + employer taxes + benefits). Net pay is excluded.",
    includes: [
      "Gross wages / OT (register gross)",
      "Employer payroll taxes",
      "Employer benefits",
      "Ledger wages, OT, taxes, workers’ comp, processing",
    ],
    excludes: [
      "Net pay",
      "Employee deductions",
      "Contractor costs (unless present in register as gross)",
      "Payroll clearing account balance (stock)",
    ],
    defaultRequirement: "REQUIRED",
    defaultAbsoluteToleranceCents: 100_00,
  },
  ACCOUNTS_RECEIVABLE: {
    key: "ACCOUNTS_RECEIVABLE",
    label: "Accounts receivable",
    sourceType: "AR_SCHEDULE",
    controlDescription:
      "Balance-sheet Accounts receivable (balance_lines CURRENT_ASSET matching “accounts receivable”), $K → dollars.",
    supportingDescription:
      "Period AR aging total from ar_buckets, or approved AR schedule total when linked to the same period.",
    includes: ["AR aging total (all buckets)", "BS Accounts receivable"],
    excludes: ["Revenue", "Allowance for doubtful accounts (unless labeled AR)"],
    defaultRequirement: "REQUIRED",
    defaultAbsoluteToleranceCents: 500_00,
  },
  DEBT: {
    key: "DEBT",
    label: "Debt",
    sourceType: "DEBT_SCHEDULE",
    controlDescription:
      "Sum of balance-sheet liability lines matching debt/loan/note labels (current + long-term principal).",
    supportingDescription:
      "Approved debt schedule outstanding principal (currentBalance). Future payment totals and interest are excluded.",
    includes: ["Principal ending / current balance"],
    excludes: ["Future total payments", "Interest expense", "Debt service capacity"],
    defaultRequirement: "REQUIRED",
    defaultAbsoluteToleranceCents: 100_00,
  },
};

export function subledger(type: ReconciliationType): SubledgerDefinition {
  return SUBLEDGERS[type];
}
