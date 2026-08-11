import { db, uid } from "../db";

export function recordPortalEvent(opts: {
  firmId: string;
  clientId: string;
  userId: string;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  detail?: Record<string, unknown>;
}) {
  db().prepare(`
    INSERT INTO client_portal_events
      (id, firm_id, client_id, user_id, event_type, resource_type, resource_id, detail_json)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    uid(), opts.firmId, opts.clientId, opts.userId, opts.eventType,
    opts.resourceType || null, opts.resourceId || null,
    JSON.stringify(opts.detail || {}),
  );
}

export function listPortalEvents(clientId: string, limit = 50) {
  return db().prepare(`
    SELECT * FROM client_portal_events
    WHERE client_id=? ORDER BY created_at DESC LIMIT ?
  `).all(clientId, limit) as any[];
}

export function staffEngagementSummary(clientId: string) {
  const events = listPortalEvents(clientId, 200);
  const viewed = events.filter((e) => e.event_type === "CLIENT_REPORT_VIEWED").length;
  const answered = events.filter((e) => e.event_type === "CLIENT_QUESTION_ANSWERED").length;
  const uploaded = events.filter((e) => e.event_type === "CLIENT_DOCUMENT_UPLOADED").length;
  return { reportViews: viewed, questionsAnswered: answered, documentsUploaded: uploaded };
}
