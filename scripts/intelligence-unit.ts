/**
 * Phase 10 — Financial Intelligence unit tests.
 * Run: npm run intelligence:test
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { closeDb, db, uid } from "../lib/db";
import { createFirm } from "../lib/tenancy";
import {
  allocateByWeights,
  mean,
  pctChange,
  pointsDelta,
  stdev,
  zScore,
  sum,
  r1,
} from "../lib/intelligence/calc";
import {
  allocateCostPool,
  createAllocationRule,
  listAllocationRules,
} from "../lib/intelligence/allocation";
import {
  computeTrend,
  CORE_METRICS,
  linearRevenueProjection,
} from "../lib/intelligence/trends";
import { detectAnomalies, DEFAULT_POLICIES } from "../lib/intelligence/anomalies";
import { cashIntelligence } from "../lib/intelligence/cash";
import { forecastIntelligence } from "../lib/intelligence/forecast";
import { dimensionAvailability, entityProfitability } from "../lib/intelligence/profitability";
import { revenueDriverBridge } from "../lib/intelligence/drivers";
import {
  syncSignalsForPeriod,
  listSignals,
  setSignalStatus,
  ensureDefaultPolicies,
} from "../lib/intelligence/signals";
import { FI_ENGINE_VERSION } from "../lib/intelligence/types";
import type { PeriodMetrics, EntityMetrics } from "../lib/metrics";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(e);
  }
}

function entity(
  id: string,
  name: string,
  revenue: number,
  directCost: number,
  hours = 100,
): EntityMetrics {
  const gp = r1(revenue - directCost);
  return {
    id, name, status: "ACTIVE",
    revenue, directCost, grossProfit: gp,
    grossMarginPct: revenue ? r1((gp / revenue) * 100) : 0,
    opex: 0, netIncome: gp, netMarginPct: revenue ? r1((gp / revenue) * 100) : 0,
    laborPct: revenue ? r1((directCost / revenue) * 100) : 0,
    payroll: {
      wages: directCost * 0.8, otPremium: 0, taxes: directCost * 0.1,
      workersComp: 0, processing: 0, hoursPaid: hours,
    },
  };
}

function period(opts: {
  id: string; year: number; month: number;
  entities: EntityMetrics[];
  opex?: number; cash?: number; payroll?: number; arTotal?: number;
}): PeriodMetrics {
  const revenue = r1(opts.entities.reduce((s, e) => s + e.revenue, 0));
  const directCost = r1(opts.entities.reduce((s, e) => s + e.directCost, 0));
  const gp = r1(revenue - directCost);
  const opex = opts.opex ?? 0;
  const ni = r1(gp - opex);
  const cash = opts.cash ?? 100;
  const payroll = opts.payroll ?? directCost;
  return {
    periodId: opts.id,
    year: opts.year,
    month: opts.month,
    label: `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][opts.month]} ${opts.year}`,
    status: "PUBLISHED",
    entities: opts.entities,
    revenue, directCost, grossProfit: gp,
    grossMarginPct: revenue ? r1((gp / revenue) * 100) : 0,
    opex, netIncome: ni,
    netMarginPct: revenue ? r1((ni / revenue) * 100) : 0,
    laborPct: revenue ? r1((directCost / revenue) * 100) : 0,
    totalPayroll: payroll, otPremium: 0,
    cash: { operating: cash, reserve: 0, total: cash },
    ar: opts.arTotal
      ? [{ payer: "Payer A", b0_30: opts.arTotal, b31_60: 0, b61_90: 0, b90p: 0, total: opts.arTotal }]
      : [],
    arTotal: opts.arTotal ?? 0,
    notes: [],
  };
}

function withTempDb(fn: () => void) {
  const prev = process.env.DATA_DIR;
  const tmp = path.join(process.cwd(), "data", `_fi_unit_${process.pid}_${Date.now()}`);
  process.env.DATA_DIR = tmp;
  mkdirSync(tmp, { recursive: true });
  closeDb();
  try {
    fn();
  } finally {
    closeDb();
    process.env.DATA_DIR = prev;
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  }
}

console.log("\n=== Financial Intelligence unit tests ===\n");

test("allocation REVENUE_SHARE totals back to pool", () => {
  const r = allocateByWeights(100, [
    { key: "a", weight: 40 },
    { key: "b", weight: 35 },
    { key: "c", weight: 25 },
  ]);
  assert.ok(Math.abs(sum(r.map((x) => x.amount)) - 100) <= 0.1);
});

test("allocation zero-driver fails closed via allocateCostPool", () => {
  const r = allocateCostPool({
    pool: 50,
    method: "REVENUE_SHARE",
    entities: [
      { id: "a", revenue: 0, hoursPaid: 0 },
      { id: "b", revenue: 0, hoursPaid: 0 },
    ],
  });
  assert.equal(r.ok, false);
});

test("allocation HOURS totals back", () => {
  const r = allocateCostPool({
    pool: 90,
    method: "HOURS",
    entities: [
      { id: "a", revenue: 10, hoursPaid: 30 },
      { id: "b", revenue: 10, hoursPaid: 60 },
    ],
  });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(sum(r.allocations.map((a) => a.amount)) - 90) <= 0.1);
});

test("allocation rounding residual absorbed", () => {
  const r = allocateByWeights(100, [
    { key: "a", weight: 1 },
    { key: "b", weight: 1 },
    { key: "c", weight: 1 },
  ]);
  assert.ok(Math.abs(sum(r.map((x) => x.amount)) - 100) <= 0.1);
});

test("pctChange zero prior is null", () => {
  assert.equal(pctChange(10, 0), null);
});

test("pointsDelta percentage points", () => {
  assert.equal(pointsDelta(80, 78), 2);
});

test("z-score insufficient history", () => {
  assert.equal(zScore(10, [1, 2]), null);
});

test("z-score with history", () => {
  const z = zScore(20, [8, 10, 9, 11, 10, 12]);
  assert.ok(z !== null && z! > 0);
});

test("mean and stdev", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(stdev([2, 4, 6])! > 0);
});

test("MoM trend", () => {
  const e = entity("e1", "A", 50, 30);
  const h = [
    period({ id: "p1", year: 2026, month: 3, entities: [e], cash: 100 }),
    period({
      id: "p2", year: 2026, month: 4,
      entities: [entity("e1", "A", 55, 30)], cash: 100,
    }),
  ];
  // ensure revenue differs so filter keeps both
  const t = computeTrend(h, CORE_METRICS.find((m) => m.key === "revenue")!, "MoM", "p2");
  assert.ok(t.difference != null && t.difference > 0);
  assert.equal(t.trendDirection, "up");
});

test("YoY missing prior unavailable", () => {
  const h = [
    period({ id: "p1", year: 2026, month: 4, entities: [entity("e1", "A", 50, 30)] }),
  ];
  const t = computeTrend(h, CORE_METRICS.find((m) => m.key === "revenue")!, "YoY", "p1");
  assert.equal(t.trendDirection, "unavailable");
  assert.equal(t.prior, null);
});

test("TTM incomplete notes", () => {
  const h = Array.from({ length: 4 }, (_, i) =>
    period({
      id: `p${i}`, year: 2026, month: i + 1,
      entities: [entity("e1", "A", 10, 5)],
    }));
  const t = computeTrend(h, CORE_METRICS.find((m) => m.key === "revenue")!, "TTM", "p3");
  assert.ok(t.notes.some((n) => /incomplete/i.test(n) || /months/i.test(n)));
});

test("linear trend projection labeled", () => {
  const h = [100, 105, 110, 115, 120, 125].map((rev, i) =>
    period({
      id: `p${i}`, year: 2026, month: (i % 12) + 1,
      entities: [entity("e1", "A", rev, rev * 0.5)],
    }));
  const p = linearRevenueProjection(h);
  assert.ok(p);
  assert.match(p!.method, /Trend Projection/i);
  assert.ok(p!.projectedNextRevenue > 125);
});

test("anomaly insufficient history does not fire rolling", () => {
  const h = [
    period({ id: "p1", year: 2026, month: 1, entities: [entity("e1", "A", 100, 60)], payroll: 60 }),
    period({ id: "p2", year: 2026, month: 2, entities: [entity("e1", "A", 100, 60)], payroll: 100 }),
  ];
  const hits = detectAnomalies(h, "p2", [
    { metricKey: "totalPayroll", method: "ROLLING_AVERAGE_DEVIATION", threshold: 15, severity: "WARNING", enabled: true },
  ]);
  assert.equal(hits.length, 0);
});

test("anomaly percentage threshold fires", () => {
  const h = [
    period({ id: "p1", year: 2026, month: 3, entities: [entity("e1", "A", 100, 50)] }),
    period({ id: "p2", year: 2026, month: 4, entities: [entity("e1", "A", 70, 50)] }),
  ];
  const hits = detectAnomalies(h, "p2", DEFAULT_POLICIES);
  assert.ok(hits.some((x) => x.metricKey === "revenue" && x.method === "PERCENT_THRESHOLD"));
});

test("cash runway only when burn > 0", () => {
  const burning = [
    period({ id: "p1", year: 2026, month: 1, entities: [entity("e1", "A", 10, 5)], cash: 300 }),
    period({ id: "p2", year: 2026, month: 2, entities: [entity("e1", "A", 10, 5)], cash: 250 }),
    period({ id: "p3", year: 2026, month: 3, entities: [entity("e1", "A", 10, 5)], cash: 200 }),
  ];
  const b = cashIntelligence(burning, "p3", "3m_avg");
  assert.equal(b.runwayApplicable, true);
  assert.ok(b.runwayMonths != null && b.runwayMonths > 0);

  const generating = [
    period({ id: "p1", year: 2026, month: 1, entities: [entity("e1", "A", 10, 5)], cash: 100 }),
    period({ id: "p2", year: 2026, month: 2, entities: [entity("e1", "A", 10, 5)], cash: 150 }),
    period({ id: "p3", year: 2026, month: 3, entities: [entity("e1", "A", 10, 5)], cash: 200 }),
  ];
  const g = cashIntelligence(generating, "p3", "3m_avg");
  assert.equal(g.runwayMonths, null);
  assert.equal(g.runwayApplicable, false);
});

test("cash non-positive runway is zero when burning", () => {
  const h = [
    period({ id: "p1", year: 2026, month: 1, entities: [entity("e1", "A", 10, 5)], cash: 50 }),
    period({ id: "p2", year: 2026, month: 2, entities: [entity("e1", "A", 10, 5)], cash: 0 }),
  ];
  const c = cashIntelligence(h, "p2", "1m");
  assert.equal(c.runwayApplicable, true);
  assert.equal(c.runwayMonths, 0);
});

test("entity profitability direct margin", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "FI Firm", slug: `fi-${uid().slice(0, 6)}` });
    const clientId = uid();
    db().prepare(`
      INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(clientId, firm.id, "Client", `c-${clientId.slice(0, 6)}`, "editorial", "#2C504D", "#DB5928", "C");
    const m = period({
      id: "px", year: 2026, month: 4,
      entities: [
        entity("e1", "Alpha", 100, 40),
        entity("e2", "Beta", 50, 40),
      ],
      opex: 30,
    });
    const report = entityProfitability(m, clientId);
    assert.equal(report.availability, "WORKING");
    assert.equal(report.sourceQuality, "DIRECT_SOURCE_DATA");
    assert.equal(report.rows[0].name, "Alpha");
    assert.ok((report.rows[0].grossMarginPct ?? 0) > (report.rows[1].grossMarginPct ?? 0));
  });
});

test("profitability dimensions honesty", () => {
  const a = dimensionAvailability();
  assert.equal(a.Entity.status, "WORKING");
  assert.equal(a.Customer.status, "UNAVAILABLE");
  assert.equal(a.Project.status, "UNAVAILABLE");
  assert.equal(a.Job.status, "UNAVAILABLE");
  assert.equal(a.Location.status, "UNAVAILABLE");
});

test("revenue driver bridge ranks entities", () => {
  const prior = period({
    id: "p1", year: 2026, month: 3,
    entities: [
      entity("e1", "Alpha", 100, 40),
      entity("e2", "Beta", 80, 40),
    ],
  });
  const cur = period({
    id: "p2", year: 2026, month: 4,
    entities: [
      entity("e1", "Alpha", 140, 40),
      entity("e2", "Beta", 60, 40),
    ],
  });
  const b = revenueDriverBridge(cur, prior);
  assert.equal(b.totalDelta, 20);
  assert.equal(b.slices[0].label, "Alpha");
  assert.ok(b.notes.some((n) => /customer/i.test(n)));
});

test("forecast intelligence without FP&A still may project", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "FI Firm2", slug: `fi2-${uid().slice(0, 6)}` });
    const clientId = uid();
    db().prepare(`
      INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(clientId, firm.id, "Client2", `c2-${clientId.slice(0, 6)}`, "editorial", "#2C504D", "#DB5928", "C");
    const h = [100, 105, 110, 115].map((rev, i) =>
      period({
        id: `f${i}`, year: 2026, month: i + 1,
        entities: [entity("e1", "A", rev, 50)],
      }));
    const fi = forecastIntelligence(clientId, h);
    assert.equal(fi.available, true);
    assert.ok(fi.trendProjection);
    assert.match(fi.trendProjection!.method, /Trend Projection/i);
  });
});

test("allocation rule versioning + signal tenancy", () => {
  withTempDb(() => {
    const firmA = createFirm({ name: "Alpha", slug: `a-${uid().slice(0, 6)}` });
    const firmB = createFirm({ name: "Beta", slug: `b-${uid().slice(0, 6)}` });
    const clientA = uid();
    const clientB = uid();
    for (const [id, firmId, name] of [
      [clientA, firmA.id, "A"],
      [clientB, firmB.id, "B"],
    ] as const) {
      db().prepare(`
        INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(id, firmId, name, `slug-${id.slice(0, 6)}`, "editorial", "#2C504D", "#DB5928", "X");
    }

    const r1rule = createAllocationRule({
      firmId: firmA.id, clientId: clientA, costPool: "OPEX",
      allocationMethod: "REVENUE_SHARE", effectiveFrom: "2026-01-01",
      reason: "Initial", createdBy: "u1",
    });
    assert.equal(r1rule.version, 1);
    const r2rule = createAllocationRule({
      firmId: firmA.id, clientId: clientA, costPool: "OPEX",
      allocationMethod: "HOURS", effectiveFrom: "2026-04-01",
      reason: "Switch to hours", createdBy: "u1",
    });
    assert.equal(r2rule.version, 2);
    assert.equal(listAllocationRules(clientA).length, 1);
    assert.equal(listAllocationRules(clientA)[0].allocationMethod, "HOURS");
    assert.equal(listAllocationRules(clientB).length, 0);

    ensureDefaultPolicies(firmA.id);
    const hist = [
      period({ id: "s1", year: 2026, month: 3, entities: [entity("e1", "A", 100, 50)], cash: 200 }),
      period({ id: "s2", year: 2026, month: 4, entities: [entity("e1", "A", 70, 50)], cash: 180 }),
    ];
    const signals = syncSignalsForPeriod({
      firmId: firmA.id, clientId: clientA, periodId: "s2", history: hist, actorId: "u1",
    });
    assert.ok(signals.some((s) => s.metricKey === "revenue"));

    // Firm B list must not see Firm A signals
    const cross = listSignals({ firmId: firmB.id, clientId: clientA });
    assert.equal(cross.length, 0);

    const again = syncSignalsForPeriod({
      firmId: firmA.id, clientId: clientA, periodId: "s2", history: hist, actorId: "u1",
    });
    const keys = again.map((s) => s.signalKey);
    assert.equal(keys.length, new Set(keys).size, "signals dedupe by key");

    const first = again[0];
    const updated = setSignalStatus({
      signalId: first.id, firmId: firmA.id, status: "REVIEWED", userId: "u1",
    });
    assert.equal(updated?.status, "REVIEWED");
    assert.equal(
      setSignalStatus({ signalId: first.id, firmId: firmB.id, status: "DISMISSED", userId: "u2" }),
      null,
    );
  });
});

test("engine version pinned", () => {
  assert.equal(FI_ENGINE_VERSION, "1.0.0");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
