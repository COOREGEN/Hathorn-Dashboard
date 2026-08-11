import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject, text } from "@/lib/validate";
import { setStage, addFinding, addGoal, addPainPoint, draftAgenda, type Stage } from "@/lib/engagement";

function fail(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
}

/** Every engagement mutation in one guarded route, keyed by action. */
export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const b = await jsonObject(req);
    const clientId = text(b.clientId, "Client", 40);
    const action = String(b.action || "");

    switch (action) {
      case "setStage": {
        const STAGES = ["DISCOVERY", "CLEANUP", "ALIGNMENT", "ADVISORY", "PAUSED"];
        if (!STAGES.includes(String(b.stage))) throw new ValidationError("Unknown stage.");
        setStage(clientId, b.stage as Stage);
        audit(s.userId, "STAGE_CHANGE", `${clientId} -> ${b.stage}`);
        return NextResponse.json({ ok: true });
      }

      case "addFinding": {
        const KINDS = ["INEFFICIENCY", "GAP", "RISK", "OPPORTUNITY"];
        if (!KINDS.includes(String(b.kind))) throw new ValidationError("Unknown finding type.");
        const id = addFinding(clientId, {
          kind: String(b.kind), area: text(b.area, "Area", 60, false),
          title: text(b.title, "Title", 200), detail: text(b.detail, "Detail", 2000, false),
          severity: ["high", "medium", "low"].includes(String(b.severity)) ? String(b.severity) : "medium",
        });
        return NextResponse.json({ ok: true, id });
      }

      case "resolveFinding": {
        db().prepare("UPDATE discovery_findings SET status=?, resolved_at=datetime('now') WHERE id=? AND client_id=?")
          .run(String(b.status || "ADDRESSED"), String(b.id), clientId);
        return NextResponse.json({ ok: true });
      }

      case "addScope": {
        db().prepare(`INSERT INTO cleanup_scope (id,client_id,period_from,period_to,source_system,note)
          VALUES (?,?,?,?,?,?)`)
          .run(uid(), clientId, text(b.from, "From", 20), text(b.to, "To", 20),
            text(b.sourceSystem, "Source", 60, false), text(b.note, "Note", 500, false));
        return NextResponse.json({ ok: true });
      }

      case "setScopeStatus": {
        const done = String(b.status) === "COMPLETE";
        db().prepare(`UPDATE cleanup_scope SET status=?,
            started_at = COALESCE(started_at, CASE WHEN ?='IN_PROGRESS' THEN datetime('now') END),
            completed_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
          WHERE id=? AND client_id=?`)
          .run(String(b.status), String(b.status), done ? 1 : 0, String(b.id), clientId);
        return NextResponse.json({ ok: true });
      }

      case "addCleanupFinding": {
        const CATS = ["UNRECONCILED", "MISCLASSIFIED", "MISSING", "DUPLICATE", "UNSUPPORTED"];
        if (!CATS.includes(String(b.category))) throw new ValidationError("Unknown cleanup category.");
        db().prepare(`INSERT INTO cleanup_findings
          (id,client_id,scope_id,category,title,detail,amount,periods_affected)
          VALUES (?,?,?,?,?,?,?,?)`)
          .run(uid(), clientId, b.scopeId || null, String(b.category),
            text(b.title, "Title", 200), text(b.detail, "Detail", 2000, false),
            Number(b.amount) || 0, text(b.periods, "Periods", 120, false));
        return NextResponse.json({ ok: true });
      }

      case "resolveCleanup": {
        db().prepare("UPDATE cleanup_findings SET status=?, fixed_at=datetime('now') WHERE id=? AND client_id=?")
          .run(String(b.status || "FIXED"), String(b.id), clientId);
        return NextResponse.json({ ok: true });
      }

      case "addGoal": {
        // Writing the agreed target through to the metric registry happens inside addGoal.
        const id = addGoal(clientId, {
          title: text(b.title, "Goal", 200), detail: text(b.detail, "Detail", 2000, false),
          horizon: ["QUARTER", "YEAR", "THREE_YEAR"].includes(String(b.horizon)) ? String(b.horizon) : "YEAR",
          targetDate: text(b.targetDate, "Target date", 40, false),
          kpiKey: b.kpiKey ? String(b.kpiKey) : undefined,
          targetValue: b.targetValue != null && b.targetValue !== "" ? Number(b.targetValue) : undefined,
          targetLo: b.targetLo != null && b.targetLo !== "" ? Number(b.targetLo) : undefined,
          targetHi: b.targetHi != null && b.targetHi !== "" ? Number(b.targetHi) : undefined,
          baseline: b.baseline != null && b.baseline !== "" ? Number(b.baseline) : undefined,
          fromFindingId: b.fromFindingId ? String(b.fromFindingId) : undefined,
        });
        audit(s.userId, "GOAL_AGREED", `${clientId} ${b.title}`);
        return NextResponse.json({ ok: true, id });
      }

      case "addPainPoint": {
        const id = addPainPoint(clientId, {
          title: text(b.title, "Pain point", 200), detail: text(b.detail, "Detail", 2000, false),
          rootCause: text(b.rootCause, "Root cause", 500, false),
          kpiKey: b.kpiKey ? String(b.kpiKey) : undefined,
        });
        return NextResponse.json({ ok: true, id });
      }

      case "planSession": {
        const id = uid();
        const agenda = b.agenda ? String(b.agenda) : draftAgenda(clientId, String(b.periodLabel || "Monthly"));
        db().prepare(`INSERT INTO advisory_sessions
          (id,client_id,period_id,kind,scheduled_for,agenda,attendees) VALUES (?,?,?,?,?,?,?)`)
          .run(id, clientId, b.periodId || null, String(b.kind || "MONTHLY"),
            text(b.scheduledFor, "Date", 40, false), agenda, text(b.attendees, "Attendees", 200, false));
        return NextResponse.json({ ok: true, id, agenda });
      }

      case "recordSession": {
        db().prepare(`UPDATE advisory_sessions SET status='HELD', held_at=datetime('now'),
            notes=?, attendees=COALESCE(NULLIF(?,''), attendees) WHERE id=? AND client_id=?`)
          .run(text(b.notes, "Notes", 8000, false), text(b.attendees, "Attendees", 200, false),
            String(b.id), clientId);
        audit(s.userId, "SESSION_HELD", `${clientId} ${b.id}`);
        return NextResponse.json({ ok: true });
      }

      default:
        throw new ValidationError(`Unknown action "${action}".`);
    }
  } catch (e: any) { return fail(e); }
}
