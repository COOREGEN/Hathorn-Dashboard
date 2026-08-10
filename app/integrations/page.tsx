import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth"
import { listClientsForFirm, resolveActiveFirmId } from "@/lib/tenancy";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import IntegrationsHub from "@/components/integrations/hub-workspace";
import { hubDashboard, integrationHubEnabled } from "@/lib/integrations/model";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: { searchParams: { client?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  const firmId = resolveActiveFirmId(s);
  const clients: any[] = firmId ? listClientsForFirm(firmId) : [];
  if (!clients.length) redirect("/clients");
  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0].id;

  const dash = hubDashboard(clientId);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Integrations"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/integrations", label: "Integrations" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        {!integrationHubEnabled() && (
          <p className="caption" style={{ marginBottom: 16 }}>Integration Hub is disabled via configuration.</p>
        )}
        <IntegrationsHub
          clients={clients}
          initialClientId={clientId}
          initial={dash as any}
        />
      </main>
    </div>
  );
}
