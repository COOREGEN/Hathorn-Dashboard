import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import UploadForm from "@/components/upload-form";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function Upload() {
  const s = await getSession();
  if (!s || !["ADMIN", "BOOKKEEPER"].includes(s.role)) redirect("/login");

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
          Four files, marked Close Final. The gate validates on the spot — if a number doesn&apos;t tie,
          you&apos;ll see exactly which check broke, and nothing moves forward until it does.
        </p>
        <UploadForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          entities={entities.map((e) => ({ id: e.id, clientId: e.client_id, name: e.name }))}
        />
        <div style={{ marginTop: 34, borderTop: "1px solid var(--hairline)", paddingTop: 20 }}>
          <div className="eyebrow">File formats</div>
          <div className="space-y-2" style={{ marginTop: 12, fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: "var(--ink-soft)" }}>
            <div><b style={{ fontFamily: "var(--utility)", fontWeight: 600 }}>pnl.csv</b> — entity,category,label,amount &nbsp;<span className="caption">(category: REVENUE | DIRECT_COST | OPEX · amounts in $K)</span></div>
            <div><b style={{ fontFamily: "var(--utility)", fontWeight: 600 }}>payroll.csv</b> — entity,wages,ot_premium,taxes,workers_comp,processing,hours</div>
            <div><b style={{ fontFamily: "var(--utility)", fontWeight: 600 }}>ar.csv</b> — payer,b0_30,b31_60,b61_90,b90p</div>
            <div><b style={{ fontFamily: "var(--utility)", fontWeight: 600 }}>cash.csv</b> — operating,reserve,debt_service</div>
            <div><b style={{ fontFamily: "var(--utility)", fontWeight: 600 }}>balance.csv</b> — section,label,amount <span className="caption">(optional · CURRENT_ASSET | FIXED_ASSET | CURRENT_LIABILITY | LONG_TERM_LIABILITY | EQUITY)</span></div>
            <div><b style={{ fontFamily: "var(--utility)", fontWeight: 600 }}>budget.csv</b> — category,amount <span className="caption">(optional · REVENUE | DIRECT_COST | OPEX | NET_INCOME)</span></div>
          </div>
          <p className="caption" style={{ marginTop: 14 }}>
            Sample files ship in the project&apos;s <span style={{ fontFamily: "ui-monospace, monospace" }}>samples/</span> folder.
            Entity names must match the client&apos;s configured entities exactly.
          </p>
        </div>
      </main>
    </div>
  );
}
