/**
 * Firm default close policy with optional client overrides.
 */

import { db, uid } from "../db";
import { FIRM_DEFAULT_CHECK_KEYS } from "./registry";
import type { CheckKey, ClosePolicy, VarianceRule } from "./types";

const FIRM_VARIANCE: VarianceRule[] = [
  { metric: "revenue", pctThreshold: 15, absThresholdK: 10, provenance: "FIRM_DEFAULT" },
  { metric: "payroll", pctThreshold: 10, absThresholdK: 5, provenance: "FIRM_DEFAULT" },
  { metric: "opex", pctThreshold: 20, absThresholdK: 5, provenance: "FIRM_DEFAULT" },
];

function parsePolicy(r: any): ClosePolicy {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    requiredDocuments: JSON.parse(r.required_documents_json || "[]"),
    requiredReconciliations: JSON.parse(r.required_reconciliations_json || "[]"),
    checkKeys: JSON.parse(r.check_keys_json || "[]") as CheckKey[],
    varianceRules: JSON.parse(r.variance_rules_json || "[]") as VarianceRule[],
    blockingRules: JSON.parse(r.blocking_rules_json || "{}"),
    reviewRequirements: JSON.parse(r.review_requirements_json || "{}"),
  };
}

export function ensureFirmDefaultPolicy(): ClosePolicy {
  let row: any = db().prepare(`SELECT * FROM close_policies WHERE client_id IS NULL`).get();
  if (!row) {
    const id = uid();
    db().prepare(`
      INSERT INTO close_policies
        (id, client_id, name, required_documents_json, required_reconciliations_json,
         check_keys_json, variance_rules_json, blocking_rules_json, review_requirements_json)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      id, null, "Firm default",
      JSON.stringify(["PAYROLL_REGISTER", "AR_SCHEDULE", "DEBT_SCHEDULE"]),
      JSON.stringify(["PAYROLL", "ACCOUNTS_RECEIVABLE", "DEBT"]),
      JSON.stringify(FIRM_DEFAULT_CHECK_KEYS),
      JSON.stringify(FIRM_VARIANCE),
      JSON.stringify({}),
      JSON.stringify({ advisorCommentary: true, cpaReviewer: false }),
    );
    row = db().prepare(`SELECT * FROM close_policies WHERE id=?`).get(id);
  }
  return parsePolicy(row);
}

/** Resolve effective policy: firm default merged with client overrides when present. */
export function resolvePolicy(clientId: string): ClosePolicy {
  const firm = ensureFirmDefaultPolicy();
  const clientRow: any = db().prepare(
    `SELECT * FROM close_policies WHERE client_id=?`,
  ).get(clientId);
  if (!clientRow) return { ...firm, clientId };

  const override = parsePolicy(clientRow);
  return {
    id: override.id,
    clientId,
    name: override.name || firm.name,
    requiredDocuments: override.requiredDocuments.length ? override.requiredDocuments : firm.requiredDocuments,
    requiredReconciliations: override.requiredReconciliations.length
      ? override.requiredReconciliations : firm.requiredReconciliations,
    checkKeys: override.checkKeys.length ? override.checkKeys : firm.checkKeys,
    varianceRules: override.varianceRules.length ? override.varianceRules : firm.varianceRules,
    blockingRules: { ...firm.blockingRules, ...override.blockingRules },
    reviewRequirements: { ...firm.reviewRequirements, ...override.reviewRequirements },
  };
}

export function varianceRuleFor(
  policy: ClosePolicy,
  metric: VarianceRule["metric"],
): VarianceRule | null {
  return policy.varianceRules.find((r) => r.metric === metric) || null;
}

export function isCheckBlocking(policy: ClosePolicy, key: CheckKey, defaultBlocking: boolean): boolean {
  if (key in policy.blockingRules) return Boolean(policy.blockingRules[key]);
  return defaultBlocking;
}
