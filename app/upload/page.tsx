import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import UploadForm from "@/components/upload-form";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function Upload() {
  const s = await getSession();
  if (!s || !["ADMIN", "BOOKKEEPER", "ADVISOR"].includes(s.role)) redirect("/login");

  const clients: any[] = db().prepare("SELECT id, name, slug FROM clients ORDER BY name").all();
  const entities: any[] = db().prepare("SELECT id, client_id, name FROM entities ORDER BY rowid").all();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header className="masthead">
        <div className="masthead-inner" style={{ maxWidth: 760 }}>
          <div>
            <div className="wordmark">HATHORN</div>
            <div className="wordmark-sub">Ledger · Monthly close</div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span className="prepared-by">{s.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
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
        <div style={{ marginTop: 34, borderTop: "1px solid var(--hairline)", paddingTop: 20 }}>
          <div className="eyebrow">What to attach</div>
          <div className="space-y-2" style={{ marginTop: 12, fontFamily: "var(--utility)", fontSize: 12, color: "var(--ink-soft)" }}>
            <div><b>P&amp;L</b> — by class/location exports are auto-detected; exact CSV: entity, category, label, amount ($K)</div>
            <div><b>Payroll</b> — register with wages / taxes / hours; mapping remembered per client</div>
            <div><b>AR</b> — ageing by payer</div>
            <div><b>Cash</b> — operating and reserve balances</div>
            <div><b>Balance / budget</b> — optional</div>
          </div>
          <p className="caption" style={{ marginTop: 14 }}>
            Entity names must match the client&apos;s configured entities. Column mappings are remembered after the first successful close.
          </p>
        </div>
      </main>
    </div>
  );
}
