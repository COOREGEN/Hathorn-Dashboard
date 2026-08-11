import { redirect } from "next/navigation";
import ClientPortalShell from "@/components/client-portal/shell";
import { resolvePortalClient } from "@/lib/client-portal/resolve";
import { listSharedScenarios } from "@/lib/client-portal";
import { formatMoneyK } from "@/lib/intelligence/calc";

export const dynamic = "force-dynamic";

export default async function PortalPlanning({
  searchParams,
}: { searchParams: { client?: string; preview?: string } }) {
  const ctx = await resolvePortalClient(searchParams);
  if (!ctx.modules.showPlanning) redirect("/portal");

  const scenarios = listSharedScenarios(ctx.clientId);

  return (
    <ClientPortalShell
      brand={ctx.brand}
      clientName={ctx.client.name}
      periodLabel={ctx.latest?.label}
      nav={ctx.nav}
      preview={ctx.preview}
      staffChrome={ctx.staffChrome}
    >
      <h2 className="eyebrow">Planning</h2>
      <p className="prepared-by" style={{ marginTop: 8 }}>
        Shared forecasts only. Forecasts are based on assumptions and are not guarantees of future results.
      </p>

      {!scenarios.length && (
        <p className="prose" style={{ marginTop: 24 }}>
          Planning has not been shared for this engagement.
        </p>
      )}

      <div style={{ display: "grid", gap: 28, marginTop: 24 }}>
        {scenarios.map((s) => {
          const snap = s.snapshot;
          if (!snap) return null;
          const a = snap.assumptions as any;
          return (
            <article key={s.id} style={{ borderTop: "1px solid var(--ink)", paddingTop: 16 }}>
              <p className="eyebrow">Forecast · {snap.scenario}</p>
              <h3 className="display-m" style={{ fontSize: 28, margin: "6px 0 16px" }}>
                {snap.scenario.replace(/_/g, " ")}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14 }}>
                <Metric label="Revenue" value={formatMoneyK(snap.totals.forecastRevenue)} />
                <Metric label="Gross profit" value={formatMoneyK(snap.totals.forecastGrossProfit)} />
                <Metric label="Net income" value={formatMoneyK(snap.totals.forecastNetIncome)} />
              </div>
              <h4 className="eyebrow" style={{ marginTop: 22 }}>Key assumptions</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
                {a?.revenueGrowthPct != null && (
                  <li className="prepared-by">Revenue growth {a.revenueGrowthPct}%</li>
                )}
                {a?.grossMarginPct != null && (
                  <li className="prepared-by">Gross margin {a.grossMarginPct}%</li>
                )}
                {a?.payrollGrowthPct != null && (
                  <li className="prepared-by">Payroll growth {a.payrollGrowthPct}%</li>
                )}
                {a?.opexGrowthPct != null && (
                  <li className="prepared-by">Overhead growth {a.opexGrowthPct}%</li>
                )}
              </ul>
              <p className="prepared-by" style={{ marginTop: 16 }}>{snap.disclaimer}</p>
            </article>
          );
        })}
      </div>
    </ClientPortalShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderBottom: "1px solid rgba(44,80,77,0.12)", paddingBottom: 8 }}>
      <div className="eyebrow">{label}</div>
      <div className="display-m" style={{ fontSize: 24, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
