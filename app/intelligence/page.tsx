import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listClientsForFirm, resolveActiveFirmId } from "@/lib/tenancy";
import StaffHeader from "@/components/staff-header";
import IntelligenceWorkspace from "@/components/intelligence/intelligence-workspace";

export const dynamic = "force-dynamic";

export default async function IntelligencePage({
  searchParams,
}: { searchParams: { client?: string; period?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR"].includes(s.role)) redirect("/");

  const firmId = resolveActiveFirmId(s);
  const clients = firmId ? listClientsForFirm(firmId) : [];
  if (!clients.length) redirect("/clients");

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0].id;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Intelligence"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/intelligence", label: "Intelligence" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <IntelligenceWorkspace
          clients={clients}
          initialClientId={clientId}
          initialPeriodId={searchParams.period || null}
        />
      </main>
    </div>
  );
}
