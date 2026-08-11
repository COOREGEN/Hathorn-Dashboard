import { NextResponse } from "next/server";
import { requireRole, AuthError, audit } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { getMessage } from "@/lib/ai/copilot/store";
import { getConversation } from "@/lib/ai/copilot/store";

/** Lightweight helpful / not-helpful signal — no RLHF pipeline. */
export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
    if (!s.firmId) throw new AuthError(403, "An active firm context is required.");
    const body = await jsonObject(req);
    const messageId = String(body.messageId || "");
    const helpful = body.helpful === true ? "HELPFUL" : body.helpful === false ? "NOT_HELPFUL" : "";
    const reason = String(body.reason || "").slice(0, 80); // incorrect_number | wrong_source | missing_context | unclear
    if (!messageId || !helpful) throw new ValidationError("messageId and helpful are required.");
    const msg = getMessage(messageId);
    if (!msg) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    const conv = getConversation(msg.conversationId, s.userId, s.firmId);
    if (!conv) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    audit(s.userId, "COPILOT_FEEDBACK", `${messageId}:${helpful}:${reason}`, {
      firmId: s.firmId, clientId: conv.clientId,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}
