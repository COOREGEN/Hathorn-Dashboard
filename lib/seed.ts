/**
 * Seed: Criterion In-Home Care — the pilot client, with the fully reconciled
 * Jan–May 2026 dataset from the dashboard design phase. Run: npm run seed
 */
import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { runMigrations } from "./migrations";

/**
 * The data directory has to be created before the database is opened — better-sqlite3
 * will not create a missing parent and fails with "directory does not exist", which
 * gives no hint that a `mkdir` is all that was needed. This is also why DATA_DIR is
 * honoured here rather than assuming ./data: a deployment pointing at a mounted volume
 * would otherwise seed into the wrong place.
 */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "ledger.db"));
db.pragma("journal_mode = WAL");
db.exec(readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8"));

/**
 * Migrations must run here too.
 *
 * `schema.sql` is only the baseline; every table added since — budgets, balance sheets,
 * volume, the metric registry, tags — exists solely as a migration. Seeding without them
 * fails on a clean checkout with "no such table", which is exactly the machine a new
 * developer is on. This did not surface during the build because the container's database
 * had been migrated long before.
 */
runMigrations(db);
const uid = () => crypto.randomBytes(12).toString("hex");

// wipe
for (const t of ["users","clients","entities","periods","pl_lines","payroll_lines","ar_buckets","cash_balances","goals","story_notes","audit_logs"])
  db.exec(`DELETE FROM ${t}`);

// ---- client ----
const clientId = uid();
db.prepare(`INSERT INTO clients (id,name,slug,template,brand_primary,brand_accent,logo_text,logo_sub,target_labor_lo,target_labor_hi)
  VALUES (?,?,?,?,?,?,?,?,?,?)`)
  .run(clientId, "Criterion In-Home Care", "criterion", "modern", "#2C504D", "#DB5928", "CRITERION", "IN-HOME CARE", 65, 72);

// ---- users ----
const hash = (p: string) => bcrypt.hashSync(p, 12);
const users = [
  ["regen@hathornadvisorygroup.com", "Regen Hailemariam", "ADMIN", null],
  ["jeremiah@hathornadvisorygroup.com", "Jeremiah Hathorn", "ADVISOR", null],
  ["books@hathornadvisorygroup.com", "Hathorn Bookkeeping", "BOOKKEEPER", null],
  ["natosha@criterionihc.com", "Natosha Snowden", "CLIENT", clientId],
];
for (const [email, name, role, cid] of users)
  db.prepare("INSERT INTO users (id,email,password_hash,name,role,client_id) VALUES (?,?,?,?,?,?)")
    .run(uid(), email, hash("ledger2026"), name, role, cid);

// ---- entities ----
const eIHH = uid(), eCDS = uid(), eDZ = uid();
db.prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)").run(eIHH, clientId, "Criterion In-Home Health", "ACTIVE");
db.prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)").run(eCDS, clientId, "JE Consumer Directed Services", "ACTIVE");
db.prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)").run(eDZ, clientId, "Daisy'z Adult Day Center", "STARTUP");

// ---- goals ----
const goals = [
  ["IHH labor ratio to 72%", "≤ 72%", "81.1%", 25],
  ["Restaff to 3,700 hrs/month", "3,700 hrs", "3,051 hrs", 40],
  ["Daisy'z open by Q3, census 17+", "Open · 17/day", "Licensing in progress", 30],
];
for (const [title, target, current, progress] of goals)
  db.prepare("INSERT INTO goals (id,client_id,title,target,current,progress) VALUES (?,?,?,?,?,?)")
    .run(uid(), clientId, title, target, current, progress);

// ---- monthly data (all $K; reconciled — the same dataset the gate was proven on) ----
const MONTHS = [1, 2, 3, 4, 5];
const IHH_REV = [114.2, 121.8, 116.4, 117.9, 96.1];
const CDS_REV = [75.5, 102.7, 78.8, 73.0, 15.2];
// direct cost = payroll composition, per entity per month (labor 81.1% / 75.1% of YTD, distributed)
const IHH_LAB = [92.6, 98.8, 94.4, 95.6, 78.0];   // sums 459.4
const CDS_LAB = [56.7, 77.1, 59.2, 54.8, 11.6];   // sums 259.4
// payroll composition shares: wages .8578, ot .0298(ihh only), taxes .0789, wc .0437, proc .0198 — approx per month
function payrollSplit(total: number, isIHH: boolean) {
  const ot = isIHH ? +(total * 0.0466).toFixed(1) : 0;
  const taxes = +(total * 0.0789).toFixed(1);
  const wc = +(total * 0.0437).toFixed(1);
  const proc = +(total * 0.0198).toFixed(1);
  const wages = +(total - ot - taxes - wc - proc).toFixed(1);
  return { wages, ot, taxes, wc, proc };
}
const IHH_HRS = [3625, 3867, 3695, 3743, 3051];
const CDS_HRS = [3172, 3200, 3260, 3180, 692];
// opex per entity per month ($K): IHH 10.06/mo, CDS 4.0/mo, DZ 1.22/mo (sums 50.3 / 20.0 / 6.1)
const IHH_OPEX = [10.1, 10.1, 10.0, 10.1, 10.0];
const CDS_OPEX = [4.0, 4.0, 4.0, 4.0, 4.0];
const DZ_OPEX = [1.2, 1.2, 1.2, 1.3, 1.2];
// cash trajectory
const CASH_OP = [118.4, 131.2, 126.8, 141.5, 138.6];

const insPL = db.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)");
const insPay = db.prepare("INSERT INTO payroll_lines (id,period_id,entity_id,wages,ot_premium,taxes,workers_comp,processing,hours_paid) VALUES (?,?,?,?,?,?,?,?,?)");
const insAR = db.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)");

MONTHS.forEach((month, i) => {
  const pid = uid();
  const isMay = month === 5;
  db.prepare("INSERT INTO periods (id,client_id,year,month,status,published_at) VALUES (?,?,?,?,?,?)")
    .run(pid, clientId, 2026, month, isMay ? "IN_REVIEW" : "PUBLISHED", isMay ? null : "2026-0" + (month + 1) + "-14 10:00:00");

  // P&L
  insPL.run(uid(), pid, eIHH, "REVENUE", "Personal care services", IHH_REV[i]);
  insPL.run(uid(), pid, eCDS, "REVENUE", "CDS reimbursement", CDS_REV[i]);
  insPL.run(uid(), pid, eIHH, "DIRECT_COST", "Direct care labor", IHH_LAB[i]);
  insPL.run(uid(), pid, eCDS, "DIRECT_COST", "Attendant labor", CDS_LAB[i]);
  insPL.run(uid(), pid, eIHH, "OPEX", "Overhead allocation", IHH_OPEX[i]);
  insPL.run(uid(), pid, eCDS, "OPEX", "Overhead allocation", CDS_OPEX[i]);
  insPL.run(uid(), pid, eDZ, "OPEX", "Startup expenses", DZ_OPEX[i]);

  // payroll (composition must tie to direct cost — the gate enforces this)
  const pi = payrollSplit(IHH_LAB[i], true);
  insPay.run(uid(), pid, eIHH, pi.wages, pi.ot, pi.taxes, pi.wc, pi.proc, IHH_HRS[i]);
  const pc = payrollSplit(CDS_LAB[i], false);
  insPay.run(uid(), pid, eCDS, pc.wages, pc.ot, pc.taxes, pc.wc, pc.proc, CDS_HRS[i]);

  // cash
  db.prepare("INSERT INTO cash_balances (id,period_id,operating,reserve) VALUES (?,?,?,?)")
    .run(uid(), pid, CASH_OP[i], 25.0);

  // AR — May snapshot fuller (matches the design dataset); earlier months scaled
  const scale = isMay ? 1 : 0.82 + i * 0.04;
  insAR.run(uid(), pid, "Medicaid FFS (MMAC)", +(41.8 * scale).toFixed(1), +(33.6 * scale).toFixed(1), +(14.2 * scale).toFixed(1), +(6.6 * scale).toFixed(1));
  insAR.run(uid(), pid, "Managed Care (MCOs)", +(28.4 * scale).toFixed(1), +(21.7 * scale).toFixed(1), +(10.3 * scale).toFixed(1), +(4.3 * scale).toFixed(1));
  insAR.run(uid(), pid, "VA / CCN", +(6.1 * scale).toFixed(1), +(5.2 * scale).toFixed(1), +(2.4 * scale).toFixed(1), +(1.2 * scale).toFixed(1));
  insAR.run(uid(), pid, "Private Pay", +(5.9 * scale).toFixed(1), +(3.4 * scale).toFixed(1), +(1.6 * scale).toFixed(1), +(0.7 * scale).toFixed(1));

  // story notes — May carries the full narrative (draft state, advisor edits in review)
  const insNote = db.prepare("INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort) VALUES (?,?,?,?,?,?,?)");
  if (isMay) {
    insNote.run(uid(), pid, "WHAT_CHANGED", "warn", "CDS claims lag — $58.3K (timing)",
      "May attendant hours were worked but claims were submitted June 8. MMAC pays in ~21 days; expect recovery in the June statement. Watch, don't panic.", 0);
    insNote.run(uid(), pid, "WHAT_CHANGED", "bad", "In-Home Health hours down 18% (operational)",
      "3,051 hours delivered vs 3,743 in April after two caregiver departures. This is lost revenue, not delayed revenue — about $21.8K/month until hours are restaffed.", 1);
    insNote.run(uid(), pid, "WHAT_CHANGED", "info", "The distinction is the story",
      "Roughly $58K of the May decline comes back on its own. Roughly $22K/month does not — recruiting is the action item for the June meeting.", 2);
    insNote.run(uid(), pid, "ACTION", "bad", "Cap overtime at the schedule level",
      "$21.4K of OT premium YTD. Route open shifts to under-40 caregivers before releasing OT.", 0);
    insNote.run(uid(), pid, "ACTION", "warn", "Reprice travel-heavy cases",
      "Cases with drive time over 30 minutes effectively bill below $29/hr. Flag for renegotiation or clustering.", 1);
    insNote.run(uid(), pid, "ACTION", "info", "Work the 90+ day AR first",
      "$12.8K sits past 90 days across MMAC and MCO buckets — timely-filing risk. Work these before anything else.", 2);
  } else {
    insNote.run(uid(), pid, "WHAT_CHANGED", "info", "Steady month",
      "Revenue and labor in expected ranges. Watching IHH labor ratio against the 65–72% band.", 0);
  }
});

// ---- Prior year (2025) so the year-over-year comparison has a basis ----
const PY_IHH = [104.8, 110.2, 108.9, 106.4, 109.7];
const PY_CDS = [68.2, 71.4, 70.1, 69.8, 72.3];
MONTHS.forEach((month, i) => {
  const pid = uid();
  db.prepare("INSERT INTO periods (id,client_id,year,month,status,published_at) VALUES (?,?,?,?,?,?)")
    .run(pid, clientId, 2025, month, "PUBLISHED", "2025-0" + (month + 1) + "-14 10:00:00");
  const ihhLab = +(PY_IHH[i] * 0.79).toFixed(1);
  const cdsLab = +(PY_CDS[i] * 0.75).toFixed(1);
  insPL.run(uid(), pid, eIHH, "REVENUE", "Personal care services", PY_IHH[i]);
  insPL.run(uid(), pid, eCDS, "REVENUE", "CDS reimbursement", PY_CDS[i]);
  insPL.run(uid(), pid, eIHH, "DIRECT_COST", "Direct care labor", ihhLab);
  insPL.run(uid(), pid, eCDS, "DIRECT_COST", "Attendant labor", cdsLab);
  insPL.run(uid(), pid, eIHH, "OPEX", "Overhead allocation", 9.6);
  insPL.run(uid(), pid, eCDS, "OPEX", "Overhead allocation", 3.8);
  const pi = payrollSplit(ihhLab, true);
  insPay.run(uid(), pid, eIHH, pi.wages, pi.ot, pi.taxes, pi.wc, pi.proc, 3480);
  const pc = payrollSplit(cdsLab, false);
  insPay.run(uid(), pid, eCDS, pc.wages, pc.ot, pc.taxes, pc.wc, pc.proc, 3020);
  db.prepare("INSERT INTO cash_balances (id,period_id,operating,reserve) VALUES (?,?,?,?)")
    .run(uid(), pid, 96 + i * 4, 25.0);
  insAR.run(uid(), pid, "Medicaid FFS (MMAC)", 34.1, 26.8, 10.4, 4.9);
  insAR.run(uid(), pid, "Managed Care (MCOs)", 22.6, 17.2, 7.9, 3.1);
});

// ---- Budget for 2026 ----
const BUDGET = { REVENUE: 205, DIRECT_COST: 148, OPEX: 15, NET_INCOME: 42 };
// A budget is agreed annually, so all twelve months exist from the start of the year.
[1,2,3,4,5,6,7,8,9,10,11,12].forEach((month) => {
  for (const [cat, amount] of Object.entries(BUDGET)) {
    db.prepare(`INSERT INTO budget_lines (id,client_id,entity_id,year,month,category,amount)
      VALUES (?,?,?,?,?,?,?)`).run(uid(), clientId, eIHH, 2026, month, cat, amount);
  }
});

// ---- Balance sheet on every 2026 period ----
// Cash on the sheet must agree with the bank balance uploaded separately, and the
// sheet must balance: the gate checks both, so the seed has to be internally consistent.
const p2026: any[] = db.prepare("SELECT id, month FROM periods WHERE client_id=? AND year=2026 ORDER BY month").all(clientId);
for (const per of p2026) {
  const i = per.month - 1;
  const cashOp = CASH_OP[i] ?? 138.6;
  const ar = +( (41.8 + 28.4 + 6.1 + 5.9 + 33.6 + 21.7 + 5.2 + 3.4 + 14.2 + 10.3 + 2.4 + 1.6 + 6.6 + 4.3 + 1.2 + 0.7)
                * (per.month === 5 ? 1 : 0.82 + i * 0.04) ).toFixed(1);
  const currentAssets = [
    ["Cash — operating", cashOp],
    ["Cash — reserve", 25.0],
    ["Accounts receivable", Number(ar)],
    ["Prepaid insurance", 8.2],
  ] as [string, number][];
  const fixedAssets = [["Vehicles, net", 42.5], ["Equipment, net", 16.8]] as [string, number][];
  const currentLiabs = [
    ["Accounts payable", 31.4], ["Accrued payroll", 58.9], ["Current portion of debt", 24.0],
  ] as [string, number][];
  const longLiabs = [["SBA term loan", 118.6], ["Vehicle notes", 28.4]] as [string, number][];

  const assets = [...currentAssets, ...fixedAssets].reduce((s, [, v]) => s + v, 0);
  const liabs = [...currentLiabs, ...longLiabs].reduce((s, [, v]) => s + v, 0);
  // Equity is the plug, so assets always equal liabilities plus equity exactly.
  const equity = +(assets - liabs).toFixed(1);

  const rows: [string, string, number][] = [
    ...currentAssets.map(([l, v]) => ["CURRENT_ASSET", l, v] as [string, string, number]),
    ...fixedAssets.map(([l, v]) => ["FIXED_ASSET", l, v] as [string, string, number]),
    ...currentLiabs.map(([l, v]) => ["CURRENT_LIABILITY", l, v] as [string, string, number]),
    ...longLiabs.map(([l, v]) => ["LONG_TERM_LIABILITY", l, v] as [string, string, number]),
    ["EQUITY", "Retained earnings and capital", equity],
  ];
  rows.forEach(([section, label, amount], k) => {
    db.prepare("INSERT INTO balance_lines (id,period_id,section,label,amount,sort) VALUES (?,?,?,?,?,?)")
      .run(uid(), per.id, section, label, amount, k);
  });
  db.prepare("UPDATE periods SET debt_service_monthly=? WHERE id=?").run(4.2, per.id);
}

const mayPeriod: any = db.prepare("SELECT id FROM periods WHERE client_id=? AND year=2026 AND month=5").get(clientId);
if (mayPeriod) {

  // ---- Open commitments carried from earlier months ----
  const marPeriod: any = db.prepare("SELECT id FROM periods WHERE client_id=? AND year=2026 AND month=3").get(clientId);
  const aprPeriod: any = db.prepare("SELECT id FROM periods WHERE client_id=? AND year=2026 AND month=4").get(clientId);
  const ACTIONS: [string, string, string, string, number, string][] = [
    ["Cap overtime at the schedule level",
     "Route open shifts to caregivers under 40 hours before releasing overtime.",
     "Natosha", "Ongoing", 21.4, marPeriod?.id],
    ["Recruit four caregivers to restore IHH hours",
     "3,051 hours delivered against a 3,700 target. Roughly $21.8K of monthly revenue.",
     "Natosha", "30 Jun", 21.8, aprPeriod?.id],
    ["Work the 90-plus AR before timely filing lapses",
     "$12.8K across MMAC and MCO buckets.",
     "Billing", "15 Jun", 12.8, aprPeriod?.id],
  ];
  for (const [title, detail, owner, due, impact, opened] of ACTIONS) {
    if (!opened) continue;
    db.prepare(`INSERT INTO action_items (id,client_id,opened_period_id,title,detail,owner,due,impact)
      VALUES (?,?,?,?,?,?,?,?)`).run(uid(), clientId, opened, title, detail, owner, due, impact);
  }
  // One resolved, to show follow-through rather than an ever-growing list.
  if (marPeriod) {
    db.prepare(`INSERT INTO action_items
      (id,client_id,opened_period_id,closed_period_id,title,detail,owner,status,impact,closed_at)
      VALUES (?,?,?,?,?,?,?,'DONE',?,datetime('now'))`)
      .run(uid(), clientId, marPeriod.id, mayPeriod.id,
        "Renegotiate the travel-heavy Jefferson County cases",
        "Clustered into two runs; effective rate back above $31/hr.", "Natosha", 6.4);
  }
}

// ---- Comparability context ----
// Real day counts, so February genuinely is a short month and the gate has something
// to detect rather than a synthetic uniform 30.
const daysIn = (y: number, m: number) =>
  m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28)
          : [0,31,28,31,30,31,30,31,31,30,31,30,31][m];

const allPeriods: any[] = db.prepare("SELECT id, year, month, status FROM periods WHERE client_id=?").all(clientId);
for (const per of allPeriods) {
  db.prepare("UPDATE periods SET days_covered=?, accounting_basis='ACCRUAL', currency='USD', reconciled=? WHERE id=?")
    .run(daysIn(per.year, per.month), per.status === "PUBLISHED" ? 1 : 0, per.id);
}
db.prepare("UPDATE clients SET currency='USD', accounting_basis='ACCRUAL', vertical='home_care' WHERE id=?").run(clientId);

// Two more verticals, so the framework is provable rather than declared. Both would
// have failed the original gate on every period.
{
  const { seedVerticals } = require("./seed-verticals");
  seedVerticals();
  const { seedManagement } = require("./seed-management");
  seedManagement();

  // Tags, so the portfolio filters have something real to slice on.
  {
    const { setTags } = require("./portfolio");
    const byslug = (sl: string) => (db.prepare("SELECT id FROM clients WHERE slug=?").get(sl) as any)?.id;
    const tagMap: [string, string[]][] = [
      ["criterion", ["Monthly advisory", "Jeremiah"]],
      ["lakeside-stays", ["Quarterly", "Regen"]],
      ["bright-path", ["Monthly advisory", "Regen"]],
      ["impact-5", ["Monthly advisory", "Jeremiah", "Growth"]],
    ];
    for (const [sl, tags] of tagMap) { const id = byslug(sl); if (id) setTags(id, tags); }
  }

  // Install the metric library and apply a preset per client. Targets are deliberately
  // left unset except where they can be derived from the client's own history — the
  // honest starting state is "reported, not yet judged".
  const { installDefaults, applyPreset } = require("./kpi-defaults");
  const { setClientConfig, deriveTarget } = require("./kpi-registry");
  installDefaults();
  const allClients: any[] = db.prepare("SELECT id, vertical FROM clients").all();
  for (const cl of allClients) {
    applyPreset(cl.id, cl.vertical || "generic");
    // Where enough closed history exists, offer a derived band and record its source.
    const latest: any = db.prepare(
      "SELECT year, month FROM periods WHERE client_id=? AND status='PUBLISHED' ORDER BY year DESC, month DESC LIMIT 1").get(cl.id);
    if (latest) {
      for (const key of ["labor_ratio", "gross_margin", "dso"]) {
        const d = deriveTarget(cl.id, key, latest);
        if (d.available) {
          setClientConfig(cl.id, key, {
            targetLo: d.lo, targetHi: d.hi, targetSource: "DERIVED", targetNote: d.note,
          });
        }
      }
    }
  }
}

// Run the gate over every seeded period so the demo reflects a real close: tie-out is
// a recorded fact about a month, not something confidence has to guess at.
{
  const { runGate } = require("./gate");
  for (const per of allPeriods) {
    try { runGate(per.id); } catch { /* a period mid-construction is not a seed failure */ }
  }
}

console.log("Seeded: Criterion In-Home Care — 3 entities, 5 periods (Jan–Apr published, May in review), 4 users.");
console.log("Logins (password: ledger2026):");
for (const [email, , role] of users) console.log(`  ${String(role).padEnd(10)} ${email}`);
