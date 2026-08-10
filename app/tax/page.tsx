import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth"
import { listClientsForFirm, resolveActiveFirmId } from "@/lib/tenancy";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import TaxWorkspace from "@/components/tax/tax-workspace";
import {
  listIssues, listAuthorities, ensureSeedAuthorities, taxIntelligenceEnabled,
} from "@/lib/tax/model";
import { factGraphStatus } from "@/lib/tax/fact-graph";
import { TAX_RULES } from "@/lib/tax/rules";
import { ENTITY_TYPES } from "@/lib/tax/types";

export const dynamic = "force-dynamic";

export default async function TaxPage({
  searchParams,
}: { searchParams: { client?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR"].includes(s.role)) redirect("/");

  ensureSeedAuthorities();
  const firmId = resolveActiveFirmId(s);
  const clients: any[] = firmId ? listClientsForFirm(firmId) : [];
  if (!clients.length) redirect("/clients");

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0].id;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Tax Intelligence"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/tax", label: "Tax" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <TaxWorkspace
          clients={clients}
          initialClientId={clientId}
          issues={listIssues(clientId)}
          authorities={listAuthorities()}
          rules={[...TAX_RULES]}
          entityTypes={[...ENTITY_TYPES]}
          enabled={taxIntelligenceEnabled()}
          factGraph={factGraphStatus()}
        />
      </main>
    </div>
  );
}
