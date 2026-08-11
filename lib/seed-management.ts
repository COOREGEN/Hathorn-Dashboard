/**
 * A property management demo, shaped like a real STR management book.
 *
 * The point of this seed is the bridge: gross bookings flow through the account, tax goes
 * to the state, owners are disbursed, and the manager keeps a fee. Every number below is
 * internally consistent so the gate's reconciliation check is meaningful rather than
 * decorative.
 */
import { db, uid } from "./db";
import { runGate } from "./gate";

export function seedManagement() {
  const d = db();
  const clientId = uid();

  const firmId = (d.prepare("SELECT id FROM firms WHERE slug='hathorn-advisory'").get() as any)?.id
    || (d.prepare("SELECT id FROM firms LIMIT 1").get() as any)?.id;
  d.prepare(`INSERT INTO clients
    (id,firm_id,name,slug,template,brand_primary,brand_accent,logo_text,logo_sub,
     target_labor_lo,target_labor_hi,vertical,currency,accounting_basis)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(clientId, firmId, "Impact 5 Property Management", "impact-5", "modern",
      "#4A7C36", "#6FBF3F", "IMPACT 5", "Property Management", 0, 0,
      "property_management", "USD", "ACCRUAL");

  // Buildings, not properties: a manager runs buildings containing units.
  const buildings = [
    { name: "Greeley", units: 6, adr: 0.182, occ: 0.74 },
    { name: "Hoffman", units: 4, adr: 0.164, occ: 0.68 },
    { name: "Paincourt", units: 5, adr: 0.211, occ: 0.71 },
    { name: "Peper", units: 3, adr: 0.238, occ: 0.63 },
  ];
  const ids = buildings.map((b) => {
    const id = uid();
    d.prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)")
      .run(id, clientId, b.name, "ACTIVE");
    return id;
  });

  const MONTHS = [3, 4, 5];
  const daysIn = (m: number) => [0,31,28,31,30,31,30,31,31,30,31,30,31][m];

  for (const month of MONTHS) {
    const pid = uid();
    const days = daysIn(month);
    // Spring ramp into May.
    const seasonal = 1 + (month - 3) * 0.09;

    let grossAll = 0, nightsAll = 0, capacityAll = 0;
    const perBuilding: { id: string; gross: number; nights: number; capacity: number }[] = [];

    buildings.forEach((b, i) => {
      const capacity = b.units * days;
      const nights = Math.round(capacity * b.occ * (month === 5 ? 1.04 : 1));
      const gross = +(nights * b.adr * seasonal).toFixed(1);
      grossAll += gross; nightsAll += nights; capacityAll += capacity;
      perBuilding.push({ id: ids[i], gross, nights, capacity });
    });
    grossAll = +grossAll.toFixed(1);

    // ---- The bridge. Every figure derives from gross so the arithmetic closes. ----
    const occupancyTax = +(grossAll * 0.062).toFixed(1);   // remitted to the municipality
    const salesTax = +(grossAll * 0.048).toFixed(1);       // remitted to the state
    const managementRate = 0.22;                            // the manager's fee on net rent
    const netRent = +(grossAll - occupancyTax - salesTax).toFixed(1);
    const managementFee = +(netRent * managementRate).toFixed(1);
    const reserves = +(netRent * 0.03).toFixed(1);          // held for owner repairs
    const ownerDisbursed = +(netRent - managementFee - reserves).toFixed(1);

    d.prepare(`INSERT INTO periods
      (id,client_id,year,month,status,published_at,days_covered,accounting_basis,currency,reconciled,gross_bookings)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(pid, clientId, 2026, month, "PUBLISHED", `2026-0${month + 1}-11 09:00:00`,
        days, "ACCRUAL", "USD", 1, grossAll);

    for (const [kind, label, amount] of [
      ["OCCUPANCY_TAX", "Municipal occupancy tax remitted", occupancyTax],
      ["SALES_TAX", "State sales tax remitted", salesTax],
      ["OWNER_DISBURSEMENT", "Disbursed to property owners", ownerDisbursed],
      ["RESERVE", "Held in owner repair reserves", reserves],
    ] as [string, string, number][]) {
      d.prepare("INSERT INTO passthrough_lines (id,period_id,entity_id,kind,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, null, kind, label, amount);
    }

    // ---- P&L on the management basis: revenue is the fee, not the flow. ----
    // Fee revenue is allocated to buildings in proportion to what they generated.
    perBuilding.forEach((b) => {
      const share = grossAll ? b.gross / grossAll : 0;
      const fee = +(managementFee * share).toFixed(1);
      const opex = +(fee * 0.63).toFixed(1);
      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, b.id, "REVENUE", "Management fee", fee);
      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, b.id, "OPEX", "Staff, software, and building overhead", opex);
      d.prepare("INSERT INTO volume_lines (id,period_id,entity_id,units_sold,units_available,note) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, b.id, b.nights, b.capacity,
          b.capacity && b.nights / b.capacity < 0.65 ? "Below the 60–80% band" : "");
    });

    d.prepare("INSERT INTO cash_balances (id,period_id,operating,reserve) VALUES (?,?,?,?)")
      .run(uid(), pid, +(managementFee * 1.6).toFixed(1), reserves);

    // ---- Fee recovery: where a management company quietly loses money. ----
    // Cleaning is deliberately underwater — a $150 fee against $168 of cleaner cost is the
    // single most common unnoticed loss in this business.
    const cleaningBilled = +(nightsAll * 0.021).toFixed(1);
    for (const [type, billed, collected, cost, note] of [
      ["MANAGEMENT", managementFee, +(managementFee * 0.97).toFixed(1), 0, ""],
      ["CLEANING", cleaningBilled, +(cleaningBilled * 0.94).toFixed(1), +(cleaningBilled * 1.12).toFixed(1),
        "Cleaner rates rose in March; the guest fee has not moved since 2024"],
      ["MAINTENANCE", +(grossAll * 0.018).toFixed(1), +(grossAll * 0.013).toFixed(1),
        +(grossAll * 0.015).toFixed(1), "Owner approval delays on two work orders"],
    ] as [string, number, number, number, string][]) {
      d.prepare("INSERT INTO fee_lines (id,period_id,entity_id,fee_type,billed,collected,cost,note) VALUES (?,?,?,?,?,?,?,?)")
        .run(uid(), pid, null, type, billed, collected, cost, note);
    }

    // ---- Channel mix ----
    for (const [channel, share, feeRate] of [
      ["Airbnb", 0.53, 0.152], ["Booking.com", 0.31, 0.171], ["Direct", 0.16, 0.029],
    ] as [string, number, number][]) {
      const gross = +(grossAll * share).toFixed(1);
      d.prepare("INSERT INTO channel_lines (id,period_id,entity_id,channel,gross_bookings,channel_fees,nights) VALUES (?,?,?,?,?,?,?)")
        .run(uid(), pid, null, channel, gross, +(gross * feeRate).toFixed(1), Math.round(nightsAll * share));
    }

    d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "Channel remittances", +(grossAll * 0.05).toFixed(1), 1.2, 0.3, 0);
    d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "Owner reimbursements", +(grossAll * 0.02).toFixed(1), 2.4, 1.1, 0.6);

    d.prepare("INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "WHAT_CHANGED", "warn",
        "Cleaning is being subsidised on every turn",
        `Cleaning fees billed $${cleaningBilled.toFixed(1)}K against $${(cleaningBilled * 1.12).toFixed(1)}K paid to cleaners — a loss on every stay. Cleaner rates rose in March and the guest-facing fee has not moved since 2024. Raising it to cover cost is worth roughly $${(cleaningBilled * 0.12).toFixed(1)}K a month and requires no new bookings.`,
        0);
    d.prepare("INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), pid, "ACTION", "info",
        "Peper occupancy is the largest single gap",
        "Peper is running below the 60–80% band while Greeley and Paincourt sit inside it. Three units at that shortfall is the biggest recoverable revenue in the portfolio, and it costs nothing to fix beyond listing work.",
        1);

    runGate(pid);
  }

  return clientId;
}
