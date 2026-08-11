/**
 * Server-side PDF of a published release snapshot.
 *
 * The portal "Download PDF" button hits this so the file is the frozen statement,
 * not whatever the browser happened to print from live DOM. Numbers come only from
 * the active release — never recomputed from working papers.
 */

import PDFDocument from "pdfkit";
import { activeRelease } from "./release";
import { monthName } from "./db";

function money(n: number): string {
  const neg = n < 0;
  const v = Math.abs(n || 0);
  const s = v >= 1000 ? `$${(v / 1000).toFixed(2)}M` : `$${v.toFixed(1)}K`;
  return neg ? `−${s}` : s;
}

function pct(n: number): string {
  return `${Number(n || 0).toFixed(1)}%`;
}

export async function buildStatementPdf(periodId: string): Promise<{
  buffer: Buffer;
  filename: string;
  checksum: string;
} | null> {
  const rel = activeRelease(periodId);
  if (!rel) return null;
  const snap = rel.snapshot as any;
  const clientName = snap.client?.name || "Client";
  const year = snap.period?.year ?? 0;
  const month = snap.period?.month ?? 0;
  const label = snap.period?.label || `${monthName(month)} ${year}`;
  const fig = snap.figures || {};
  const notes: any[] = snap.commentary || [];
  const lang = snap.language || {};

  const doc = new PDFDocument({ margin: 54, size: "LETTER", info: {
    Title: `${clientName} — ${label}`,
    Author: "Hathorn Advisory Group",
    Subject: `Release v${rel.version} · ${rel.checksum.slice(0, 12)}`,
  }});

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));

  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.rect(0, 0, doc.page.width, 72).fill("#0C0B0A");
  doc.fillColor("#D3AF37").fontSize(11).font("Helvetica-Bold")
    .text("HATHORN ADVISORY GROUP", 54, 30, { characterSpacing: 2 });
  doc.fillColor("#A8A196").fontSize(8).font("Helvetica")
    .text("Monthly statement · confidential", 54, 48);

  doc.fillColor("#6E675B").fontSize(9).text("MONTHLY STATEMENT", 54, 96);
  doc.fillColor("#0C0B0A").fontSize(26).font("Helvetica-Bold").text(label, 54, 112);
  doc.font("Helvetica").fontSize(12).fillColor("#3A3530").text(clientName, 54, 144);
  doc.fontSize(9).fillColor("#6E675B")
    .text(`Release v${rel.version} · checksum ${rel.checksum.slice(0, 16)}`, 54, 162);

  doc.moveTo(54, 186).lineTo(doc.page.width - 54, 186).strokeColor("#E8E5E0").stroke();

  const revenueLabel = lang.revenueLabel || "Revenue";
  const laborLabel = lang.laborRatioLabel || "Labor ratio";

  const kpis: [string, string][] = [
    [revenueLabel, money(fig.revenue)],
    ["Gross margin", pct(fig.grossMarginPct)],
    [laborLabel, pct(fig.laborPct)],
    ["Net income", money(fig.netIncome)],
    ["Cash", money(fig.cash)],
    ["Receivables", money(fig.arTotal)],
  ];

  let x = 54;
  let y = 206;
  for (let i = 0; i < kpis.length; i++) {
    const [k, v] = kpis[i];
    doc.fillColor("#6E675B").fontSize(8).text(k.toUpperCase(), x, y, { width: 160 });
    doc.fillColor("#0C0B0A").fontSize(16).font("Helvetica-Bold").text(v, x, y + 14, { width: 160 });
    doc.font("Helvetica");
    if (i % 3 === 2) { x = 54; y += 52; }
    else x += 170;
  }

  y += 20;
  doc.fillColor("#0C0B0A").fontSize(12).font("Helvetica-Bold").text("What changed", 54, y);
  doc.font("Helvetica");
  y += 20;

  const whatChanged = notes.filter((n) => !n.slot || n.slot === "WHAT_CHANGED");
  const story = whatChanged.length ? whatChanged : notes;

  if (!story.length) {
    doc.fillColor("#6E675B").fontSize(10).text("No commentary was published with this release.", 54, y);
  } else {
    for (const n of story.slice(0, 8)) {
      const heading = n.heading || "Note";
      const body = n.body || "";
      doc.fillColor("#0C0B0A").fontSize(10).font("Helvetica-Bold").text(heading, 54, y, { width: 504 });
      y = doc.y + 4;
      doc.font("Helvetica").fillColor("#3A3530").fontSize(10).text(body, 54, y, { width: 504 });
      y = doc.y + 14;
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 54;
      }
    }
  }

  if (snap.disclosure) {
    doc.fillColor("#9a9490").fontSize(8)
      .text(snap.disclosure, 54, doc.page.height - 72, { width: 504 });
  }
  doc.fillColor("#9a9490").fontSize(8)
    .text(
      "Generated from the immutable release snapshot. Figures match the portal at publish time.",
      54,
      doc.page.height - 40,
      { width: 504 },
    );

  doc.end();
  const buffer = await done;
  const slug = String(clientName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug || "statement"}-${year}-${String(month).padStart(2, "0")}-v${rel.version}.pdf`;
  return { buffer, filename, checksum: rel.checksum };
}
