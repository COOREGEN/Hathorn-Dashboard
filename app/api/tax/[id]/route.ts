import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  getIssue, issueBundle, upsertFact, attachAuthorityToIssue, runIssueRule,
  createScenario, runScenario, listScenarios, analyzeIssue, reviewIssue, closeIssue,
  createAuthorityManual, ingestAuthorityUrl, taxIntelligenceEnabled,
} from "@/lib/tax/model";
import type { AuthoritySourceType, FactProvenance, FactType } from "@/lib/tax/types";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireRole("ADMIN", "ADVISOR");
    const bundle = issueBundle(params.id);
    if (!bundle) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    await requireClientAccess(bundle.issue.clientId);
    return NextResponse.json({ ok: true, ...bundle });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    if (!taxIntelligenceEnabled()) {
      return NextResponse.json({ ok: false, error: "Tax Intelligence is disabled." }, { status: 503 });
    }
    const issue = getIssue(params.id);
    if (!issue) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    await requireClientAccess(issue.clientId);

    const body = await jsonObject(req);
    const action = String(body.action || "").toLowerCase();

    if (action === "add_fact") {
      const fact = upsertFact({
        taxIssueId: issue.id,
        factKey: String(body.factKey || ""),
        factValue: String(body.factValue ?? ""),
        factType: (String(body.factType || "string") as FactType),
        provenance: (String(body.provenance || "USER_ENTERED") as FactProvenance),
        sourceDocumentId: body.sourceDocumentId ? String(body.sourceDocumentId) : null,
        verified: Boolean(body.verified),
        createdBy: s.userId,
      });
      audit(s.userId, "TAX_FACT_ADDED", `${issue.id} ${fact.factKey}`);
      return NextResponse.json({ ok: true, fact, bundle: issueBundle(issue.id) });
    }

    if (action === "attach_authority") {
      attachAuthorityToIssue(issue.id, String(body.authorityId || ""));
      audit(s.userId, "TAX_SOURCE_ATTACHED", `${issue.id} ${body.authorityId}`);
      return NextResponse.json({ ok: true, bundle: issueBundle(issue.id) });
    }

    if (action === "add_authority_manual") {
      const auth = createAuthorityManual({
        sourceType: String(body.sourceType || "OTHER") as AuthoritySourceType,
        title: String(body.title || ""),
        citation: String(body.citation || ""),
        url: body.url ? String(body.url) : null,
        taxYear: body.taxYear != null ? Number(body.taxYear) : null,
        excerpt: body.excerpt ? String(body.excerpt) : undefined,
      });
      attachAuthorityToIssue(issue.id, auth.id);
      audit(s.userId, "TAX_SOURCE_ATTACHED", `${issue.id} ${auth.id}`);
      return NextResponse.json({ ok: true, authority: auth, bundle: issueBundle(issue.id) });
    }

    if (action === "fetch_authority") {
      rateLimit({ action: "taxFetch", subject: s.userId, ...LIMITS.taxFetch });
      const auth = await ingestAuthorityUrl(String(body.url || ""), {
        sourceType: body.sourceType as AuthoritySourceType | undefined,
        title: body.title ? String(body.title) : undefined,
        citation: body.citation ? String(body.citation) : undefined,
        taxYear: body.taxYear != null ? Number(body.taxYear) : null,
      });
      attachAuthorityToIssue(issue.id, auth.id);
      audit(s.userId, "TAX_SOURCE_ATTACHED", `${issue.id} fetch ${auth.id}`);
      return NextResponse.json({ ok: true, authority: auth, bundle: issueBundle(issue.id) });
    }

    if (action === "run_rule") {
      rateLimit({ action: "taxRule", subject: s.userId, ...LIMITS.taxRule });
      const { result, runId } = runIssueRule({
        issueId: issue.id,
        ruleKey: String(body.ruleKey || "sec179_expense_limit"),
        createdBy: s.userId,
      });
      audit(s.userId, "TAX_RULE_RUN", `${issue.id} ${result.ruleKey} ${result.status}`);
      return NextResponse.json({ ok: true, runId, result, bundle: issueBundle(issue.id) });
    }

    if (action === "create_scenario") {
      const scenario = createScenario({
        taxIssueId: issue.id,
        name: String(body.name || "Scenario"),
        facts: (body.facts && typeof body.facts === "object") ? body.facts as Record<string, string> : {},
        createdBy: s.userId,
      });
      audit(s.userId, "TAX_SCENARIO_CREATED", `${issue.id} ${scenario.id}`);
      return NextResponse.json({ ok: true, scenario, scenarios: listScenarios(issue.id) });
    }

    if (action === "run_scenario") {
      rateLimit({ action: "taxRule", subject: s.userId, ...LIMITS.taxRule });
      const out = runScenario({
        scenarioId: String(body.scenarioId || ""),
        ruleKey: String(body.ruleKey || "sec179_expense_limit"),
        createdBy: s.userId,
      });
      audit(s.userId, "TAX_SCENARIO_RUN", `${issue.id} ${body.scenarioId}`);
      return NextResponse.json({ ok: true, ...out, bundle: issueBundle(issue.id) });
    }

    if (action === "analyze") {
      rateLimit({ action: "taxAnalyze", subject: s.userId, ...LIMITS.taxAnalyze });
      const analysis = await analyzeIssue(issue.id, s.userId);
      audit(s.userId, "TAX_AI_ANALYSIS_GENERATED", `${issue.id} ${analysis.source}`);
      return NextResponse.json({ ok: true, analysis, bundle: issueBundle(issue.id) });
    }

    if (action === "review") {
      reviewIssue(issue.id, s.userId);
      audit(s.userId, "TAX_ANALYSIS_REVIEWED", issue.id);
      return NextResponse.json({ ok: true, bundle: issueBundle(issue.id) });
    }

    if (action === "close") {
      closeIssue(issue.id);
      audit(s.userId, "TAX_ISSUE_CLOSED", issue.id);
      return NextResponse.json({ ok: true, bundle: issueBundle(issue.id) });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message || "Request failed." }, { status: 400 });
  }
}
