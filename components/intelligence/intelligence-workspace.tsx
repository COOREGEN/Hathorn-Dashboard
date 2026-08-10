"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import EChart from "@/components/planning/EChart";

type Client = { id: string; name: string };

export default function IntelligenceWorkspace({
  clients,
  initialClientId,
  initialPeriodId,
}: {
  clients: Client[];
  initialClientId: string;
  initialPeriodId?: string | null;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [periodId, setPeriodId] = useState(initialPeriodId || "");
  const [source, setSource] = useState<"working" | "release">("working");
  const [data, setData] = useState<any>(null);
  const [persistedSignals, setPersistedSignals] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load(cid = clientId, pid = periodId, src = source) {
    setError("");
    startTransition(async () => {
      const q = new URLSearchParams({ clientId: cid, source: src === "release" ? "release" : "working" });
      if (pid) q.set("periodId", pid);
      const res = await fetch(`/api/intelligence?${q}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to load intelligence.");
        setData(null);
        setPersistedSignals([]);
        return;
      }
      setData(json);
      const resolvedPeriod = json.overview?.periodId || pid;
      if (resolvedPeriod) setPeriodId(resolvedPeriod);
      if (resolvedPeriod) {
        const sq = new URLSearchParams({ clientId: cid, view: "signals", periodId: resolvedPeriod });
        const sres = await fetch(`/api/intelligence?${sq}`);
        const sjson = await sres.json();
        setPersistedSignals(sjson.ok ? (sjson.signals || []) : []);
      }
    });
  }

  useEffect(() => {
    void load(clientId, periodId, source);
    // periodId is resolved inside load when empty; depend on client/source to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, source]);

  function switchClient(id: string) {
    setClientId(id);
    setPeriodId("");
    setSummary(null);
    router.replace(`/intelligence?client=${id}`);
  }

  function summarize() {
    startTransition(async () => {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "summarize",
          clientId,
          periodId,
          source: source === "release" ? "release" : "working",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Summary failed.");
        return;
      }
      setSummary(json.summary.text + (json.summary.warning ? `\n\n(${json.summary.warning})` : ""));
    });
  }

  async function setSignal(signalId: string, status: string) {
    await fetch("/api/intelligence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "setSignalStatus", signalId, status }),
    });
    load();
  }

  const o = data?.overview;
  const revSeries = o?.kpis?.find((k: any) => k.key === "revenue")?.trend?.series || [];

  const chartOption = revSeries.length
    ? {
        grid: { left: 48, right: 16, top: 24, bottom: 32 },
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: revSeries.map((p: any) => p.label),
          axisLabel: { color: "#6E675B", fontSize: 10 },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "#6E675B", fontSize: 10, fontVariantNumeric: "tabular-nums" },
          splitLine: { lineStyle: { color: "#E8E5E0" } },
        },
        series: [{
          type: "line",
          data: revSeries.map((p: any) => p.value),
          showSymbol: true,
          lineStyle: { color: "#2C504D", width: 2 },
          itemStyle: { color: "#2C504D" },
        }],
      }
    : null;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 24 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Client</span>
          <select value={clientId} onChange={(e) => switchClient(e.target.value)} className="ask-input" style={{ minWidth: 220 }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Period</span>
          <select
            value={periodId}
            onChange={(e) => { setPeriodId(e.target.value); load(clientId, e.target.value, source); }}
            className="ask-input"
            style={{ minWidth: 160 }}
          >
            {(data?.periods || []).map((p: any) => (
              <option key={p.periodId} value={p.periodId}>{p.label} ({p.status})</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as any)}
            className="ask-input"
          >
            <option value="working">Working ledger</option>
            <option value="release">Published release</option>
          </select>
        </label>
        <button type="button" className="btn" disabled={pending || !periodId} onClick={summarize}>
          {pending ? "Working…" : "Advisor draft"}
        </button>
        <a className="chip" href={`/ask?client=${clientId}${periodId ? `&period=${periodId}` : ""}`}>
          Ask Hathorn
        </a>
      </div>

      {error && <p style={{ color: "#8a2b2b" }}>{error}</p>}
      {pending && !o && <p className="prepared-by">Calculating…</p>}

      {o && (
        <>
          <header style={{ marginBottom: 28 }}>
            <p className="eyebrow">Financial Intelligence</p>
            <h1 className="display-m" style={{ margin: "4px 0 8px" }}>{o.periodLabel}</h1>
            <p className="prepared-by">
              Source: {o.sourceKind.replace(/_/g, " ")} · Engine {o.engineVersion}
            </p>
          </header>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 16, marginBottom: 28 }}>
            {o.kpis.map((k: any) => (
              <div key={k.key} style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 8 }}>
                <div className="eyebrow">{k.label}</div>
                <div className="display-m" style={{ fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{k.formatted}</div>
                <div className="prepared-by">
                  {k.trend?.unit === "percent" && k.trend.pointsChange != null
                    ? `${k.trend.pointsChange >= 0 ? "+" : ""}${k.trend.pointsChange} pts MoM`
                    : k.trend?.percentageChange != null
                      ? `${k.trend.percentageChange >= 0 ? "+" : ""}${k.trend.percentageChange}% MoM`
                      : "—"}
                </div>
              </div>
            ))}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">Revenue trend</h2>
            <EChart option={chartOption} height={260} empty={!revSeries.length} emptyLabel="Need more history" />
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">Key signals</h2>
            {!o.signals.length && <p className="prose">No material signals under current thresholds.</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 12 }}>
              {o.signals.map((s: any, i: number) => (
                <li key={`${s.metricKey}-${s.method}-${i}`} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 10 }}>
                  <strong style={{ fontFamily: "var(--editorial)" }}>{s.title}</strong>
                  <pre className="ask-msg-body" style={{ fontSize: 14, marginTop: 6 }}>{s.detail}</pre>
                  <span className="prepared-by">{s.severity} · {s.method}</span>
                </li>
              ))}
            </ul>
            {!!persistedSignals.length && (
              <div style={{ marginTop: 16 }}>
                <p className="prepared-by">Durable signal review (not accounting exceptions)</p>
                <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 8 }}>
                  {persistedSignals.filter((s) => s.status !== "SUPERSEDED").map((s: any) => (
                    <li key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
                      <span style={{ flex: 1, fontFamily: "var(--utility)", fontSize: 13 }}>{s.title} · {s.status}</span>
                      {s.status === "NEW" && (
                        <>
                          <button type="button" className="chip" onClick={() => setSignal(s.id, "REVIEWED")}>Reviewed</button>
                          <button type="button" className="chip" onClick={() => setSignal(s.id, "MONITORING")}>Monitor</button>
                          <button type="button" className="chip" onClick={() => setSignal(s.id, "DISMISSED")}>Dismiss</button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">Entity profitability (direct)</h2>
            <p className="prepared-by" style={{ marginBottom: 8 }}>
              {o.profitability.sourceQuality.replace(/_/g, " ")}
              {o.profitability.allocation?.method
                ? ` · OPEX allocation: ${o.profitability.allocation.method} v${o.profitability.allocation.version}`
                : " · Direct margin only (no active allocation rule)"}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--utility)", fontSize: 13 }}>
              <thead>
                <tr className="eyebrow">
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Entity</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                  <th style={{ textAlign: "right" }}>Direct GP</th>
                  <th style={{ textAlign: "right" }}>Margin</th>
                  <th style={{ textAlign: "right" }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {o.profitability.rows.map((r: any) => (
                  <tr key={r.key} style={{ borderTop: "1px solid var(--hairline)" }}>
                    <td style={{ padding: "8px 0" }}>{r.name}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${r.revenue.toFixed(1)}K</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${r.grossProfit.toFixed(1)}K</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.grossMarginPct ?? "—"}%</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.revenueSharePct ?? "—"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="prepared-by" style={{ marginTop: 10 }}>
              Customer / project / job / location profitability: UNAVAILABLE — those dimensions are not in the ledger.
            </p>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">Drivers</h2>
            {o.drivers.map((d: any) => (
              <div key={d.metricKey} style={{ marginBottom: 16 }}>
                <p className="prose" style={{ margin: "8px 0" }}>
                  {d.label} Δ {d.totalDelta >= 0 ? "+" : ""}{d.totalDelta}K
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {d.slices.map((s: any) => (
                    <li key={s.key} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", padding: "4px 0", fontFamily: "var(--utility)", fontSize: 13 }}>
                      <span>{s.label}</span>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{s.delta >= 0 ? "+" : ""}{s.delta}K</strong>
                    </li>
                  ))}
                  {d.other !== 0 && (
                    <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: "var(--utility)", fontSize: 13 }}>
                      <span>Other</span>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{d.other >= 0 ? "+" : ""}{d.other}K</strong>
                    </li>
                  )}
                </ul>
                {d.notes?.map((n: string) => <p key={n} className="prepared-by">{n}</p>)}
              </div>
            ))}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">Cash</h2>
            <p className="prose">
              Ending cash ${o.cash.currentCash}K
              {o.cash.cashChange != null ? ` (${o.cash.cashChange >= 0 ? "+" : ""}${o.cash.cashChange}K)` : ""}.
            </p>
            <p className="prepared-by">{o.cash.runwayReason}</p>
            {o.cash.runwayApplicable && (
              <p className="prose">Runway ≈ {o.cash.runwayMonths} months (burn basis {o.cash.burnBasis}).</p>
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">Forecast intelligence</h2>
            {!o.forecast.available && <p className="prose">{o.forecast.reason}</p>}
            {o.forecast.management && (
              <p className="prose">
                Management {o.forecast.management.scenario}: forecast revenue ${o.forecast.management.forecastRevenue}K
                ({o.forecast.management.engine}).
              </p>
            )}
            {o.forecast.trendProjection && (
              <p className="prose">
                Trend projection (next month revenue): ${o.forecast.trendProjection.projectedNextRevenue}K.
              </p>
            )}
            {o.forecast.comparison && (
              <p className="prepared-by">{o.forecast.comparison.note}</p>
            )}
            {o.forecast.accuracy?.available && (
              <p className="prose">Forecast error vs actual: {o.forecast.accuracy.dollarError}K ({o.forecast.accuracy.percentageError}%).</p>
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">AR payer concentration</h2>
            <p className="prepared-by">{data.arPayers?.reason || "Receivable shares — not customer profitability."}</p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {(data.arPayers?.rows || []).slice(0, 8).map((r: any) => (
                <li key={r.key} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", padding: "4px 0", fontFamily: "var(--utility)", fontSize: 13 }}>
                  <span>{r.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>${r.revenue.toFixed(1)}K · {r.revenueSharePct}%</span>
                </li>
              ))}
            </ul>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="eyebrow">Data readiness</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {o.readiness.notes.map((n: string) => (
                <li key={n} className="prepared-by" style={{ marginBottom: 4 }}>{n}</li>
              ))}
            </ul>
          </section>

          {summary && (
            <section style={{ marginBottom: 48, borderTop: "1px solid var(--ink)", paddingTop: 16 }}>
              <h2 className="eyebrow">Advisor draft</h2>
              <pre className="ask-msg-body">{summary}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
