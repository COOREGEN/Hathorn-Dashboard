import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db, monthShort } from "@/lib/db";
import LogoutButton from "@/components/logout-button";
import NewClientButton from "@/components/new-client-button";
import { integrationStatus } from "@/lib/config";
import { backupStatus } from "@/lib/backup";
import BackupPanel from "@/components/backup-panel";

export const dynamic = "force-dynamic";

const STAGE_COLOR: Record<string, string> = {
  AWAITING: "#6E675B", GATED: "#9E3F1D", IN_REVIEW: "#B68F23", PUBLISHED: "#2C504D",
};
const STAGE: Record<string, { label: string; cls: string }> = {
  AWAITING: { label: "Awaiting close", cls: "" },
  GATED: { label: "Gate failed", cls: "" },
  IN_REVIEW: { label: "In review", cls: "" },
  PUBLISHED: { label: "Published", cls: "" },
};

export default async function Admin() {
  const s = await getSession();
  if (!s || !["ADMIN", "ADVISOR"].includes(s.role)) redirect("/login");

  // Three queries total, not two per client — the board must stay fast as the book grows.
  const clients: any[] = db().prepare("SELECT * FROM clients ORDER BY name").all();

  const latestRows: any[] = db().prepare(`
    SELECT p.* FROM periods p
     WHERE p.id = (
       SELECT id FROM periods
        WHERE client_id = p.client_id
        ORDER BY year DESC, month DESC LIMIT 1
     )`).all();
  const latestByClient = new Map(latestRows.map((p) => [p.client_id, p]));

  const countRows: any[] = db()
    .prepare("SELECT client_id, COUNT(*) n FROM periods WHERE status='PUBLISHED' GROUP BY client_id")
    .all();
  const countByClient = new Map(countRows.map((r) => [r.client_id, r.n]));

  const rows = clients.map((c) => ({
    client: c,
    latest: latestByClient.get(c.id) ?? null,
    publishedCount: countByClient.get(c.id) ?? 0,
  }));

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header className="masthead">
        <div className="masthead-inner" style={{ maxWidth: 980 }}>
          <div>
            <div className="wordmark">HATHORN</div>
            <div className="wordmark-sub">Ledger · Client reporting</div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/account/security" className="prepared-by" style={{ textDecoration: "none" }}>
              Security
            </Link>
            <span className="prepared-by">{s.name} · {s.role}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="sheet" style={{ maxWidth: 980, paddingTop: 48 }}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="display-l">The Book</h1>
          {s.role === "ADMIN" && <NewClientButton />}
        </div>
        <p className="section-q" style={{ marginBottom: 26 }}>Every client, current stage. Nothing stalls silently.</p>

        <div>
          <table className="ledger-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Client</th>
                <th>Latest period</th>
                <th>Stage</th>
                <th>Published</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client: c, latest, publishedCount }) => (
                <tr key={c.id}>
                  <td style={{ textAlign: "left" }}>
                    <div style={{ fontFamily: "var(--display)", fontSize: 17, color: "var(--ink)" }}>{c.name}</div>
                    <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                      <span style={{ width: 9, height: 9, background: c.brand_primary, display: "inline-block" }} />
                      <span style={{ width: 9, height: 9, background: c.brand_accent, display: "inline-block" }} />
                      <span className="caption" style={{ fontSize: 10 }}>{c.template}</span>
                    </div>
                  </td>
                  <td>
                    {latest ? `${monthShort(latest.month)} ${latest.year}` : "—"}
                  </td>
                  <td>
                    <span className="tag" style={{ color: latest ? STAGE_COLOR[latest.status] : "#6E675B" }}>
                      {latest ? STAGE[latest.status]?.label : "No data"}
                    </span>
                  </td>
                  <td style={{ color: "var(--ink-mute)" }}>{publishedCount}</td>
                  <td className="space-x-4">
                    <Link href={`/dash?client=${c.id}`}
                      style={{ fontFamily: "var(--utility)", fontSize: 11, fontWeight: 600, color: "var(--gold-deep)" }}>
                      Dashboard
                    </Link>
                    {latest && latest.status !== "PUBLISHED" && (
                      <Link style={{ fontFamily: "var(--utility)", fontSize: 11, fontWeight: 600, color: "var(--gold-deep)" }} href={`/review/${latest.id}`}>
                        Review →
                      </Link>
                    )}
                    <Link style={{ fontFamily: "var(--utility)", fontSize: 11, color: "var(--ink-mute)" }} href={`/portal?client=${c.slug}`}>
                      Portal
                    </Link>
                    {s.role === "ADMIN" && (
                      <Link style={{ fontFamily: "var(--utility)", fontSize: 11, color: "var(--ink-mute)" }} href={`/admin/clients/${c.id}`}>
                        Manage
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="caption" style={{ marginTop: 18 }}>
          Bookkeeper uploads at <span style={{ fontFamily: "var(--utility)", fontWeight: 600 }}>/upload</span> · clients sign in and land on their portal automatically.
        </div>

        {s.role === "ADMIN" && (
          <div style={{ marginTop: 52 }}>
            <h2 className="display-m">Storage</h2>
            <p className="section-q" style={{ marginBottom: 18 }}>
              A single database file with no copies is a countdown, not a strategy.
            </p>
            <BackupPanel initial={backupStatus()} />
          </div>
        )}

        <div style={{ marginTop: 52 }}>
          <h2 className="display-m">Integrations</h2>
          <p className="section-q" style={{ marginBottom: 18 }}>Each one is optional. The platform runs without any of them.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {integrationStatus().map((i) => (
              <div key={i.name} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontFamily: "var(--utility)", fontSize: 12, fontWeight: 600 }}>{i.name}</span>
                  <span className="tag" style={{ color: i.enabled ? "var(--brand)" : "var(--ink-mute)" }}>
                    {i.enabled ? "On" : "Off"}
                  </span>
                </div>
                {!i.enabled && <p className="caption" style={{ marginTop: 6 }}>{i.hint}</p>}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
