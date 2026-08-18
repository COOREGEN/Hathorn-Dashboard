import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import { integrationStatus } from "@/lib/config";
import { backupStatus } from "@/lib/backup";
import BackupPanel from "@/components/backup-panel";
import ActivityMonitor from "@/components/activity-monitor";

/**
 * Firm ops — backups, integrations, security.
 *
 * Client lists live on /clients and /portfolio. This page used to duplicate both
 * and called itself "The Book", which collided with Attention. Keep it short.
 */
export const dynamic = "force-dynamic";

export default async function Admin() {
  const s = await getSession();
  if (!s || !["ADMIN", "ADVISOR"].includes(s.role)) redirect("/login");

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Firm ops"
        maxWidth={880}
        userName={s.name}
        role={s.role}
        links={[
          { href: "/firm", label: "Firm settings" },
          { href: "/account/security", label: "Security" },
          ...(s.isPlatformAdmin ? [{ href: "/platform", label: "Platform" }] : []),
        ]}
      />

      <main className="sheet" style={{ maxWidth: 880, paddingTop: 48 }}>
        <h1 className="display-l">Ops</h1>
        <p className="section-q" style={{ marginBottom: 12 }}>
          Storage, integrations, and account security. Firm profile and branding live under Firm.
        </p>
        <p className="caption" style={{ marginBottom: 40 }}>
          <Link href="/firm" style={{ color: "var(--gold-deep)" }}>Firm settings →</Link>
          {" · "}
          <Link href="/clients" style={{ color: "var(--gold-deep)" }}>Open clients →</Link>
          {" · "}
          <Link href="/portfolio" style={{ color: "var(--gold-deep)" }}>Who needs attention →</Link>
        </p>

        {s.role === "ADMIN" && (
          <>
            <ActivityMonitor />
            <section style={{ marginBottom: 52 }}>
              <h2 className="display-m">Storage</h2>
              <p className="section-q" style={{ marginBottom: 18 }}>
                A single database file with no copies is a countdown, not a strategy.
              </p>
              <BackupPanel initial={backupStatus()} />
            </section>
          </>
        )}

        <section>
          <h2 className="display-m">Integrations</h2>
          <p className="section-q" style={{ marginBottom: 18 }}>
            Each one is optional. The platform runs without any of them.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-6">
            {integrationStatus().map((i) => (
              <div key={i.name} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
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
        </section>
      </main>
    </div>
  );
}
