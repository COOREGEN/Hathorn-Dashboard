import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import UploadForm from "@/components/upload-form";
import StaffHeader from "@/components/staff-header";

export const dynamic = "force-dynamic";

export default async function Upload() {
  const s = await getSession();
  if (!s || !["ADMIN", "BOOKKEEPER", "ADVISOR"].includes(s.role)) redirect("/login");

  const clients: any[] = db().prepare("SELECT id, name, slug FROM clients ORDER BY name").all();
  const entities: any[] = db().prepare("SELECT id, client_id, name FROM entities ORDER BY rowid").all();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Ledger · Monthly close"
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
