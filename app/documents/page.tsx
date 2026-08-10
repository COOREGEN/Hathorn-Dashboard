import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth"
import { listClientsForFirm, resolveActiveFirmId } from "@/lib/tenancy";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import DocumentsWorkspace from "@/components/documents/documents-workspace";
import { listDocuments } from "@/lib/documents/model";
import { documentIntelligenceStatus } from "@/lib/documents/engine";
import { DOCUMENT_TYPES } from "@/lib/documents/types";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
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

  const periods: any[] = db().prepare(
    `SELECT id, year, month, status FROM periods WHERE client_id=? ORDER BY year DESC, month DESC LIMIT 24`,
  ).all(clientId);

  const documents = listDocuments(clientId);
  const intelligence = documentIntelligenceStatus();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Documents"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/documents", label: "Documents" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <DocumentsWorkspace
          clients={clients}
          initialClientId={clientId}
          periods={periods}
          initialDocuments={documents}
          types={DOCUMENT_TYPES}
          intelligence={intelligence}
        />
      </main>
    </div>
  );
}
