/**
 * Offline FP&A unit checks — no server required.
 * Run: npm run fpa:test
 */
import assert from "node:assert/strict";
import { runForecast, forgeStatus } from "../lib/fpa/engine";
import { runNativeForecast, monthlyFromAnnual } from "../lib/fpa/native-engine";
import {
  DEFAULT_ASSUMPTIONS, applyScenario, type ActualPoint, type Assumptions,
} from "../lib/fpa/types";
import { planningSignals } from "../lib/ai/variance-analysis";
import { explainScenarioRun } from "../lib/ai/scenario-explanation";
import type { ModelRunRecord } from "../lib/fpa/types";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}

async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}

const baseline: ActualPoint = {
  year: 2026, month: 4, label: "Apr 2026", periodId: "p1",
  revenue: 110, directCost: 66, grossProfit: 44, opex: 11, netIncome: 33,
  cashTotal: 85, kind: "ACTUAL",
};

const history: ActualPoint[] = [
  {
    year: 2026, month: 3, label: "Mar 2026", periodId: "p0",
    revenue: 100, directCost: 60, grossProfit: 40, opex: 10, netIncome: 30,
    cashTotal: 80, kind: "ACTUAL",
  },
  baseline,
];

const assumptions: Assumptions = { ...DEFAULT_ASSUMPTIONS };

console.log("\n── FP&A unit ──");

check("Forge default status is disabled", () => {
  delete process.env.FORGE_ENABLED;
  const st = forgeStatus();
  assert.equal(st.enabled, false);
  assert.equal(st.available, false);
});

check("native forecast is deterministic", () => {
  const a = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
  const b = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
  assert.equal(JSON.stringify(a.results.forecast), JSON.stringify(b.results.forecast));
  assert.equal(a.results.forecast.length, 12);
  assert.ok(a.results.totals.forecastRevenue > baseline.revenue);
});

check("outputs are finite; cash is not projected", () => {
  const r = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
  for (const m of r.results.forecast) {
    for (const v of [m.revenue, m.directCost, m.grossProfit, m.opex, m.netIncome]) {
      assert.ok(Number.isFinite(v), `non-finite ${v}`);
    }
  }
  assert.equal(r.results.totals.baselineCash, 85);
  assert.ok(r.checks.every((c) => c.pass));
});

check("does not double-count payroll into the P&L identity", () => {
  const r = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
  const m0 = r.results.forecast[0]!;
  const expectedDirect = Math.round((m0.revenue - m0.grossProfit) * 10) / 10;
  assert.equal(m0.directCost, expectedDirect);
  const expectedNet = Math.round((m0.grossProfit - m0.opex) * 10) / 10;
  assert.equal(m0.netIncome, expectedNet);
});

check("annual growth compounds monthly (not applied as monthly %)", () => {
  const flat = runNativeForecast({
    history, baseline,
    assumptions: { ...assumptions, annualRevenueGrowthPct: 0, annualOpexGrowthPct: 0 },
    scenario: "BASE",
  });
  const grew = runNativeForecast({
    history, baseline,
    assumptions: { ...assumptions, annualRevenueGrowthPct: 12 },
    scenario: "BASE",
  });
  assert.ok(grew.results.forecast[11]!.revenue > flat.results.forecast[11]!.revenue);
  const first = grew.results.forecast[0]!.revenue;
  assert.ok(first < 110 * 1.12);
  assert.ok(first > 110);
  const monthly = monthlyFromAnnual(12);
  assert.ok(Math.abs(first - Math.round(110 * (1 + monthly) * 10) / 10) < 0.15);
});

check("scenario adjustments move revenue", () => {
  const base = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
  const upAssumptions = applyScenario(assumptions, "UPSIDE");
  const up = runNativeForecast({
    history, baseline, assumptions: upAssumptions, scenario: "CUSTOM",
  });
  assert.ok(up.results.totals.forecastRevenue > base.results.totals.forecastRevenue);
});

check("rejects invalid assumptions via failed checks", () => {
  const bad = runNativeForecast({
    history, baseline,
    assumptions: { ...assumptions, annualRevenueGrowthPct: 999 },
    scenario: "BASE",
  });
  assert.ok(bad.checks.some((c) => !c.pass));
  assert.equal(bad.results.forecast.length, 0);

  const badMargin = runNativeForecast({
    history, baseline,
    assumptions: { ...assumptions, grossMarginPct: -5 },
    scenario: "BASE",
  });
  assert.ok(badMargin.checks.some((c) => !c.pass));
});

check("forge status reports blocked when enabled without binary", () => {
  process.env.FORGE_ENABLED = "1";
  try {
    const st = forgeStatus();
    assert.equal(st.enabled, true);
    assert.equal(st.available, false);
    assert.match(st.reason, /BLOCKED|not found/i);
  } finally {
    delete process.env.FORGE_ENABLED;
  }
});

check("reproducibility: same inputs → same JSON results", () => {
  const a = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
  const b = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
  assert.equal(JSON.stringify(a.results.forecast), JSON.stringify(b.results.forecast));
  assert.equal(JSON.stringify(a.results.totals), JSON.stringify(b.results.totals));
});

async function main() {
  await checkAsync("preferForge never silently relabels native as Forge", async () => {
    process.env.FORGE_ENABLED = "1";
    try {
      await assert.rejects(
        () => runForecast({
          history, baseline, assumptions, scenario: "BASE", preferForge: true,
        }),
        /Forge|BLOCKED|not available/i,
      );
    } finally {
      delete process.env.FORGE_ENABLED;
    }
  });

  await checkAsync("with FORGE_ENABLED=0 planning still works via native", async () => {
    process.env.FORGE_ENABLED = "0";
    try {
      const r = await runForecast({
        history, baseline, assumptions, scenario: "BASE", preferForge: false,
      });
      assert.equal(r.engine, "native");
      assert.equal(r.results.forecast.length, 12);
    } finally {
      delete process.env.FORGE_ENABLED;
    }
  });

  await checkAsync("AI scenario draft cites supplied numbers and marks assumptions", async () => {
    const engine = runNativeForecast({ history, baseline, assumptions, scenario: "BASE" });
    const run: ModelRunRecord = {
      id: "t1", clientId: "c1", sourcePeriodId: baseline.periodId, sourceReleaseId: null,
      scenario: "BASE", engine: "native", engineVersion: engine.engineVersion,
      assumptions, results: engine.results, checks: engine.checks, status: "OK",
      analysis: null, createdBy: "u1", createdAt: new Date().toISOString(),
    };
    const signals = planningSignals(run.results, run.assumptions);
    assert.ok(signals.length > 0);
    const draft = await explainScenarioRun(run);
    assert.ok(draft.text.includes("ACTUAL"));
    assert.match(draft.text, /assumption/i);
    assert.match(draft.text, /WHAT CHANGED|KEY DRIVER/);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
