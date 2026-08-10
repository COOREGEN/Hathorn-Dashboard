import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import PlanningWorkspace from "@/components/planning/planning-workspace";
import {
  loadBaseline, defaultAssumptionsFromBaseline, listModelRuns,
} from "@/lib/fpa/model";
import { DEFAULT_ASSUMPTIONS } from "@/lib/fpa/types";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: { searchParams: { client?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR"].includes(s.role)) redirect("/");

  const clients: any[] = db().prepare("SELECT id, name FROM clients ORDER BY name").all();
  if (!clients.length) redirect("/clients");

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0].id;

  const base = loadBaseline(clientId);
  const defaults = base
    ? defaultAssumptionsFromBaseline(base.baseline)
    : DEFAULT_ASSUMPTIONS;
  const recent = listModelRuns(clientId, 5);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Ledger · Planning"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/planning", label: "Planning" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <PlanningWorkspace
          clients={clients}
          initialClientId={clientId}
          baseline={base?.baseline ?? null}
          history={base?.history ?? []}
          defaultAssumptions={defaults}
          recentRuns={recent}
        />
      </main>
    </div>
  );
}
