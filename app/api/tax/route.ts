import { NextResponse } from "next/server";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  createIssue, listIssues, listAuthorities, taxIntelligenceEnabled, ensureSeedAuthorities,
} from "@/lib/tax/model";
import { factGraphStatus } from "@/lib/tax/fact-graph";
import { TAX_RULES } from "@/lib/tax/rules";
import { db } from "@/lib/db";
import { ENTITY_TYPES } from "@/lib/tax/types";

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "ADVISOR");
    ensureSeedAuthorities();
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId") || undefined;
    if (clientId) {
      const c = db().prepare("SELECT id FROM clients WHERE id=?").get(clientId);
      if (!c) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      enabled: taxIntelligenceEnabled(),
      issues: listIssues(clientId),
      authorities: listAuthorities(),
      rules: TAX_RULES,
      entityTypes: ENTITY_TYPES,
      factGraph: factGraphStatus(),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    if (!taxIntelligenceEnabled()) {
      return NextResponse.json({ ok: false, error: "Tax Intelligence is disabled." }, { status: 503 });
    }
    rateLimit({ action: "taxIssue", subject: s.userId, ...LIMITS.taxIssue });
    const body = await jsonObject(req);
    const clientId = String(body.clientId || "");
    const title = String(body.title || "").trim();
    const taxYear = Number(body.taxYear);
    if (!clientId) throw new ValidationError("clientId is required.");
    if (!title) throw new ValidationError("title is required.");
    if (!Number.isInteger(taxYear)) throw new ValidationError("taxYear is required.");

    const issue = createIssue({
      clientId,
      title,
      description: String(body.description || ""),
      taxYear,
      entityType: String(body.entityType || "OTHER"),
      createdBy: s.userId,
    });
    audit(s.userId, "TAX_ISSUE_CREATED", `${issue.id} ${clientId} TY${taxYear}`);
    return NextResponse.json({ ok: true, issue });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
