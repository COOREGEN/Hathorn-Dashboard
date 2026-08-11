import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, AuthError, audit } from "@/lib/auth";
import { assertClientCanAccessDocument } from "@/lib/client-portal";
import { getDocument, getDocumentFileBytes } from "@/lib/documents/model";
import { firmIdForClient } from "@/lib/tenancy";
import { recordPortalEvent } from "@/lib/client-portal/events";

/** Authenticated client (or staff) download of CLIENT_VISIBLE documents only. */
export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "CLIENT");
    const url = new URL(req.url);
    const documentId = url.searchParams.get("id") || "";
    if (!documentId) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }
    const doc = getDocument(documentId);
    if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    await requireClientAccess(doc.clientId);

    if (s.role === "CLIENT") {
      if (!s.clientId || s.clientId !== doc.clientId) {
        return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      }
      if (!assertClientCanAccessDocument(documentId, s.clientId)) {
        return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      }
    }

    const file = getDocumentFileBytes(documentId);
    const firmId = firmIdForClient(doc.clientId);
    if (s.role === "CLIENT" && firmId) {
      recordPortalEvent({
        firmId, clientId: doc.clientId, userId: s.userId,
        eventType: "CLIENT_DOCUMENT_DOWNLOADED",
        resourceType: "source_document", resourceId: documentId,
      });
    }
    audit(s.userId, "CLIENT_DOCUMENT_DOWNLOADED", documentId);
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}
