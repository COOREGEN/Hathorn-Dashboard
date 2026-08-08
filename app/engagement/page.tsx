import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readiness, findings, cleanupState, goals, painPoints, sessions, STAGES } from "@/lib/engagement";
import { clientConfig } from "@/lib/kpi-registry";
import { definition } from "@/lib/kpi-registry";
import LogoutButton from "@/components/logout-button";
import {
  StageControl, FindingForm, ResolveFinding, ScopeForm, ScopeStatus,
  CleanupForm, ResolveCleanup, GoalForm, PainForm, SessionPlanner, SessionRecorder,
} from "@/components/engagement/forms";

/**
 * The engagement, as one page with tabs rather than five routes.
 *
 * The four stages were linked from the sidebar and from every client row, and every one
 * of them returned Not Found — the logic and forms were built and tested but no page ever
 * rendered them. A dead link in your own navigation is worse than a missing feature,
 * because it makes everything around it look unreliable.
 *
 * Tabs rather than routes because the stages are one continuous relationship, not four
 * destinations: an advisor recording a goal often wants the discovery finding that
 * prompted it visible in the next click.
 */
export const dynamic = "force-dynamic";

const TABS = [
  ["discovery", "Discovery"], ["cleanup", "Cleanup"],
  ["goals", "Alignment"], ["sessions", "Sessions"],
] as const;

const SEV: Record<string, string> = { high: "#9E401D", medium: "#9A7B1E", low: "#6E675B" };
const STAGE_COL: Record<string, string> = {
  DISCOVERY: "#9A7B1E", CLEANUP: "#DB5928", ALIGNMENT: "#1F6F8B",
  ADVISORY: "#2C504D", PAUSED: "#6E675B",
};

export default async function Engagement({ searchParams }: {
  searchParams: Record<string, string | undefined>;
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "CLIENT") redirect("/portal");

  const clients: any[] = db().prepare("SELECT id, name, stage FROM clients ORDER BY name").all();
  if (!clients.length) redirect("/clients");

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client : clients[0].id;
  const client = clients.find((c) => c.id === clientId)!;
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "discovery";

  const r = readiness(clientId);
  const nextMeta = STAGES.find((x) => x.key === r.nextStage);

  // Only active metrics can carry a goal's target; offering the rest would create a
  // target on something nobody is watching.
  const kpis: { key: string; label: string; unit: string }[] = [];
  for (const c of clientConfig(clientId).filter((x) => x.active)) {
    const d = definition(c.kpiKey);
    if (d) kpis.push({ key: d.key, label: d.label, unit: String(d.unit) });
  }

  const tabHref = (t: string) => `/engagement?client=${clientId}&tab=${t}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header className="masthead">
        <div className="masthead-inner" style={{ maxWidth: 1180 }}>
          <div>
            <div className="wordmark">HATHORN</div>
            <div className="wordmark-sub">Ledger · Engagement</div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/today" className="prepared-by">← Today</Link>
            <Link href="/clients" className="prepared-by">Clients</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 32px 70px" }}>
        <div className="flex items-end justify-between flex-wrap gap-4"
          style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 16, marginBottom: 8 }}>
          <div>
            <h1 style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 300, margin: 0 }}>
              {client.name}
            </h1>
            <p className="caption" style={{ marginTop: 4 }}>
              <span style={{ color: STAGE_COL[r.stage] }}>{r.stageLabel}</span>
              {" — "}{r.question}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {clients.length > 1 && (
              <div className="flex flex-wrap gap-2" style={{ maxWidth: 360 }}>
                {clients.map((c) => (
                  <Link key={c.id} href={`/engagement?client=${c.id}`}
                    className="tag" style={{
                      textDecoration: "none",
                      background: c.id === clientId ? "var(--brand-tint)" : "transparent",
                      borderColor: c.id === clientId ? "var(--brand)" : "var(--hairline)",
                      color: "var(--ink)",
                    }}>
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
            <Link href={`/dash?client=${clientId}`} className="btn btn-quiet">Dashboard →</Link>
          </div>
        </div>

        {/* Readiness: what this stage still needs, and the single next thing. */}
        <div className="card" style={{ marginTop: 18 }}>
          <div className="flex items-baseline justify-between flex-wrap gap-3">
            <div className="card-t">{r.stageLabel} — {r.complete} of {r.total} done</div>
            {r.nextStage && (
              <StageControl clientId={clientId} readyToAdvance={r.readyToAdvance}
                nextStage={r.nextStage} nextLabel={nextMeta?.label ?? r.nextStage} />
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            {r.checks.map((c) => (
              <div key={c.label} style={{ display: "flex", gap: 11, alignItems: "flex-start",
                padding: "8px 0", borderTop: "1px solid var(--hairline)" }}>
                <span style={{ fontFamily: "var(--utility)", fontSize: 13,
                  color: c.done ? "var(--brand-text)" : "var(--ink-mute)", width: 14, flexShrink: 0 }}>
                  {c.done ? "✓" : "○"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--utility)", fontSize: 12.5,
                    fontWeight: c.done ? 400 : 600,
                    color: c.done ? "var(--ink-mute)" : "var(--ink)" }}>{c.label}</div>
                  <div className="caption" style={{ marginTop: 1 }}>{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap" style={{ margin: "26px 0 20px" }}>
          {TABS.map(([k, label]) => (
            <Link key={k} href={tabHref(k)} className={`chip${tab === k ? " on" : ""}`}>{label}</Link>
          ))}
        </div>

        {tab === "discovery" && <Discovery clientId={clientId} />}
        {tab === "cleanup" && <Cleanup clientId={clientId} />}
        {tab === "goals" && <Alignment clientId={clientId} kpis={kpis} />}
        {tab === "sessions" && <Sessions clientId={clientId} />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Discovery({ clientId }: { clientId: string }) {
  const items = findings(clientId);
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 24 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          What the discovery call surfaced ({items.length})
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <h3>Nothing captured yet</h3>
            <p>Record what you found while it is still fresh — the form beside this one.</p>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
            {items.map((f) => (
              <div key={f.id} style={{ padding: "13px 16px", borderBottom: "1px solid var(--hairline)",
                borderLeft: `3px solid ${SEV[f.severity] ?? SEV.medium}` }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="tag" style={{ color: SEV[f.severity] ?? SEV.medium, fontSize: 8 }}>
                    {String(f.kind).toLowerCase()}
                  </span>
                  {f.area && <span className="caption">{f.area}</span>}
                  {f.status !== "OPEN" && (
                    <span className="caption" style={{ color: "var(--brand-text)" }}>
                      {String(f.status).toLowerCase()}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto" }}>
                    {f.status === "OPEN" && <ResolveFinding clientId={clientId} id={f.id} />}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--editorial)", fontSize: 15, marginTop: 5 }}>{f.title}</div>
                {f.detail && <p className="caption" style={{ marginTop: 4 }}>{f.detail}</p>}
                {f.became_goal_id && (
                  <p className="caption" style={{ marginTop: 5, color: "var(--gold-deep)" }}>
                    Became an agreed goal.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <FindingForm clientId={clientId} />
    </div>
  );
}

function Cleanup({ clientId }: { clientId: string }) {
  const st = cleanupState(clientId);
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 24 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Audit scope</div>
          {st.scopes.length === 0 ? (
            <div className="empty">
              <h3>No period scoped</h3>
              <p>Nothing downstream is trustworthy until the historical books are reviewed.</p>
            </div>
          ) : (
            <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
              {st.scopes.map((sc) => (
                <div key={sc.id} className="flex items-center gap-3"
                  style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--utility)", fontSize: 13, fontWeight: 600 }}>
                      {sc.period_from} — {sc.period_to}
                    </div>
                    <div className="caption">{sc.source_system || "source not stated"}</div>
                  </div>
                  <ScopeStatus clientId={clientId} id={sc.id} status={sc.status} />
                </div>
              ))}
            </div>
          )}
        </div>
        <ScopeForm clientId={clientId} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)",
        gap: 24, marginTop: 28 }}>
        <div>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
            <span className="eyebrow">Findings ({st.open.length} open)</span>
            {st.exposure > 0 && (
              <span className="caption" style={{ color: "var(--accent-text)" }}>
                ${st.exposure}K unresolved
              </span>
            )}
          </div>
          {st.items.length === 0 ? (
            <div className="empty"><h3>Nothing recorded</h3><p>Findings from the audit go here.</p></div>
          ) : (
            <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
              {st.items.map((f) => (
                <div key={f.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline)",
                  opacity: f.status === "OPEN" ? 1 : 0.55 }}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="tag" style={{ fontSize: 8 }}>{String(f.category).toLowerCase()}</span>
                    {f.amount !== 0 && (
                      <span className="tnum" style={{ fontFamily: "var(--utility)", fontSize: 12.5,
                        fontWeight: 600 }}>${Math.abs(f.amount)}K</span>
                    )}
                    {f.periods_affected && <span className="caption">{f.periods_affected}</span>}
                    <span style={{ marginLeft: "auto" }}>
                      {f.status === "OPEN"
                        ? <ResolveCleanup clientId={clientId} id={f.id} />
                        : <span className="caption" style={{ color: "var(--brand-text)" }}>
                            {String(f.status).toLowerCase()}
                          </span>}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--editorial)", fontSize: 14.5, marginTop: 4 }}>{f.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <CleanupForm clientId={clientId} />
      </div>
    </>
  );
}

function Alignment({ clientId, kpis }: {
  clientId: string; kpis: { key: string; label: string; unit: string }[];
}) {
  const gs = goals(clientId);
  const ps = painPoints(clientId);
  const openFindings = findings(clientId).filter((f) => f.status === "OPEN");
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 24 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Agreed goals ({gs.length})</div>
          {gs.length === 0 ? (
            <div className="empty">
              <h3>No goals agreed yet</h3>
              <p>
                Until a goal names a metric, every measure is reported without a verdict —
                which is the honest state, not a gap.
              </p>
            </div>
          ) : (
            <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
              {gs.map((g) => (
                <div key={g.id} style={{ padding: "13px 16px", borderBottom: "1px solid var(--hairline)" }}>
                  <div style={{ fontFamily: "var(--editorial)", fontSize: 15 }}>{g.title}</div>
                  <div className="caption" style={{ marginTop: 4 }}>
                    {g.target_date ? `By ${g.target_date}` : String(g.horizon).toLowerCase().replace("_", " ")}
                    {g.measured_by_kpi && (
                      <> · measured by {kpis.find((k) => k.key === g.measured_by_kpi)?.label ?? g.measured_by_kpi}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <GoalForm clientId={clientId} kpis={kpis} findings={openFindings} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)",
        gap: 24, marginTop: 28 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Pain points ({ps.length})</div>
          {ps.length === 0 ? (
            <div className="empty"><h3>Nothing recorded</h3>
              <p>What the client is actually worried about, and why it happens.</p></div>
          ) : (
            <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
              {ps.map((p) => (
                <div key={p.id} style={{ padding: "13px 16px", borderBottom: "1px solid var(--hairline)" }}>
                  <div style={{ fontFamily: "var(--editorial)", fontSize: 15 }}>{p.title}</div>
                  {p.root_cause && (
                    <p className="caption" style={{ marginTop: 4 }}>
                      <span style={{ color: "var(--gold-deep)" }}>Why:</span> {p.root_cause}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <PainForm clientId={clientId} kpis={kpis} />
      </div>
    </>
  );
}

function Sessions({ clientId }: { clientId: string }) {
  const list = sessions(clientId);
  const latest: any = db().prepare(
    `SELECT id, year, month FROM periods WHERE client_id=? AND status='PUBLISHED'
      ORDER BY year DESC, month DESC LIMIT 1`).get(clientId);
  const label = latest
    ? `${["", "January", "February", "March", "April", "May", "June", "July", "August",
         "September", "October", "November", "December"][latest.month]} ${latest.year}`
    : "Monthly";

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 24 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Advisory sessions ({list.length})</div>
        {list.length === 0 ? (
          <div className="empty">
            <h3>No sessions yet</h3>
            <p>Plan one and the agenda drafts itself from the goals, pain points and open commitments.</p>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
            {list.map((x) => (
              <div key={x.id} style={{ padding: "14px 16px", borderBottom: "1px solid var(--hairline)" }}>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span style={{ fontFamily: "var(--utility)", fontSize: 13, fontWeight: 600 }}>
                    {x.scheduled_for || String(x.created_at).slice(0, 10)}
                  </span>
                  <span className="tag" style={{ fontSize: 8,
                    color: x.status === "HELD" ? "var(--brand-text)" : "var(--gold-deep)" }}>
                    {String(x.status).toLowerCase()}
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    {x.status !== "HELD" && (
                      <SessionRecorder clientId={clientId} id={x.id} existingNotes={x.agenda || ""} />
                    )}
                  </span>
                </div>
                {x.agenda && x.status !== "HELD" && (
                  <pre style={{ fontFamily: "var(--utility)", fontSize: 11.5, whiteSpace: "pre-wrap",
                    color: "var(--ink-soft)", marginTop: 9, lineHeight: 1.55 }}>{x.agenda}</pre>
                )}
                {x.notes && (
                  <p style={{ fontFamily: "var(--editorial)", fontSize: 14, marginTop: 8,
                    whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{x.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <SessionPlanner clientId={clientId} periodLabel={label} periodId={latest?.id ?? ""} />
    </div>
  );
}
