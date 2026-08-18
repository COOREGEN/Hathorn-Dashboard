/**
 * Deterministic close check evaluators.
 * Consume gate, documents, recon pack, integrations, comparison — never invent numbers.
 */

import { db } from "../db";
import { runGate } from "../gate";
import { computePeriod, clientHistory } from "../metrics";
import { evaluate as evaluateRelease } from "../release";
import { capabilityReadiness } from "../integrations/model";
import { listReconciliations, listExceptions, packSummary } from "../reconciliation/model";
import { buildComparison } from "../comparison";
import { combineDeps, dependencyFingerprints, hashPayload } from "./fingerprint";
import { getCheckDef } from "./registry";
import { isCheckBlocking, resolvePolicy, varianceRuleFor } from "./policy";
import type { CheckEvalResult, CheckKey, ClosePolicy } from "./types";

function approvedDoc(clientId: string, periodId: string, type: string) {
  return db().prepare(`
    SELECT id, original_filename, sha256 FROM source_documents
    WHERE client_id=? AND period_id=? AND document_type=? AND status='APPROVED'
    ORDER BY uploaded_at DESC LIMIT 1
  `).get(clientId, periodId, type) as any;
}

function reconOk(status: string | undefined) {
  return status != null && ["MATCHED", "WITHIN_TOLERANCE", "RESOLVED"].includes(status);
}

function varianceEval(
  clientId: string,
  periodId: string,
  metric: "revenue" | "payroll" | "opex",
  policy: ClosePolicy,
  fps: Record<string, string>,
  key: CheckKey,
): CheckEvalResult {
  const def = getCheckDef(key);
  const rule = varianceRuleFor(policy, metric === "payroll" ? "payroll" : metric);
  const hash = combineDeps(fps, def.dependencyTags);
  const blocking = isCheckBlocking(policy, key, def.blockingDefault);

  const history = clientHistory(clientId, false);
  const cur = history.find((p) => p.periodId === periodId);
  if (!cur) {
    return { status: "FAIL", blocking, evidence: { reason: "period_not_found" }, inputHash: hash,
      exception: { type: "DATA_QUALITY", severity: "CRITICAL", title: "Period missing", description: "Close period has no computed metrics." } };
  }

  const cmp = buildComparison(cur, history, "PRIOR_MONTH");
  if (!cmp.available) {
    return {
      status: "NOT_APPLICABLE", blocking: false,
      evidence: { reason: cmp.unavailableReason || "no_prior_month" },
      inputHash: hash, detail: cmp.unavailableReason || "No prior month to compare.",
    };
  }

  const labelMap: Record<string, string> = {
    revenue: "Revenue",
    payroll: "Total payroll",
    opex: "Operating expenses",
  };
  // comparison lines use language labels — match by common names
  const line = cmp.lines.find((l) => {
    const lab = l.label.toLowerCase();
    if (metric === "revenue") return /revenue|billings|income/.test(lab) && !/net|gross/.test(lab);
    if (metric === "payroll") return /payroll|labor cost|wages/.test(lab);
    return /opex|operating expense|overhead/.test(lab);
  }) || cmp.lines.find((l) => l.label === labelMap[metric]);

  const current = metric === "revenue" ? cur.revenue
    : metric === "payroll" ? cur.totalPayroll
      : cur.opex;
  const idx = history.findIndex((p) => p.periodId === periodId);
  const prev = idx > 0 ? history[idx - 1] : null;
  const basis = prev
    ? (metric === "revenue" ? prev.revenue : metric === "payroll" ? prev.totalPayroll : prev.opex)
    : 0;
  const delta = current - basis;
  const deltaPct = basis !== 0 ? (delta / Math.abs(basis)) * 100 : null;
  const thr = rule || { pctThreshold: 15, absThresholdK: 10, provenance: "FIRM_DEFAULT" as const, metric };
  const exceedsPct = deltaPct != null && Math.abs(deltaPct) >= thr.pctThreshold;
  const exceedsAbs = Math.abs(delta) >= thr.absThresholdK;
  const exceeds = exceedsPct || exceedsAbs;

  const evidence = {
    metric, current, basis, delta, deltaPct, thresholdPct: thr.pctThreshold,
    thresholdAbsK: thr.absThresholdK, provenance: thr.provenance,
    comparisonLabel: cmp.basisLabel, lineLabel: line?.label || metric,
  };

  if (!exceeds) {
    return { status: "PASS", blocking: false, evidence, inputHash: hash,
      detail: `${metric} move within threshold (${deltaPct?.toFixed(1) ?? "n/a"}%).` };
  }

  return {
    status: "NEEDS_REVIEW",
    blocking,
    evidence,
    inputHash: hash,
    detail: `${metric} ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}K (${deltaPct?.toFixed(1)}%) exceeds ${thr.pctThreshold}% / $${thr.absThresholdK}K.`,
    exception: {
      type: "VARIANCE_REVIEW",
      severity: "WARNING",
      title: `${metric} variance needs review`,
      description: `MoM change ${deltaPct?.toFixed(1)}% ($${delta.toFixed(1)}K) exceeds policy threshold ${thr.pctThreshold}% / $${thr.absThresholdK}K.`,
    },
  };
}

export function evaluateCloseCheck(
  key: CheckKey,
  clientId: string,
  periodId: string,
  policy?: ClosePolicy,
): CheckEvalResult {
  const pol = policy || resolvePolicy(clientId);
  const def = getCheckDef(key);
  const fps = dependencyFingerprints(clientId, periodId);
  const hash = combineDeps(fps, def.dependencyTags.length ? def.dependencyTags : [key]);
  const blocking = isCheckBlocking(pol, key, def.blockingDefault);

  // Skip document/recon checks not in required lists → NOT_APPLICABLE
  if (key === "doc_payroll_approved" && !pol.requiredDocuments.includes("PAYROLL_REGISTER")) {
    return { status: "NOT_APPLICABLE", blocking: false, evidence: {}, inputHash: hash };
  }
  if (key === "doc_ar_approved" && !pol.requiredDocuments.includes("AR_SCHEDULE")) {
    return { status: "NOT_APPLICABLE", blocking: false, evidence: {}, inputHash: hash };
  }
  if (key === "doc_debt_approved" && !pol.requiredDocuments.includes("DEBT_SCHEDULE")) {
    return { status: "NOT_APPLICABLE", blocking: false, evidence: {}, inputHash: hash };
  }
  if (key === "recon_payroll" && !pol.requiredReconciliations.includes("PAYROLL")) {
    return { status: "NOT_APPLICABLE", blocking: false, evidence: {}, inputHash: hash };
  }
  if (key === "recon_ar" && !pol.requiredReconciliations.includes("ACCOUNTS_RECEIVABLE")) {
    return { status: "NOT_APPLICABLE", blocking: false, evidence: {}, inputHash: hash };
  }
  if (key === "recon_debt" && !pol.requiredReconciliations.includes("DEBT")) {
    return { status: "NOT_APPLICABLE", blocking: false, evidence: {}, inputHash: hash };
  }

  switch (key) {
    case "integration_sources_current": {
      const ready = capabilityReadiness(clientId);
      const pnl = ready.PROFIT_AND_LOSS || "NOT_AVAILABLE";
      const ar = ready.ACCOUNTS_RECEIVABLE || "NOT_AVAILABLE";
      const ok = (pnl === "CURRENT" || pnl === "NOT_AVAILABLE") && (ar === "CURRENT" || ar === "NOT_AVAILABLE");
      // If QBO not configured, NOT_AVAILABLE is fine; STALE/ERROR fails
      const stale = pnl === "STALE" || ar === "STALE" || pnl === "ERROR" || ar === "ERROR";
      if (stale) {
        return {
          status: "FAIL", blocking, inputHash: hash,
          evidence: { readiness: ready },
          detail: "Integration source data is stale or in error.",
          exception: {
            type: "STALE_SOURCE", severity: "CRITICAL",
            title: "Integration sources not current",
            description: `P&L readiness ${pnl}; AR readiness ${ar}.`,
          },
        };
      }
      return { status: "PASS", blocking: false, evidence: { readiness: ready }, inputHash: hash };
    }
    case "figures_present": {
      const m = computePeriod(periodId);
      const ok = (m.revenue || 0) > 0 || (m.totalPayroll || 0) > 0;
      return ok
        ? { status: "PASS", blocking: false, evidence: { revenue: m.revenue, payroll: m.totalPayroll }, inputHash: hash }
        : {
          status: "FAIL", blocking, inputHash: hash,
          evidence: { revenue: m.revenue, payroll: m.totalPayroll },
          detail: "No revenue or payroll figures on the working period.",
          exception: {
            type: "DATA_QUALITY", severity: "CRITICAL",
            title: "Period figures missing",
            description: "Working period has no revenue or payroll to close.",
          },
        };
    }
    case "gate_pass": {
      const gate = runGate(periodId);
      return gate.pass
        ? { status: "PASS", blocking: false, evidence: { checks: gate.checks }, inputHash: hash }
        : {
          status: "FAIL", blocking, inputHash: hash,
          evidence: { checks: gate.checks },
          detail: gate.checks.filter((c) => !c.pass).map((c) => c.name).join("; "),
          exception: {
            type: "DATA_QUALITY", severity: "CRITICAL",
            title: "Gate failing",
            description: gate.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join(" | "),
          },
        };
    }
    case "doc_payroll_approved":
    case "doc_ar_approved":
    case "doc_debt_approved": {
      const type = key === "doc_payroll_approved" ? "PAYROLL_REGISTER"
        : key === "doc_ar_approved" ? "AR_SCHEDULE" : "DEBT_SCHEDULE";
      const doc = approvedDoc(clientId, periodId, type);
      if (doc) {
        return { status: "PASS", blocking: false, evidence: { documentId: doc.id, filename: doc.original_filename }, inputHash: hash };
      }
      return {
        status: "FAIL", blocking, inputHash: hash, evidence: { documentType: type },
        detail: `${type} not approved for this period.`,
        exception: {
          type: "MISSING_SUPPORTING_SCHEDULE", severity: "CRITICAL",
          title: `${type} missing`,
          description: `Required ${type} is not approved for this period.`,
        },
      };
    }
    case "recon_payroll":
    case "recon_ar":
    case "recon_debt": {
      const type = key === "recon_payroll" ? "PAYROLL"
        : key === "recon_ar" ? "ACCOUNTS_RECEIVABLE" : "DEBT";
      const rows = listReconciliations(clientId, periodId);
      const row = rows.find((r) => r.type === type);
      if (!row) {
        return {
          status: "FAIL", blocking, inputHash: hash, evidence: { type, present: false },
          detail: `${type} reconciliation has not been run.`,
          exception: {
            type: "MISSING_SUPPORTING_SCHEDULE", severity: "CRITICAL",
            title: `${type} reconciliation missing`,
            description: "Run the reconciliation pack before close can proceed.",
          },
        };
      }
      if (reconOk(row.status)) {
        return {
          status: "PASS", blocking: false, inputHash: hash,
          evidence: { type, status: row.status, differenceCents: row.differenceCents },
        };
      }
      return {
        status: "FAIL", blocking, inputHash: hash,
        evidence: { type, status: row.status, differenceCents: row.differenceCents, issues: row.issues },
        detail: `${type} status ${row.status}`,
        exception: {
          type: "RECONCILIATION_DIFFERENCE", severity: "CRITICAL",
          title: `${type} reconciliation not complete`,
          description: `Status ${row.status}; difference ${row.differenceCents ?? "n/a"} cents.`,
        },
      };
    }
    case "recon_no_critical_open": {
      const pack = packSummary(clientId, periodId);
      const open = listExceptions({ clientId, periodId })
        .filter((e) => ["OPEN", "ASSIGNED", "UNDER_REVIEW"].includes(e.status) && e.severity === "CRITICAL");
      if (!open.length && !pack.criticalExceptions) {
        return { status: "PASS", blocking: false, evidence: { openCritical: 0 }, inputHash: hash };
      }
      return {
        status: "FAIL", blocking, inputHash: hash,
        evidence: { openCritical: open.length, titles: open.map((e) => e.title) },
        detail: `${open.length} open critical exception(s).`,
        exception: {
          type: "RECONCILIATION_DIFFERENCE", severity: "CRITICAL",
          title: "Open critical reconciliation exceptions",
          description: open.map((e) => e.title).join("; ") || "Critical exceptions remain open.",
        },
      };
    }
    case "balance_sheet_balances": {
      const lines: any[] = db().prepare(
        `SELECT section, amount FROM balance_lines WHERE period_id=?`,
      ).all(periodId);
      if (!lines.length) {
        return {
          status: "NOT_APPLICABLE", blocking: false, inputHash: hash,
          evidence: { reason: "no_balance_sheet" },
          detail: "No balance sheet lines for this period.",
        };
      }
      const sum = (sec: string) => lines.filter((l) => l.section === sec)
        .reduce((a, l) => a + Number(l.amount || 0), 0);
      // sections may be ASSET/LIABILITY/EQUITY or similar
      const assets = lines.filter((l) => /asset/i.test(l.section)).reduce((a, l) => a + Number(l.amount), 0);
      const liab = lines.filter((l) => /liab/i.test(l.section)).reduce((a, l) => a + Number(l.amount), 0);
      const equity = lines.filter((l) => /equity|capital/i.test(l.section)).reduce((a, l) => a + Number(l.amount), 0);
      const gap = Math.round((assets - liab - equity) * 1000) / 1000;
      const tol = 0.5; // $0.5K
      const ok = Math.abs(gap) <= tol;
      const sections = Array.from(new Set(lines.map((l) => String(l.section))));
      const evidence = { assets, liabilities: liab, equity, gap, toleranceK: tol, sections };
      void sum;
      if (ok) return { status: "PASS", blocking: false, evidence, inputHash: hash };
      return {
        status: "FAIL", blocking, evidence, inputHash: hash,
        detail: `Balance sheet gap ${gap}K exceeds ${tol}K.`,
        exception: {
          type: "DATA_QUALITY", severity: "CRITICAL",
          title: "Balance sheet does not balance",
          description: `Assets ${assets} − Liabilities ${liab} − Equity ${equity} = ${gap}K.`,
        },
      };
    }
    case "cash_present": {
      const row: any = db().prepare(`SELECT operating, reserve FROM cash_balances WHERE period_id=?`).get(periodId);
      if (row && (Number(row.operating) || Number(row.reserve) || Number(row.operating) === 0)) {
        return { status: "PASS", blocking: false, evidence: row, inputHash: hash };
      }
      return {
        status: "FAIL", blocking, inputHash: hash, evidence: {},
        detail: "No cash balances on period.",
        exception: {
          type: "DATA_QUALITY", severity: "WARNING",
          title: "Cash balances missing",
          description: "Upload cash balances before close.",
        },
      };
    }
    case "variance_revenue_mom":
      return varianceEval(clientId, periodId, "revenue", pol, fps, key);
    case "variance_payroll_mom":
      return varianceEval(clientId, periodId, "payroll", pol, fps, key);
    case "variance_opex_mom":
      return varianceEval(clientId, periodId, "opex", pol, fps, key);
    case "manual_unusual_entries":
    case "manual_related_party":
      return {
        status: "PENDING", blocking: false, inputHash: hashPayload({ key, manual: true }),
        evidence: { kind: "MANUAL" },
        detail: "Manual attestation required.",
      };
    case "commentary_present": {
      const notes: any[] = db().prepare(
        `SELECT heading, body FROM story_notes WHERE period_id=? AND slot='WHAT_CHANGED'`,
      ).all(periodId);
      const real = notes.filter((n) => {
        const body = String(n.body || "").trim();
        const heading = String(n.heading || "").trim();
        if (body.length < 40) return false;
        if (/^draft\b/i.test(heading)) return false;
        if (/advisor to complete/i.test(`${heading} ${body}`)) return false;
        return true;
      });
      return real.length
        ? { status: "PASS", blocking: false, evidence: { count: real.length }, inputHash: hash }
        : {
          status: "FAIL", blocking, inputHash: hash, evidence: { count: 0 },
          detail: "Advisor commentary incomplete.",
          exception: {
            type: "DATA_QUALITY", severity: "WARNING",
            title: "Commentary incomplete",
            description: "WHAT_CHANGED notes do not meet the release commentary bar.",
          },
        };
    }
    case "publish_evaluate_clear": {
      const ev = evaluateRelease(periodId);
      return ev.canPublish
        ? { status: "PASS", blocking: false, evidence: { warnings: ev.warnings.length }, inputHash: hash }
        : {
          status: "FAIL", blocking, inputHash: hash,
          evidence: { blockers: ev.blockers },
          detail: ev.blockers.map((b) => b.message).join("; "),
        };
    }
    default:
      return { status: "PENDING", blocking: false, evidence: {}, inputHash: hash };
  }
}
