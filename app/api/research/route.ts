import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  accountingGuidanceEnabled, createIssue, ensurePilotCorpus, listIssues, listSources,
} from "@/lib/research/model";
import { ragflowStatus } from "@/lib/research/ragflow";
import { RESEARCH_CATEGORIES } from "@/lib/research/types";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "ADVISOR");
    await ensurePilotCorpus();
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId") || undefined;
    if (clientId) await requireClientAccess(clientId);
    return NextResponse.json({
      ok: true,
      enabled: accountingGuidanceEnabled(),
      // Without a client, return firm-library sources only — never another firm's issues.
      issues: clientId ? listIssues(clientId) : [],
      sources: listSources({ clientId: clientId || null }),
      categories: RESEARCH_CATEGORIES,
      ragflow: ragflowStatus(),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    if (!accountingGuidanceEnabled()) {
      return NextResponse.json({ ok: false, error: "Accounting Guidance is disabled." }, { status: 503 });
    }
    rateLimit({ action: "researchIssue", subject: s.userId, ...LIMITS.researchIssue });
    await ensurePilotCorpus();
    const body = await jsonObject(req);
    const title = String(body.title || "").trim();
    if (!title) throw new ValidationError("title is required.");
    const clientId = body.clientId ? String(body.clientId) : null;
    if (clientId) await requireClientAccess(clientId);
    const issue = createIssue({
      clientId,
      title,
      description: String(body.description || ""),
      category: (String(body.category || "LEASES") as any),
      reportingPeriod: body.reportingPeriod ? String(body.reportingPeriod) : null,
      entityContext: (String(body.entityContext || "PRIVATE_COMPANY") as any),
      createdBy: s.userId,
    });
    audit(s.userId, "ACCOUNTING_RESEARCH_CREATED", `${issue.id} ${issue.category}`);
    return NextResponse.json({ ok: true, issue });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
