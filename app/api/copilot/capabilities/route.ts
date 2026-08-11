import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { buildCopilotContext } from "@/lib/ai/copilot/context";
import { capabilityHealth, listToolCatalog } from "@/lib/ai/copilot/tools";
import { toolsForAudience } from "@/lib/ai/copilot/permissions";
import { COPILOT_PRODUCT_NAME } from "@/lib/ai/copilot/types";

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
    if (!s.firmId) throw new AuthError(403, "An active firm context is required.");
    const url = new URL(req.url);
    const ctx = buildCopilotContext(s, {
      question: "",
      clientId: url.searchParams.get("clientId") || (s.role === "CLIENT" ? s.clientId : null),
    });
    return NextResponse.json({
      ok: true,
      product: COPILOT_PRODUCT_NAME,
      audience: ctx.audience,
      tools: listToolCatalog(ctx),
      allowedToolNames: toolsForAudience(ctx.audience),
      health: capabilityHealth(),
      readOnly: true,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}
