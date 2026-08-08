import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readiness, STAGES } from "@/lib/engagement";
import NewClientButton from "@/components/new-client-button";
import LogoutButton from "@/components/logout-button";

/**
 * Clients.
 *
 * This existed only at `/admin`, behind the last item in the rail, and the person who
 * needed it could not find it. Adding and removing a client is the most basic thing a
 * firm does with this software; it belongs at the top level with its own route.
 *
 * It also shows the engagement stage, because "where is this client in our process" is a
 * different question from "how did they do last month", and the platform only ever
 * answered the second.
 */
export const dynamic = "force-dynamic";

const STAGE_COL: Record<string, string> = {
  DISCOVERY: "#9A7B1E", CLEANUP: "#DB5928", ALIGNMENT: "#1F6F8B",
  ADVISORY: "#2C504D", PAUSED: "#6E675B",
};

export default async function Clients() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "CLIENT") redirect("/portal");
  if (s.role === "BOOKKEEPER") redirect("/upload");

  const rows: any[] = db().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM periods p WHERE p.client_id=c.id AND p.status='PUBLISHED') published,
      (SELECT COUNT(*) FROM entities e WHERE e.client_id=c.id) entities
    FROM clients c ORDER BY
      CASE c.stage WHEN 'ADVISORY' THEN 0 WHEN 'ALIGNMENT' THEN 1
                   WHEN 'CLEANUP' THEN 2 WHEN 'DISCOVERY' THEN 3 ELSE 4 END, c.name`).all();

  const byStage = STAGES.map((st) => ({
    ...st, count: rows.filter((r) => (r.stage ?? "DISCOVERY") === st.key).length,
  }));

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header className="masthead">
        <div className="masthead-inner" style={{ maxWidth: 1240 }}>
          <div>
            <div className="wordmark">HATHORN</div>
            <div className="wordmark-sub">Ledger · Clients</div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/portfolio" className="prepared-by">The book →</Link>
            <span className="prepared-by">{s.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "30px 32px 60px" }}>
        <div className="flex items-end justify-between flex-wrap gap-4"
          style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 300, margin: 0 }}>Clients</h1>
            <p className="caption" style={{ marginTop: 4 }}>
              {rows.length} client{rows.length === 1 ? "" : "s"} across the engagement lifecycle
            </p>
          </div>
          <NewClientButton knownIndustries={
            Array.from(new Set(rows.map((r: any) => (r.industry_tag || "").trim()).filter(Boolean))).sort()
          } />
        </div>

        {/* Where the book sits in the process — a different question from performance. */}
        <div className="flex gap-8 flex-wrap" style={{ marginBottom: 24 }}>
          {byStage.filter((s) => s.key !== "PAUSED" || s.count > 0).map((st) => (
            <div key={st.key} className="stat">
              <div className="eyebrow" style={{ color: STAGE_COL[st.key] }}>{st.label}</div>
              <div className="stat-v tnum">{st.count}</div>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
          {rows.map((c) => {
            const r = readiness(c.id);
            const stage = c.stage ?? "DISCOVERY";
            return (
              <div key={c.id} className="client-row" style={{ borderLeft: `3px solid ${STAGE_COL[stage]}` }}>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/dash?client=${c.id}`} className="book-name">{c.name}</Link>
                  <div className="book-sub">
                    {c.entities} business{c.entities === 1 ? "" : "es"} · {c.published} published
                    {c.industry_tag ? ` · ${c.industry_tag}` : ""}
                  </div>
                </div>

                <div>
                  <span className="tag" style={{ color: STAGE_COL[stage] }}>{r.stageLabel}</span>
                </div>

                <div style={{ minWidth: 0 }}>
                  {r.total > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <div style={{ flex: 1, height: 3, background: "#E8E2D4", maxWidth: 90 }}>
                          <div style={{ height: 3, width: `${(r.complete / r.total) * 100}%`,
                            background: STAGE_COL[stage] }} />
                        </div>
                        <span className="caption tnum">{r.complete}/{r.total}</span>
                      </div>
                      {r.nextAction && <div className="caption" style={{ marginTop: 3 }}>{r.nextAction}</div>}
                    </>
                  )}
                </div>

                <div className="flex gap-4 justify-end">
                  <Link href={`/engagement?client=${c.id}`} className="linkish">Engagement</Link>
                  <Link href={`/dash?client=${c.id}`} className="linkish">Dashboard</Link>
                  <Link href={`/admin/clients/${c.id}`} className="linkish muted">Settings</Link>
                </div>
              </div>
            );
          })}
        </div>

        <p className="caption" style={{ marginTop: 18, maxWidth: 720 }}>
          A client moves Discovery → Cleanup → Alignment → Advisory. The dashboard is the last
          stage, not the whole service — a client still in cleanup should not be shown a polished
          statement of numbers nobody has verified yet.
        </p>
      </main>
    </div>
  );
}
