/**
 * Adds twenty synthetic clients on top of the real seed.
 *
 *   npm run seed && npx tsx scripts/seed-demo-book.ts
 *
 * Exists to test the register at a realistic size. Four clients tell you nothing about
 * whether a portfolio screen works — the questions are whether a partner can scan thirty
 * rows, whether the ranking still discriminates, and whether cohort statistics mean
 * anything. Not part of `npm run seed`, because synthetic clients in a real book would
 * be worse than useless.
 */
import { db, uid } from "../lib/db";
import { setTags } from "../lib/portfolio";
import { applyPreset } from "../lib/kpi-defaults";

const VERTICALS = ["home_care", "childcare", "short_term_rental", "property_management",
  "professional_services", "restaurant", "contractor", "retail"];
const NAMES = ["Ridgeline", "Fairmount", "Oakbrook", "Silverton", "Kestrel", "Brightwater",
  "Marlowe", "Cardinal", "Alderman", "Winsome", "Thornbury", "Greystone", "Halloway",
  "Pemberton", "Wexford", "Ashcombe", "Lindenwood", "Barrow", "Copperfield", "Hartfield"];

NAMES.forEach((n, i) => {
  const cid = uid();
  const vert = VERTICALS[i % VERTICALS.length];
  db().prepare(`INSERT INTO clients
    (id,name,slug,logo_text,vertical,target_labor_lo,target_labor_hi,currency,accounting_basis)
    VALUES (?,?,?,?,?,?,?,'USD','ACCRUAL')`)
    .run(cid, `${n} Group`, `demo-${i}`, n.toUpperCase(), vert, 60, 75);

  const eid = uid();
  db().prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)")
    .run(eid, cid, `${n} Operations`, "ACTIVE");

  // Books at different states of currency, so "behind on the close" is real rather than uniform.
  const lastMonth = 8 - (i % 4);
  for (let mo = Math.max(1, lastMonth - 7); mo <= lastMonth; mo++) {
    const pid = uid();
    const base = 60 + (i * 7) % 90;
    const rev = +(base * (1 + Math.sin(i + mo) * 0.18)).toFixed(1);
    const cost = +(rev * (0.55 + (i % 5) * 0.06)).toFixed(1);
    db().prepare(`INSERT INTO periods
      (id,client_id,year,month,status,published_at,days_covered,accounting_basis,currency,reconciled)
      VALUES (?,?,?,?,'PUBLISHED',?,30,'ACCRUAL','USD',1)`)
      .run(pid, cid, 2026, mo, `2026-${String(mo).padStart(2, "0")}-14`);

    const ins = (cat: string, label: string, amt: number) =>
      db().prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, eid, cat, label, amt);
    ins("REVENUE", "Revenue", rev);
    ins("DIRECT_COST", "Direct cost", cost);
    ins("OPEX", "Overhead", +(rev * 0.2).toFixed(1));

    const w = +(cost * 0.74).toFixed(1), ot = +(cost * 0.04).toFixed(1);
    const tx = +(cost * 0.13).toFixed(1), wc = +(cost * 0.05).toFixed(1);
    db().prepare(`INSERT INTO payroll_lines
      (id,period_id,entity_id,wages,ot_premium,taxes,workers_comp,processing,hours_paid)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uid(), pid, eid, w, ot, tx, wc, +(cost - w - ot - tx - wc).toFixed(1), 1800);
    db().prepare("INSERT INTO cash_balances (id,period_id,operating,reserve) VALUES (?,?,?,?)")
      .run(uid(), pid, +(rev * (0.3 + (i % 6) * 0.25)).toFixed(1), 10);
    db().prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "Customers", +(rev * 0.3).toFixed(1), 8, 3, i % 4 === 0 ? 12 : 1);
  }

  applyPreset(cid, vert);
  setTags(cid, [i % 2 === 0 ? "Jeremiah" : "Regen", i % 3 === 0 ? "Monthly advisory" : "Quarterly"]);
});

console.log(`Added ${NAMES.length} synthetic clients. The book is now ${
  (db().prepare("SELECT COUNT(*) n FROM clients").get() as any).n} clients.`);
console.log("Re-run `npm run seed` to get back to the four real ones.");
