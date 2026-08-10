import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { askCopilot, listConversations, listMessages, getConversation } from "@/lib/ai/copilot";
import { suggestedQuestions, buildCopilotContext } from "@/lib/ai/copilot/context";

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
    if (!s.firmId) throw new AuthError(403, "An active firm context is required.");
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversationId");
    if (conversationId) {
      const conv = getConversation(conversationId, s.userId, s.firmId);
      if (!conv) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({
        ok: true,
        conversation: conv,
        messages: listMessages(conversationId),
      });
    }
    const clientId = url.searchParams.get("clientId");
    const ctx = buildCopilotContext(s, {
      question: "",
      clientId: clientId || (s.role === "CLIENT" ? s.clientId : null),
    });
    return NextResponse.json({
      ok: true,
      conversations: listConversations(s.userId, s.firmId),
      suggestions: suggestedQuestions(ctx),
      audience: ctx.audience,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
    rateLimit({ action: "copilot", subject: s.userId, ...LIMITS.copilot });
    const body = await jsonObject(req);
    const question = String(body.question || "").trim();
    if (!question) throw new ValidationError("question is required.");

    const result = await askCopilot(s, {
      question,
      conversationId: body.conversationId ? String(body.conversationId) : null,
      clientId: body.clientId ? String(body.clientId) : null,
      periodId: body.periodId ? String(body.periodId) : null,
      year: body.year != null ? Number(body.year) : null,
      month: body.month != null ? Number(body.month) : null,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}
