import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  accountingGuidanceEnabled,
  addSource,
  attachSource,
  closeIssue,
  getIssue,
  issueBundle,
  reviewIssue,
  runResearch,
  upsertFact,
} from "@/lib/research/model";
import type { ContentRights, FactProvenance, FactType } from "@/lib/research/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireRole("ADMIN", "ADVISOR");
    const bundle = issueBundle(params.id);
    if (!bundle) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    if (bundle.issue.clientId) await requireClientAccess(bundle.issue.clientId);
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
    if (!accountingGuidanceEnabled()) {
      return NextResponse.json({ ok: false, error: "Accounting Guidance is disabled." }, { status: 503 });
    }
    const issue = getIssue(params.id);
    if (!issue) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    if (issue.clientId) await requireClientAccess(issue.clientId);

    const body = await jsonObject(req);
    const action = String(body.action || "").toLowerCase();

    if (action === "add_fact") {
      const facts = upsertFact({
        issueId: issue.id,
        factKey: String(body.factKey || body.fact_key || ""),
        factValue: String(body.factValue ?? body.fact_value ?? ""),
        factType: String(body.factType || body.fact_type || "string") as FactType,
        provenance: String(body.provenance || body.source || "USER_ENTERED") as FactProvenance,
        sourceDocumentId: body.sourceDocumentId
          ? String(body.sourceDocumentId)
          : body.source_document_id
            ? String(body.source_document_id)
            : null,
        verified: Boolean(body.verified),
        createdBy: s.userId,
      });
      audit(s.userId, "ACCOUNTING_FACT_ADDED", `${issue.id} ${body.factKey || body.fact_key}`);
      return NextResponse.json({ ok: true, facts, bundle: issueBundle(issue.id) });
    }

    if (action === "add_source") {
      const rights = String(body.contentRights || body.content_rights || "UNKNOWN") as ContentRights;
      const source = await addSource({
        sourceType: String(body.sourceType || body.source_type || "OTHER_INTERPRETIVE"),
        title: String(body.title || ""),
        citation: String(body.citation || ""),
        publisher: String(body.publisher || "Unknown"),
        contentRights: rights,
        scope: issue.clientId ? "CLIENT" : "FIRM",
        clientId: issue.clientId,
        bodyText: String(body.bodyText || body.body_text || ""),
        sourceUrl: body.sourceUrl || body.source_url ? String(body.sourceUrl || body.source_url) : null,
        documentId: body.documentId || body.document_id
          ? String(body.documentId || body.document_id)
          : null,
        effectiveDate: body.effectiveDate || body.effective_date
          ? String(body.effectiveDate || body.effective_date)
          : null,
      });
      attachSource(issue.id, source.id);
      audit(s.userId, "ACCOUNTING_SOURCE_ADDED", `${issue.id} ${source.id} ${rights}`);
      if (source.bodyText) {
        audit(s.userId, "ACCOUNTING_SOURCE_INDEXED", source.id);
      }
      return NextResponse.json({ ok: true, source, bundle: issueBundle(issue.id) });
    }

    if (action === "attach_source") {
      const sourceId = String(body.sourceId || body.source_id || "");
      attachSource(issue.id, sourceId);
      audit(s.userId, "ACCOUNTING_SOURCE_ADDED", `${issue.id} attach ${sourceId}`);
      return NextResponse.json({ ok: true, bundle: issueBundle(issue.id) });
    }

    if (action === "run_research") {
      rateLimit({ action: "researchAnalyze", subject: s.userId, ...LIMITS.researchAnalyze });
      const result = await runResearch(
        issue.id,
        s.userId,
        body.query ? String(body.query) : undefined,
      );
      audit(s.userId, "ACCOUNTING_RESEARCH_RUN", `${issue.id} v${result.version}`);
      audit(s.userId, "ACCOUNTING_AI_ANALYSIS_GENERATED", `${result.analysisId} ${result.analysis.model}`);
      return NextResponse.json({
        ok: true,
        analysis: result.analysis,
        version: result.version,
        analysisId: result.analysisId,
        hitCount: result.hitCount,
        bundle: issueBundle(issue.id),
      });
    }

    if (action === "review") {
      reviewIssue(issue.id, s.userId);
      audit(s.userId, "ACCOUNTING_ANALYSIS_REVIEWED", issue.id);
      audit(s.userId, "ACCOUNTING_MEMO_FINALIZED", issue.id);
      return NextResponse.json({ ok: true, bundle: issueBundle(issue.id) });
    }

    if (action === "close") {
      closeIssue(issue.id);
      return NextResponse.json({ ok: true, bundle: issueBundle(issue.id) });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
