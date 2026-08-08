/**
 * Demonstration clients for the non-home-care verticals.
 *
 * These exist so the vertical framework is provable rather than merely declared: a
 * short-term rental with no payroll in the direct line, and a childcare centre where
 * enrolment drives everything. Both would have been unable to publish a single period
 * under the original gate.
 */
import { db, uid } from "./db";
import { runGate } from "./gate";

export function seedVerticals(clientIdSeed?: string) {
  const d = db();

  /* ---------------- Short-term rental ---------------- */
  const rentalId = uid();
  d.prepare(`INSERT INTO clients
    (id,name,slug,template,brand_primary,brand_accent,logo_text,logo_sub,
     target_labor_lo,target_labor_hi,vertical,currency,accounting_basis)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(rentalId, "Lakeside Stays LLC", "lakeside-stays", "modern",
      "#2F5D7C", "#C9743A", "LAKESIDE", "Short-Term Rentals", 0, 0,
      "short_term_rental", "USD", "ACCRUAL");

  const props = [
    { name: "Table Rock Cabin", nights: 21, capacity: 30, adr: 0.285 },
    { name: "Branson Loft", nights: 24, capacity: 31, adr: 0.198 },
    { name: "Ozark A-Frame", nights: 17, capacity: 30, adr: 0.242 },
  ];
  const propIds = props.map((p) => {
    const id = uid();
    d.prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)")
      .run(id, rentalId, p.name, "ACTIVE");
    return id;
  });

  for (let month = 4; month <= 6; month++) {
    const pid = uid();
    d.prepare("INSERT INTO periods (id,client_id,year,month,status,published_at,days_covered,accounting_basis,currency,reconciled) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(pid, rentalId, 2026, month, "PUBLISHED", `2026-0${month + 1}-12 09:00:00`,
        [0,31,28,31,30,31,30][month] ?? 30, "ACCRUAL", "USD", 1);

    let totalRev = 0, totalDirect = 0;
    props.forEach((p, i) => {
      // Summer ramp: nights rise into June.
      const nights = Math.round(p.nights * (1 + (month - 4) * 0.12));
      const revenue = +(nights * p.adr).toFixed(1);
      // Direct cost is cleaning, supplies, platform fees and utilities — no payroll.
      const direct = +(revenue * 0.34).toFixed(1);
      totalRev += revenue; totalDirect += direct;

      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, propIds[i], "REVENUE", "Booking revenue", revenue);
      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, propIds[i], "DIRECT_COST", "Cleaning, supplies, platform fees", direct);
      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, propIds[i], "OPEX", "Mortgage, insurance, management", +(revenue * 0.28).toFixed(1));
      // No payroll row at all — the direct line has none.
      d.prepare("INSERT INTO volume_lines (id,period_id,entity_id,units_sold,units_available,note) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, propIds[i], nights, p.capacity, "");
    });

    d.prepare("INSERT INTO cash_balances (id,period_id,operating,reserve) VALUES (?,?,?,?)")
      .run(uid(), pid, +(totalRev * 0.9).toFixed(1), 18.0);
    d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "Airbnb", +(totalRev * 0.06).toFixed(1), 0.4, 0, 0);
    d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "VRBO", +(totalRev * 0.03).toFixed(1), 0.2, 0, 0);

    d.prepare("INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "WHAT_CHANGED", month === 6 ? "info" : "warn",
        month === 6 ? "Occupancy climbing into peak season"
          : "Ozark A-Frame is dragging the portfolio",
        month === 6
          ? "Nights sold rose across all three properties as summer demand arrived. Rate held, so the revenue gain is genuine volume rather than discounting."
          : "Table Rock and Branson are both above the 60–80% band. The A-Frame sits at 57%, which is roughly $2.9K of unsold nights a month. Its listing photos predate the renovation.",
        0);
    runGate(pid);
  }

  /* ---------------- Childcare ---------------- */
  const careId = uid();
  d.prepare(`INSERT INTO clients
    (id,name,slug,template,brand_primary,brand_accent,logo_text,logo_sub,
     target_labor_lo,target_labor_hi,vertical,currency,accounting_basis)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(careId, "Bright Path Early Learning", "bright-path", "editorial",
      "#3D6B4A", "#D08A2C", "BRIGHT PATH", "Early Learning Center", 45, 55,
      "childcare", "USD", "ACCRUAL");

  const rooms = [
    { name: "Infant Room", enrolled: 12, capacity: 12, rate: 1.45 },
    { name: "Toddler Room", enrolled: 22, capacity: 24, rate: 1.22 },
    { name: "Preschool", enrolled: 31, capacity: 40, rate: 1.05 },
  ];
  const roomIds = rooms.map((r) => {
    const id = uid();
    d.prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)")
      .run(id, careId, r.name, "ACTIVE");
    return id;
  });

  for (let month = 4; month <= 6; month++) {
    const pid = uid();
    d.prepare("INSERT INTO periods (id,client_id,year,month,status,published_at,days_covered,accounting_basis,currency,reconciled) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(pid, careId, 2026, month, "PUBLISHED", `2026-0${month + 1}-10 09:00:00`,
        [0,31,28,31,30,31,30][month] ?? 30, "ACCRUAL", "USD", 1);

    let totalRev = 0;
    rooms.forEach((r, i) => {
      const enrolled = r.enrolled + (month - 4);
      const revenue = +(enrolled * r.rate).toFixed(1);
      // Ratio-driven staffing: labour is the whole direct cost, and it has a hard floor.
      const labor = +(revenue * (i === 0 ? 0.58 : i === 1 ? 0.51 : 0.47)).toFixed(1);
      totalRev += revenue;

      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, roomIds[i], "REVENUE", "Tuition and fees", revenue);
      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, roomIds[i], "DIRECT_COST", "Teaching staff", labor);
      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, roomIds[i], "OPEX", "Facility and administration", +(revenue * 0.19).toFixed(1));

      // Payroll must sum exactly to direct cost: this vertical uses labor_ties_payroll.
      const wages = +(labor * 0.74).toFixed(1);
      const ot = +(labor * 0.03).toFixed(1);
      const taxes = +(labor * 0.13).toFixed(1);
      const wc = +(labor * 0.05).toFixed(1);
      const proc = +(labor - wages - ot - taxes - wc).toFixed(1);
      d.prepare(`INSERT INTO payroll_lines (id,period_id,entity_id,wages,ot_premium,taxes,workers_comp,processing,hours_paid)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(uid(), pid, roomIds[i], wages, ot, taxes, wc, proc, enrolled * 42);

      d.prepare("INSERT INTO volume_lines (id,period_id,entity_id,units_sold,units_available,note) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, roomIds[i], enrolled, r.capacity,
          i === 2 ? "Two staff departures capped intake" : "");
    });

    d.prepare("INSERT INTO cash_balances (id,period_id,operating,reserve) VALUES (?,?,?,?)")
      .run(uid(), pid, +(totalRev * 1.4).toFixed(1), 22.0);
    d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "Private tuition", +(totalRev * 0.08).toFixed(1), 2.1, 0.6, 0.3);
    d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "State subsidy program", +(totalRev * 0.14).toFixed(1), 6.8, 3.2, 1.9);

    d.prepare("INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "WHAT_CHANGED", "warn",
        "Preschool is the only room with room to grow",
        "Infant and Toddler are effectively full — Infant at licensed capacity, Toddler one child short. Preschool sits at 78% of its 40 licensed places, which is roughly $9K a month of tuition the building could carry today without another teacher hire.",
        0);
    runGate(pid);
  }

  return { rentalId, careId };
}
