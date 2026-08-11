import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listClientsForFirm, resolveActiveFirmId } from "@/lib/tenancy";
import StaffHeader from "@/components/staff-header";
import StaffCurationWorkspace from "@/components/client-portal/staff-curation";

export const dynamic = "force-dynamic";

export default async function ClientExperiencePage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR"].includes(s.role)) redirect("/");

  const firmId = resolveActiveFirmId(s);
  const clients = firmId ? listClientsForFirm(firmId) : [];
  if (!clients.length) redirect("/clients");

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Client Experience"
        maxWidth={960}
        userName={s.name}
        role={s.role}
        links={[{ href: "/client-experience", label: "Client Experience" }]}
      />
      <main className="sheet" style={{ maxWidth: 960, paddingTop: 40 }}>
        <p className="eyebrow">Client Experience</p>
        <h1 className="display-m" style={{ margin: "6px 0 8px" }}>Curate the client portal</h1>
        <p className="prepared-by" style={{ marginBottom: 24 }}>
          AI drafts stay internal until you publish. Clients only see PUBLISHED reports, insights, shared forecasts, and CLIENT_VISIBLE documents.
        </p>
        <StaffCurationWorkspace clients={clients.map((c) => ({ id: c.id, name: c.name, slug: c.slug || c.id }))} />
      </main>
    </div>
  );
}
