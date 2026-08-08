import { NextResponse } from "next/server";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { draftStory } from "@/lib/story-agent";
import { db, uid } from "@/lib/db";

/**
 * Drafts commentary for a period. Replaces existing notes only when the advisor
 * asks for it — the agent never silently overwrites approved language.
 */
export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    // The agent calls a metered API on an authenticated route; a stuck retry loop
    // must not be able to bill the firm indefinitely.
    rateLimit({ action: "storyDraft", subject: s.userId, ...LIMITS.storyDraft });
    const { periodId, replace } = await jsonObject(req);

    const period: any = db().prepare("SELECT * FROM periods WHERE id=?").get(periodId);
    if (!period) return NextResponse.json({ ok: false, error: "Period not found" }, { status: 404 });
    if (period.status === "PUBLISHED") {
      return NextResponse.json(
        { ok: false, error: "This period is published. Unpublish it before redrafting." }, { status: 400 });
    }

    const { notes, source, warning } = await draftStory(periodId);

    const write = db().transaction(() => {
      if (replace) db().prepare("DELETE FROM story_notes WHERE period_id=?").run(periodId);
      notes.forEach((n, i) => {
        db().prepare(
          "INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort) VALUES (?,?,?,?,?,?,?)",
        ).run(uid(), periodId, n.slot, n.tone, n.heading, n.body, i);
      });
    });
    write();

    audit(s.userId, "STORY_DRAFT", `${periodId} source=${source} notes=${notes.length}`);
    return NextResponse.json({ ok: true, count: notes.length, source, warning });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
