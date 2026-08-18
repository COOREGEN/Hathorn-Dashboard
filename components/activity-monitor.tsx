"use client";

/**
 * Activity monitor — who touched what account / period / close.
 * Additive panel for /admin (firm) and /platform (ops). Does not alter
 * overview-v2, portal, or command-center UX.
 */

import { useCallback, useEffect, useState, useTransition } from "react";

type EventRow = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  detail: string;
  clientId: string | null;
  clientName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  CLOSE_UPLOAD: "Uploaded close",
  PERIOD_PUBLISH: "Published period",
  PERIOD_AMEND: "Opened amendment",
  PERIOD_REVOKE: "Unpublished period",
  STORY_DRAFT: "Drafted story notes",
  NOTE_SAVE: "Saved commentary",
  PORTAL_CONFIG_UPDATE: "Updated portal config",
  STATEMENT_PDF_EXPORTED: "Exported statement PDF",
  RECONCILIATION_RUN: "Ran reconciliation",
  CLOSE_START: "Started close",
  CLOSE_COMPLETE: "Completed close check",
  USER_CREATE: "Created user",
  USER_UPDATE: "Updated user",
  CLIENT_CREATE: "Created client",
  CLIENT_UPDATE: "Updated client",
  AUDIT_TRAIL_VIEWED: "Viewed activity log",
};

function labelFor(action: string) {
  return ACTION_LABELS[action] || action.replace(/_/g, " ").toLowerCase();
}

export default function ActivityMonitor({
  endpoint = "/api/admin/audit",
  title = "Activity log",
  subtitle = "Who touched what — append-only trail for this firm.",
}: {
  endpoint?: string;
  title?: string;
  subtitle?: string;
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError("");
      const sp = new URLSearchParams();
      if (action) sp.set("action", action);
      if (q.trim()) sp.set("q", q.trim());
      sp.set("limit", "80");
      const res = await fetch(`${endpoint}?${sp.toString()}`).then((r) => r.json());
      if (!res.ok) {
        setError(res.error || "Could not load activity.");
        return;
      }
      setEvents(res.events || []);
      setActions(res.actions || []);
    });
  }, [endpoint, action, q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section style={{ marginBottom: 52 }}>
      <h2 className="display-m">{title}</h2>
      <p className="section-q" style={{ marginBottom: 18 }}>{subtitle}</p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search person, client, action…"
          aria-label="Search activity"
          style={{
            flex: "1 1 220px",
            minWidth: 180,
            border: "1px solid var(--hairline)",
            background: "transparent",
            padding: "8px 10px",
            fontFamily: "var(--utility)",
            fontSize: 12,
          }}
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
          style={{
            border: "1px solid var(--hairline)",
            background: "transparent",
            padding: "8px 10px",
            fontFamily: "var(--utility)",
            fontSize: 12,
          }}
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          type="button"
          className="chip"
          onClick={load}
          disabled={pending}
          style={{ cursor: "pointer" }}
        >
          {pending ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="caption" style={{ color: "var(--accent-deep, #9E3F1D)" }}>{error}</p>
      ) : null}

      <div style={{ borderTop: "1px solid var(--hairline)" }}>
        {events.length === 0 && !pending ? (
          <p className="caption" style={{ padding: "16px 0" }}>
            No activity recorded yet for this scope.
          </p>
        ) : null}
        {events.map((ev) => (
          <article
            key={ev.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto",
              gap: 12,
              padding: "12px 0",
              borderBottom: "1px solid var(--hairline)",
              fontFamily: "var(--utility)",
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                {labelFor(ev.action)}
                <span style={{ marginLeft: 8, fontWeight: 500, color: "var(--ink-mute)", letterSpacing: "0.04em" }}>
                  {ev.action}
                </span>
              </div>
              <div style={{ color: "var(--ink-mute)", marginTop: 4 }}>
                {ev.userName || ev.userEmail || "Unknown user"}
                {ev.userRole ? ` · ${ev.userRole}` : ""}
                {ev.clientName ? ` · ${ev.clientName}` : ""}
              </div>
              {ev.detail ? (
                <div style={{ marginTop: 4, color: "var(--ink-soft)", wordBreak: "break-word" }}>
                  {ev.detail}
                </div>
              ) : null}
            </div>
            <div style={{ color: "var(--ink-mute)" }}>
              {ev.resourceType ? (
                <div>
                  {ev.resourceType}
                  {ev.resourceId ? (
                    <code style={{ marginLeft: 6, fontSize: 10 }}>{String(ev.resourceId).slice(0, 12)}…</code>
                  ) : null}
                </div>
              ) : (
                <span>—</span>
              )}
            </div>
            <div
              className="tnum"
              style={{ color: "var(--ink-mute)", whiteSpace: "nowrap", textAlign: "right" }}
              title={ev.createdAt}
            >
              {ev.createdAt?.replace("T", " ").slice(0, 19)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
