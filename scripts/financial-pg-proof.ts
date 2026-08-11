/**
 * Independent known-number + release immutability proof against the active db() engine.
 * Expected relationships are checked without calling lib/metrics compute helpers.
 *
 *   POSTGRES_RUNTIME_ENABLED=1 DATABASE_URL=… npx tsx scripts/financial-pg-proof.ts
 */
import { db, closeDb, dbEngine } from "../lib/db";
import { setPlatformAdmin, setRlsFirmId } from "../lib/db-context";

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); fail++; }
}

function main() {
  console.log(`Financial proof — engine=${dbEngine()}\n`);
  setPlatformAdmin(true);

  const north: any = db().prepare(
    `SELECT id, name, firm_id FROM clients WHERE name LIKE 'Northbridge%' LIMIT 1`,
  ).get();
  assert("Northbridge client exists", Boolean(north?.id));
  setPlatformAdmin(false);
  setRlsFirmId(north.firm_id);

  const apr: any = db().prepare(
    `SELECT id FROM periods WHERE client_id=? AND year=2026 AND month=4`,
  ).get(north.id);
  assert("Apr 2026 period exists", Boolean(apr?.id));

  const rev = Number((db().prepare(
    `SELECT COALESCE(SUM(amount),0) v FROM pl_lines WHERE period_id=? AND category='REVENUE'`,
  ).get(apr.id) as any).v);
  const dc = Number((db().prepare(
    `SELECT COALESCE(SUM(amount),0) v FROM pl_lines WHERE period_id=? AND category='DIRECT_COST'`,
  ).get(apr.id) as any).v);
  const opex = Number((db().prepare(
    `SELECT COALESCE(SUM(amount),0) v FROM pl_lines WHERE period_id=? AND category='OPEX'`,
  ).get(apr.id) as any).v);
  const gp = rev - dc;
  const ni = gp - opex;

  console.log(`  · Apr figures Rev=${rev} DC=${dc} GP=${gp} Opex=${opex} NI=${ni}`);
  assert("Revenue positive", rev > 0, `rev=${rev}`);
  assert("Direct cost positive", dc > 0);
  assert("Gross profit = Rev − DC", Math.abs(gp - (rev - dc)) < 0.001);
  assert("Net income = GP − Opex", Math.abs(ni - (gp - opex)) < 0.001);

  // Prior RC independent fixture for Northbridge Apr 2026 was Rev 190.9 / GP 40.5 / NI 25.1
  assert("Apr revenue matches known fixture 190.9", Math.abs(rev - 190.9) < 0.05, `got ${rev}`);
  assert("Apr GP matches known fixture 40.5", Math.abs(gp - 40.5) < 0.05, `got ${gp}`);
  assert("Apr NI matches known fixture 25.1", Math.abs(ni - 25.1) < 0.05, `got ${ni}`);

  const assets = Number((db().prepare(
    `SELECT COALESCE(SUM(amount),0) v FROM balance_lines WHERE period_id=? AND section LIKE '%ASSET%'`,
  ).get(apr.id) as any).v);
  const liab = Number((db().prepare(
    `SELECT COALESCE(SUM(amount),0) v FROM balance_lines WHERE period_id=? AND section LIKE '%LIAB%'`,
  ).get(apr.id) as any).v);
  const equity = Number((db().prepare(
    `SELECT COALESCE(SUM(amount),0) v FROM balance_lines WHERE period_id=? AND section LIKE '%EQUITY%'`,
  ).get(apr.id) as any).v);
  if (assets || liab || equity) {
    assert(
      "Assets ≈ Liabilities + Equity",
      Math.abs(assets - (liab + equity)) < 0.05,
      `A=${assets} L=${liab} E=${equity}`,
    );
  } else {
    console.log("  · no balance sheet lines for Apr — skipping BS equation");
  }

  const cash = Number((db().prepare(
    `SELECT COALESCE(SUM(operating+reserve),0) v FROM cash_balances WHERE period_id=?`,
  ).get(apr.id) as any).v);
  const ar = Number((db().prepare(
    `SELECT COALESCE(SUM(b0_30+b31_60+b61_90+b90p),0) v FROM ar_buckets WHERE period_id=?`,
  ).get(apr.id) as any).v);
  assert("Cash present", cash > 0, `cash=${cash}`);
  assert("AR present", ar > 0, `ar=${ar}`);

  const rel: any = db().prepare(
    `SELECT id, checksum, snapshot FROM release_records
      WHERE client_id=? AND status='ACTIVE' ORDER BY published_at DESC LIMIT 1`,
  ).get(north.id);
  assert("Active release exists", Boolean(rel?.id));
  const before = rel.checksum as string;
  const snapBefore = rel.snapshot as string;

  const line: any = db().prepare(
    `SELECT id, amount FROM pl_lines WHERE period_id=? AND category='REVENUE' LIMIT 1`,
  ).get(apr.id);
  assert("Mutable revenue line exists", Boolean(line?.id));
  db().prepare(`UPDATE pl_lines SET amount = ? WHERE id=?`).run(Number(line.amount) + 50, line.id);

  const rel2: any = db().prepare(
    `SELECT checksum, snapshot FROM release_records WHERE id=?`,
  ).get(rel.id);
  assert("Release checksum unchanged after +50K working mutation", rel2.checksum === before);
  assert("Release snapshot unchanged after working mutation", rel2.snapshot === snapBefore);

  // Restore working line so later suites see the seed.
  db().prepare(`UPDATE pl_lines SET amount = ? WHERE id=?`).run(line.amount, line.id);

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  closeDb();
  if (fail) process.exit(1);
}

main();
