import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import ConnectionDetail from "@/components/integrations/connection-detail";
import { getHubConnection, listSyncRuns, publicConnection } from "@/lib/integrations/model";

export const dynamic = "force-dynamic";

export default async function IntegrationDetailPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  const connection = getHubConnection(params.id);
  if (!connection) notFound();
  const runs = listSyncRuns({ clientId: connection.clientId, connectionId: connection.id, limit: 50 });

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Integrations"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: `/integrations?client=${connection.clientId}`, label: "Integrations" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <ConnectionDetail initial={{ connection: publicConnection(connection), runs }} />
      </main>
    </div>
  );
}
