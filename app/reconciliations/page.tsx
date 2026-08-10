import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import ReconWorkspace from "@/components/reconciliation/recon-workspace";
import {
  ensureClientConfig, packSummary, reconciliationEnabled,
} from "@/lib/reconciliation/model";

export const dynamic = "force-dynamic";

export default async function ReconciliationsPage({
  searchParams,
}: { searchParams: { client?: string; period?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  const clients: any[] = db().prepare("SELECT id, name FROM clients ORDER BY name").all();
  if (!clients.length) redirect("/clients");

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0].id;

  ensureClientConfig(clientId);
  const periods: any[] = db().prepare(
    `SELECT id, year, month, status FROM periods WHERE client_id=? ORDER BY year DESC, month DESC`,
  ).all(clientId);
  if (!periods.length) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
        <StaffHeader sub="Dashboard · Reconciliations" maxWidth={1080} userName={s.name} role={s.role} />
        <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
          <h1 className="display-l">Reconciliations</h1>
          <p className="section-q">No periods on file for this client.</p>
        </main>
      </div>
    );
  }

  const periodId = searchParams.period && periods.some((p) => p.id === searchParams.period)
    ? searchParams.period
    : periods[0].id;

  const pack = packSummary(clientId, periodId);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Reconciliations"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/reconciliations", label: "Reconciliations" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <ReconWorkspace
          clients={clients}
          initialClientId={clientId}
          periods={periods}
          initialPeriodId={periodId}
          initialPack={pack}
          enabled={reconciliationEnabled()}
        />
      </main>
    </div>
  );
}
