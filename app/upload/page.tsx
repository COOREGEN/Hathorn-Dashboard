import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth"
import { listClientsForFirm, resolveActiveFirmId } from "@/lib/tenancy";
import { db } from "@/lib/db";
import UploadForm from "@/components/upload-form";
import StaffHeader from "@/components/staff-header";

export const dynamic = "force-dynamic";

export default async function Upload() {
  const s = await getSession();
  if (!s || !["ADMIN", "BOOKKEEPER", "ADVISOR"].includes(s.role)) redirect("/login");

  const firmId = resolveActiveFirmId(s);
  const clients: any[] = firmId ? listClientsForFirm(firmId) : [];
  const entities: any[] = firmId
    ? db().prepare(
      `SELECT e.id, e.client_id, e.name FROM entities e
         JOIN clients c ON c.id = e.client_id
        WHERE c.firm_id=? ORDER BY e.rowid`,
    ).all(firmId)
    : [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Monthly close"
        maxWidth={760}
        userName={s.name}
        role={s.role}
      />
      <main className="sheet" style={{ maxWidth: 760, paddingTop: 48 }}>
        <h1 className="display-l">Upload the close</h1>
        <p className="section-q" style={{ marginBottom: 26 }}>
          Drop the month&apos;s exports — QuickBooks pivots and payroll registers are detected and
          mapped. Exact CSVs still work. The gate validates on the spot; nothing moves forward until it ties.
        </p>
        <UploadForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          entities={entities.map((e) => ({ id: e.id, clientId: e.client_id, name: e.name }))}
        />
      </main>
    </div>
  );
}
