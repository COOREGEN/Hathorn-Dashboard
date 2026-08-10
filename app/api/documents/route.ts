import { NextResponse } from "next/server";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { listDocuments, uploadDocument } from "@/lib/documents/model";
import { documentIntelligenceStatus } from "@/lib/documents/engine";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/documents/types";
import { db } from "@/lib/db";

const TYPE_SET = new Set(DOCUMENT_TYPES.map((t) => t.value));

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId") || "";
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required." }, { status: 400 });
    const client = db().prepare("SELECT id FROM clients WHERE id=?").get(clientId);
    if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      documents: listDocuments(clientId),
      types: DOCUMENT_TYPES,
      intelligence: documentIntelligenceStatus(),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    rateLimit({ action: "documentUpload", subject: s.userId, ...LIMITS.documentUpload });

    const fd = await req.formData();
    const clientId = String(fd.get("clientId") || "");
    const periodId = fd.get("periodId") ? String(fd.get("periodId")) : null;
    const documentTypeRaw = String(fd.get("documentType") || "OTHER").toUpperCase() as DocumentType;
    const file = fd.get("file");

    if (!clientId) throw new ValidationError("clientId is required.");
    if (!(file instanceof File)) throw new ValidationError("file is required.");
    if (!TYPE_SET.has(documentTypeRaw)) throw new ValidationError("Invalid document type.");

    const result = await uploadDocument({
      clientId,
      periodId,
      documentType: documentTypeRaw,
      file,
      uploadedBy: s.userId,
    });

    audit(s.userId, "DOCUMENT_UPLOADED", `${clientId} ${result.document.id} ${documentTypeRaw}`);
    if (result.extraction) {
      audit(
        s.userId,
        result.extraction.status === "OK" ? "DOCUMENT_PARSED" : "DOCUMENT_PARSE_FAILED",
        result.document.id,
      );
    }

    return NextResponse.json({
      ok: true,
      document: result.document,
      extraction: result.extraction || null,
      duplicates: result.duplicates.map((d) => ({ id: d.id, filename: d.originalFilename, uploadedAt: d.uploadedAt })),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message || "Upload failed." }, { status: 400 });
  }
}
