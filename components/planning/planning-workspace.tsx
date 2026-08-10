"use client";
/**
 * Staff Planning workspace — assumptions → run → charts → AI draft.
 */
import { useMemo, useState, useTransition } from "react";
import ForecastChart from "./ForecastChart";
import ScenarioChart, { type ScenarioSeries } from "./ScenarioChart";
import VarianceChart from "./VarianceChart";
import CashOutlookChart from "./CashOutlookChart";
import type { Assumptions, ModelRunRecord, ScenarioKey, ActualPoint } from "@/lib/fpa/types";

const SCENARIOS: { key: ScenarioKey; label: string }[] = [
  { key: "BASE", label: "Base" },
  { key: "UPSIDE", label: "Upside" },
  { key: "DOWNSIDE", label: "Downside" },
  { key: "CUSTOM", label: "Custom" },
];

const money = (n: number) => {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
};

export default function PlanningWorkspace({
  clients, initialClientId, baseline, history, defaultAssumptions, recentRuns,
  sourceFreshness,
}: {
  clients: { id: string; name: string }[];
  initialClientId: string;
  baseline: ActualPoint | null;
  history: ActualPoint[];
  defaultAssumptions: Assumptions;
  recentRuns: ModelRunRecord[];
  /** Integration Hub readiness — warn on stale actuals; never blocks modeling. */
  sourceFreshness?: {
    pnlReadiness: string;
    qboLastSyncAt: string | null;
    qboHealth: string;
  };
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [scenario, setScenario] = useState<ScenarioKey>("BASE");
  const [assumptions, setAssumptions] = useState<Assumptions>(defaultAssumptions);
  const [run, setRun] = useState<ModelRunRecord | null>(recentRuns[0] ?? null);
  const [compare, setCompare] = useState<Partial<Record<ScenarioKey, ModelRunRecord>>>({});
  const [error, setError] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [metric, setMetric] = useState<"revenue" | "grossProfit" | "netIncome">("revenue");

  function setNum<K extends keyof Assumptions>(key: K, raw: string) {
    const n = Number(raw);
    setAssumptions((a) => ({ ...a, [key]: Number.isFinite(n) ? n : a[key] }));
  }

  async function runForecast() {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, scenario, assumptions,
          sourcePeriodId: baseline?.periodId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Forecast failed.");
        return;
      }
      setRun(data.run);
      setCompare((c) => ({ ...c, [scenario]: data.run }));
    });
  }

  async function generateAnalysis() {
    if (!run) return;
    setAnalysisBusy(true); setError("");
    const res = await fetch("/api/planning/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: run.id }),
    });
    const data = await res.json().catch(() => ({}));
    setAnalysisBusy(false);
    if (!res.ok) { setError(data.error || "Analysis failed."); return; }
    setRun(data.run);
  }

  const scenarioSeries: ScenarioSeries[] = useMemo(() => {
    const colors: Record<string, string> = {
      BASE: "#2C504D", UPSIDE: "#1F6F8B", DOWNSIDE: "#9E401D", CUSTOM: "#B8860B",
    };
    return (["BASE", "UPSIDE", "DOWNSIDE"] as ScenarioKey[])
      .map((k) => {
        const r = compare[k];
        if (!r?.results.forecast.length) return null;
        return {
          key: k, label: k.charAt(0) + k.slice(1).toLowerCase(), color: colors[k],
          points: r.results.forecast.map((p) => ({ label: p.label, value: p[metric] })),
        };
      })
      .filter(Boolean) as ScenarioSeries[];
  }, [compare, metric]);

  const varianceRows = useMemo(() => {
    if (!run?.results.forecast.length || !baseline) return [];
    const last = run.results.forecast[run.results.forecast.length - 1];
    const rows = [
      { key: "revenue" as const, label: "Revenue" },
      { key: "grossProfit" as const, label: "Gross profit" },
      { key: "opex" as const, label: "Opex" },
      { key: "netIncome" as const, label: "Net income" },
    ];
    return rows.map((r) => {
      const dollar = Math.round((last[r.key] - baseline[r.key]) * 10) / 10;
      const pct = baseline[r.key] !== 0
        ? Math.round(((last[r.key] - baseline[r.key]) / Math.abs(baseline[r.key])) * 1000) / 10
        : null;
      return { label: r.label, dollar, pct };
    });
  }, [run, baseline]);

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Planning</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Forecasts and scenarios based on approved financial actuals.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="plan-client">Client</label>
          <select id="plan-client" className="input" style={{ marginTop: 4, minWidth: 240 }}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              window.location.href = `/planning?client=${e.target.value}`;
            }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {!baseline ? (
        <p className="caption">No actual periods available for this client yet. Upload and publish a close first.</p>
      ) : (
        <>
          {/* Baseline actuals */}
          <section style={{ marginBottom: 36 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Historical baseline · ACTUAL</div>
            {sourceFreshness && (
              <p className="caption" style={{ marginBottom: 10 }}>
                Source readiness — P&amp;L: {sourceFreshness.pnlReadiness.replace(/_/g, " ")}
                {sourceFreshness.qboLastSyncAt
                  ? ` · QBO last synced ${sourceFreshness.qboLastSyncAt}`
                  : " · QBO not synced"}
                {(sourceFreshness.pnlReadiness === "STALE" || sourceFreshness.qboHealth === "STALE") && (
                  <span> — source data may be stale; forecasts still run.</span>
                )}
              </p>
            )}
            <p className="caption" style={{ marginBottom: 16 }}>
              Actuals through {baseline.label}
              {run?.sourceReleaseId ? " · tied to an active release snapshot" : " · working papers (no active release)"}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-4">
              {[
                ["Revenue", baseline.revenue],
                ["Gross profit", baseline.grossProfit],
                ["Operating expenses", baseline.opex],
                ["Net income", baseline.netIncome],
                ["Cash", baseline.cashTotal],
              ].map(([label, val]) => (
                <div key={String(label)}>
                  <div className="eyebrow">{label}</div>
                  <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 26, marginTop: 4 }}>
                    {val == null ? "—" : money(Number(val))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Assumptions + scenarios */}
          <section style={{ marginBottom: 36, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Assumptions · annual rates</div>
            <div className="grid sm:grid-cols-3 gap-4" style={{ maxWidth: 720, marginBottom: 22 }}>
              <div>
                <label className="field-label" htmlFor="g-rev">Annual revenue growth %</label>
                <input id="g-rev" className="input tnum" style={{ marginTop: 5 }} type="number" step="0.1"
                  value={assumptions.annualRevenueGrowthPct}
                  onChange={(e) => setNum("annualRevenueGrowthPct", e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="g-m">Gross margin %</label>
                <input id="g-m" className="input tnum" style={{ marginTop: 5 }} type="number" step="0.1"
                  value={assumptions.grossMarginPct}
                  onChange={(e) => setNum("grossMarginPct", e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="g-ox">Annual opex growth %</label>
                <input id="g-ox" className="input tnum" style={{ marginTop: 5 }} type="number" step="0.1"
                  value={assumptions.annualOpexGrowthPct}
                  onChange={(e) => setNum("annualOpexGrowthPct", e.target.value)} />
              </div>
            </div>
            <p className="caption" style={{ marginBottom: 18, maxWidth: 640 }}>
              Growth rates are annual. Monthly compounding uses (1 + annual/100)^(1/12) − 1.
              Direct cost is revenue − gross profit — payroll is not subtracted again.
            </p>

            <div className="flex gap-2 flex-wrap" style={{ marginBottom: 18 }}>
              {SCENARIOS.map((s) => (
                <button key={s.key} type="button"
                  className={`chip${scenario === s.key ? " on" : ""}`}
                  onClick={() => setScenario(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>

            <button className="btn" disabled={pending} onClick={runForecast}>
              {pending ? "Running…" : "Run forecast"}
            </button>
            {error && (
              <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginTop: 12 }}>{error}</p>
            )}
          </section>

          {run && (
            <>
              <section style={{ marginBottom: 36, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
                <div className="flex items-baseline justify-between flex-wrap gap-3" style={{ marginBottom: 14 }}>
                  <div>
                    <div className="eyebrow">Results · {run.scenario} · {run.engine}</div>
                    <p className="caption" style={{ marginTop: 6 }}>
                      Engine {run.engineVersion} · {run.status}
                      {run.checks.some((c) => !c.pass) ? " · validation issues" : " · checks passed"}
                    </p>
                  </div>
                  <select className="input" style={{ width: "auto" }} value={metric}
                    onChange={(e) => setMetric(e.target.value as any)}>
                    <option value="revenue">Revenue</option>
                    <option value="grossProfit">Gross profit</option>
                    <option value="netIncome">Net income</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4" style={{ marginBottom: 24 }}>
                  {[
                    ["12-mo revenue", run.results.totals.forecastRevenue],
                    ["12-mo gross profit", run.results.totals.forecastGrossProfit],
                    ["12-mo opex", run.results.totals.forecastOpex],
                    ["12-mo net income", run.results.totals.forecastNetIncome],
                  ].map(([label, val]) => (
                    <div key={String(label)}>
                      <div className="eyebrow">{label}</div>
                      <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 24, marginTop: 4 }}>
                        {money(Number(val))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="eyebrow" style={{ marginBottom: 8 }}>Actual → Forecast</div>
                <ForecastChart history={run.results.history} forecast={run.results.forecast} metric={metric} />

                <div className="eyebrow" style={{ margin: "28px 0 8px" }}>Scenario comparison</div>
                <p className="caption" style={{ marginBottom: 8 }}>
                  Run Base, Upside, and Downside to populate this chart.
                </p>
                <ScenarioChart series={scenarioSeries} />

                <div className="eyebrow" style={{ margin: "28px 0 8px" }}>Month-12 vs baseline (ACTUAL)</div>
                <VarianceChart rows={varianceRows} />

                <CashOutlookChart baselineCash={run.results.totals.baselineCash} />
              </section>

              <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Advisor analysis</div>
                <button className="btn" disabled={analysisBusy || run.status !== "OK"} onClick={generateAnalysis}>
                  {analysisBusy ? "Generating…" : "Generate analysis"}
                </button>
                {run.analysis && (
                  <pre style={{
                    marginTop: 20, whiteSpace: "pre-wrap", fontFamily: "var(--editorial)",
                    fontSize: 15, lineHeight: 1.55, color: "var(--ink)", maxWidth: 720,
                  }}>{run.analysis}</pre>
                )}
                <p className="caption" style={{ marginTop: 14 }}>
                  AI drafts. Advisor reviews. This narrative is never published to the client portal.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
