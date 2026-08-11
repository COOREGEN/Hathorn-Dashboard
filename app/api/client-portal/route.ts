import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, AuthError, audit, getSession } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { firmIdForClient } from "@/lib/tenancy";
import {
  buildClientOverview,
  getPortalConfig,
  upsertPortalConfig,
  listInsights,
  createInsight,
  setInsightStatus,
  listQuestions,
  createQuestion,
  publishQuestion,
  answerQuestion,
  listReports,
  createMonthlyReport,
  publishReport,
  retractReport,
  getPublishedReport,
  markReportViewed,
  listSharedScenarios,
  shareScenario,
  unshareScenario,
  listDocumentRequests,
  createDocumentRequest,
  fulfillDocumentRequest,
  markRequestNotApplicable,
  listClientVisibleDocuments,
  setDocumentVisibility,
  staffEngagementSummary,
  draftInsightsFromRelease,
} from "@/lib/client-portal";
import { lockedStatements } from "@/lib/statement";
import { storeDocumentFile, newDocumentId, sha256Buffer } from "@/lib/documents/storage";
import { validateUpload } from "@/lib/documents/validate";
import { db } from "@/lib/db";

function resolveClientId(sessionClientId: string | null, requested: string | null, role: string) {
  if (role === "CLIENT") {
    if (!sessionClientId) throw new AuthError(403, "No client context.");
    return sessionClientId;
  }
  if (!requested) throw new ValidationError("clientId is required.");
  return requested;
}

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "CLIENT");
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "overview";
    const clientId = resolveClientId(s.clientId, url.searchParams.get("clientId"), s.role);
    await requireClientAccess(clientId);
    const forClient = s.role === "CLIENT" || url.searchParams.get("preview") === "1";

    if (view === "overview") {
      return NextResponse.json({ ok: true, overview: buildClientOverview(clientId) });
    }
    if (view === "config") {
      if (s.role === "CLIENT") throw new AuthError(403, "Not permitted.");
      return NextResponse.json({ ok: true, config: getPortalConfig(clientId) });
    }
    if (view === "insights") {
      return NextResponse.json({
        ok: true,
        insights: listInsights({ clientId, forClient }),
        questions: listQuestions({ clientId, forClient }),
      });
    }
    if (view === "reports") {
      return NextResponse.json({ ok: true, reports: listReports({ clientId, forClient }) });
    }
    if (view === "report") {
      const id = url.searchParams.get("id") || "";
      const report = forClient
        ? getPublishedReport(id, clientId)
        : listReports({ clientId }).find((r) => r.id === id) || null;
      if (!report) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      if (s.role === "CLIENT") {
        const firmId = firmIdForClient(clientId)!;
        markReportViewed({ reportId: id, clientId, userId: s.userId, firmId });
      }
      return NextResponse.json({ ok: true, report });
    }
    if (view === "planning") {
      const config = getPortalConfig(clientId);
      if (forClient && !config.showPlanning) {
        return NextResponse.json({ ok: true, scenarios: [], disabled: true });
      }
      return NextResponse.json({ ok: true, scenarios: listSharedScenarios(clientId) });
    }
    if (view === "documents") {
      const config = getPortalConfig(clientId);
      if (forClient && !config.showDocuments) {
        return NextResponse.json({ ok: true, documents: [], requests: [], disabled: true });
      }
      return NextResponse.json({
        ok: true,
        documents: listClientVisibleDocuments(clientId),
        requests: listDocumentRequests({ clientId, openOnly: forClient }),
      });
    }
    if (view === "engagement") {
      if (s.role === "CLIENT") throw new AuthError(403, "Not permitted.");
      return NextResponse.json({ ok: true, summary: staffEngagementSummary(clientId) });
    }
    if (view === "periods") {
      return NextResponse.json({
        ok: true,
        periods: lockedStatements(clientId).map((p) => ({
          periodId: p.periodId, label: p.label, year: p.year, month: p.month,
        })),
      });
    }

    throw new ValidationError("Unknown view.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return await handleUpload(req);
    }

    const s = await getSession();
    if (!s) throw new AuthError(401, "Not signed in");
    rateLimit({ action: "client_portal", subject: s.userId, ...LIMITS.clientPortal });
    const body = await jsonObject(req);
    const action = String(body.action || "");

    // —— Client actions ——
    if (action === "answerQuestion") {
      const session = await requireRole("CLIENT");
      if (!session.clientId) throw new AuthError(403, "No client context.");
      const q = answerQuestion({
        questionId: String(body.questionId || ""),
        clientId: session.clientId,
        userId: session.userId,
        body: String(body.body || ""),
      });
      if (!q) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, question: q });
    }

    if (action === "markRequestNA") {
      const session = await requireRole("CLIENT");
      if (!session.clientId) throw new AuthError(403, "No client context.");
      const r = markRequestNotApplicable({
        requestId: String(body.requestId || ""),
        clientId: session.clientId,
        userId: session.userId,
        note: body.note ? String(body.note) : undefined,
      });
      if (!r) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, request: r });
    }

    // —— Staff actions ——
    const staff = await requireRole("ADMIN", "ADVISOR");
    if (!staff.firmId) throw new AuthError(403, "An active firm context is required.");
    const clientId = String(body.clientId || "");
    if (!clientId) throw new ValidationError("clientId is required.");
    await requireClientAccess(clientId);

    if (action === "updateConfig") {
      const config = upsertPortalConfig(clientId, body.config || {}, staff.userId);
      return NextResponse.json({ ok: true, config });
    }
    if (action === "createInsight") {
      const insight = createInsight({
        clientId,
        periodId: body.periodId ? String(body.periodId) : null,
        title: String(body.title || ""),
        section: body.section ? String(body.section) : "PERFORMANCE",
        body: String(body.body || ""),
        actorId: staff.userId,
      });
      return NextResponse.json({ ok: true, insight });
    }
    if (action === "setInsightStatus") {
      const insight = setInsightStatus({
        insightId: String(body.insightId || ""),
        firmId: staff.firmId,
        status: String(body.status || "") as any,
        actorId: staff.userId,
      });
      if (!insight) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, insight });
    }
    if (action === "draftInsights") {
      const insights = draftInsightsFromRelease(
        clientId, String(body.periodId || ""), staff.userId,
      );
      return NextResponse.json({ ok: true, insights });
    }
    if (action === "createQuestion") {
      const question = createQuestion({
        clientId,
        periodId: body.periodId ? String(body.periodId) : null,
        question: String(body.question || ""),
        actorId: staff.userId,
        publish: !!body.publish,
      });
      return NextResponse.json({ ok: true, question });
    }
    if (action === "publishQuestion") {
      const question = publishQuestion({
        questionId: String(body.questionId || ""),
        firmId: staff.firmId,
        actorId: staff.userId,
      });
      if (!question) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, question });
    }
    if (action === "createReport") {
      const report = createMonthlyReport({
        clientId,
        periodId: String(body.periodId || ""),
        actorId: staff.userId,
        publish: !!body.publish,
      });
      return NextResponse.json({ ok: true, report });
    }
    if (action === "publishReport") {
      const report = publishReport({
        reportId: String(body.reportId || ""),
        firmId: staff.firmId,
        actorId: staff.userId,
      });
      if (!report) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, report });
    }
    if (action === "retractReport") {
      const report = retractReport({
        reportId: String(body.reportId || ""),
        firmId: staff.firmId,
        actorId: staff.userId,
      });
      if (!report) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, report });
    }
    if (action === "shareScenario") {
      const scenario = shareScenario({
        runId: String(body.runId || ""),
        firmId: staff.firmId,
        actorId: staff.userId,
      });
      return NextResponse.json({ ok: true, scenario });
    }
    if (action === "unshareScenario") {
      const ok = unshareScenario({
        runId: String(body.runId || ""),
        firmId: staff.firmId,
        actorId: staff.userId,
      });
      return NextResponse.json({ ok, error: ok ? undefined : "Not found." });
    }
    if (action === "createDocumentRequest") {
      const request = createDocumentRequest({
        clientId,
        title: String(body.title || ""),
        description: body.description ? String(body.description) : "",
        dueDate: body.dueDate ? String(body.dueDate) : null,
        actorId: staff.userId,
      });
      return NextResponse.json({ ok: true, request });
    }
    if (action === "setDocumentVisibility") {
      const ok = setDocumentVisibility({
        documentId: String(body.documentId || ""),
        firmId: staff.firmId,
        visibility: String(body.visibility || "") as any,
        actorId: staff.userId,
      });
      if (!ok) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}

async function handleUpload(req: Request) {
  try {
    const s = await requireRole("CLIENT");
    if (!s.clientId) throw new AuthError(403, "No client context.");
    rateLimit({ action: "documentUpload", subject: s.userId, ...LIMITS.documentUpload });
    const form = await req.formData();
    const requestId = String(form.get("requestId") || "");
    const file = form.get("file");
    if (!requestId || !(file instanceof File)) {
      throw new ValidationError("requestId and file are required.");
    }
    const validated = await validateUpload(file);
    const id = newDocumentId();
    const { storageReference } = storeDocumentFile({
      clientId: s.clientId,
      documentId: id,
      ext: validated.ext,
      bytes: validated.bytes,
    });
    const sha256 = sha256Buffer(validated.bytes);

    db().prepare(`
      INSERT INTO source_documents
        (id, client_id, period_id, document_type, original_filename, mime_type,
         file_size, storage_reference, sha256, status, uploaded_by, visibility)
      VALUES (?,?,NULL,'OTHER',?,?,?,?,?,'UPLOADED',?,'CLIENT_VISIBLE')
    `).run(
      id, s.clientId, validated.filename, validated.mimeType,
      validated.bytes.length, storageReference, sha256, s.userId,
    );

    const request = fulfillDocumentRequest({
      requestId, clientId: s.clientId, documentId: id, userId: s.userId,
    });
    if (!request) {
      return NextResponse.json({ ok: false, error: "Request not found or closed." }, { status: 404 });
    }
    audit(s.userId, "CLIENT_DOCUMENT_UPLOADED", requestId, {
      firmId: request.firmId, clientId: s.clientId,
    });
    return NextResponse.json({ ok: true, request, documentId: id });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message || "Upload failed" }, { status: 400 });
  }
}
