import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import PlatformCreateFirm from "@/components/platform-create-firm";
import PlatformOpsConsole from "@/components/platform-ops-console";
import { readiness } from "@/lib/ops/health";
import { jobCounts } from "@/lib/ops/jobs";
import { platformUsageSummary } from "@/lib/ops/usage";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.isPlatformAdmin) redirect("/firm");

  const firms: any[] = db().prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM clients c WHERE c.firm_id=f.id) client_count
    FROM firms f ORDER BY f.name
  `).all();

  const health = readiness();
  const jobs = jobCounts();
  const usage = platformUsageSummary();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Hathorn Dashboard · Platform"
        maxWidth={960}
        userName={s.name}
        role="PLATFORM"
        links={[{ href: "/firm", label: "My firm" }]}
      />
      <main className="sheet" style={{ maxWidth: 960, paddingTop: 48 }}>
        <h1 className="display-l">Platform</h1>
        <p className="section-q" style={{ marginBottom: 20 }}>
          Provision firms, watch system health, retry failed jobs — without opening client books.
        </p>

        <p className="caption" style={{ marginBottom: 28 }}>
          {health.appEnv} · v{health.appVersion}
          {health.gitCommit ? ` (${health.gitCommit})` : ""} · status {health.status} ·
          jobs failed {jobs.FAILED || 0} · firms {usage.firms.active}
        </p>

        <h2 className="display-m" style={{ marginBottom: 12 }}>Firms</h2>
        <table className="data" style={{ width: "100%", marginBottom: 40 }}>
          <thead>
            <tr>
              <th>Firm</th><th>Status</th><th>Clients</th><th>Slug</th>
            </tr>
          </thead>
          <tbody>
            {firms.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td>{f.status}</td>
                <td className="num">{f.client_count}</td>
                <td>{f.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <PlatformCreateFirm />
        <PlatformOpsConsole />

        <p className="caption" style={{ marginTop: 40 }}>
          <Link href="/admin" style={{ color: "var(--gold-deep)" }}>Firm ops →</Link>
        </p>
      </main>
    </div>
  );
}
