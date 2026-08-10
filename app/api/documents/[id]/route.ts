import { NextResponse } from "next/server";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  getDocument, listExtractions, latestExtraction, processDocument,
  updateDocumentType, saveReviewedDraft, approveDocument, rejectDocument,
  getDocumentFileBytes,
} from "@/lib/documents/model";
import { reconcilePayrollRegister } from "@/lib/documents/reconcile-payroll";
import { draftDocumentSummary } from "@/lib/documents/summary";
import { DOCUMENT_TYPES, type DocumentType, type StructuredDraft } from "@/lib/documents/types";

const TYPE_SET = new Set(DOCUMENT_TYPES.map((t) => t.value));

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const url = new URL(req.url);
    const download = url.searchParams.get("download") === "1";

    const doc = getDocument(params.id);
    if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    if (download) {
      const file = getDocumentFileBytes(doc.id);
      audit(s.userId, "DOCUMENT_DOWNLOADED", doc.id);
      return new NextResponse(new Uint8Array(file.bytes), {
        status: 200,
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    const extractions = listExtractions(doc.id);
    const latest = latestExtraction(doc.id);
    const reconciliation = doc.documentType === "PAYROLL_REGISTER"
      ? reconcilePayrollRegister(doc.id)
      : null;
    const summary = draftDocumentSummary(doc, latest);

    return NextResponse.json({
      ok: true,
      document: doc,
      extractions,
      latest,
      reconciliation,
      summary,
      // Never include storage paths
    });
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
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const doc = getDocument(params.id);
    if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    const body = await jsonObject(req);
    const action = String(body.action || "").toLowerCase();

    if (action === "parse" || action === "reprocess") {
      rateLimit({ action: "documentParse", subject: s.userId, ...LIMITS.documentParse });
      const typeHint = body.documentType && TYPE_SET.has(String(body.documentType).toUpperCase())
        ? String(body.documentType).toUpperCase() as DocumentType
        : null;
      if (typeHint) updateDocumentType(doc.id, typeHint);
      const extraction = await processDocument(doc.id, typeHint);
      audit(
        s.userId,
        action === "reprocess" ? "DOCUMENT_REPROCESSED" : (
          extraction.status === "OK" ? "DOCUMENT_PARSED" : "DOCUMENT_PARSE_FAILED"
        ),
        doc.id,
      );
      return NextResponse.json({
        ok: true,
        document: getDocument(doc.id),
        extraction,
        extractions: listExtractions(doc.id),
      });
    }

    if (action === "approve") {
      approveDocument(doc.id);
      audit(s.userId, "DOCUMENT_APPROVED", doc.id);
      return NextResponse.json({ ok: true, document: getDocument(doc.id) });
    }

    if (action === "reject") {
      rejectDocument(doc.id, body.reason ? String(body.reason) : undefined);
      audit(s.userId, "DOCUMENT_REJECTED", doc.id);
      return NextResponse.json({ ok: true, document: getDocument(doc.id) });
    }

    if (action === "correct") {
      if (!body.draft || typeof body.draft !== "object") {
        throw new ValidationError("draft is required.");
      }
      saveReviewedDraft(doc.id, body.draft as StructuredDraft, body.notes ? String(body.notes) : undefined);
      audit(s.userId, "DOCUMENT_CORRECTED", doc.id);
      return NextResponse.json({ ok: true, document: getDocument(doc.id) });
    }

    if (action === "set_type") {
      const t = String(body.documentType || "").toUpperCase() as DocumentType;
      if (!TYPE_SET.has(t)) throw new ValidationError("Invalid document type.");
      updateDocumentType(doc.id, t);
      audit(s.userId, "DOCUMENT_CORRECTED", `${doc.id} type=${t}`);
      return NextResponse.json({ ok: true, document: getDocument(doc.id) });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message || "Request failed." }, { status: 400 });
  }
}
