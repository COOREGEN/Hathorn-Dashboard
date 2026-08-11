/**
 * Command Center model + fixture.
 * Presentation-only. Live path maps from OverviewV2Model.
 */

export type CCLens = "revenue" | "gp" | "margin" | "ni" | "cash" | "ar";

export type CCPeriod = {
  id: string;
  label: string;
  year: number;
  month: number;
  revenue: number;
  gp: number;
  margin: number;
  ni: number;
  cash: number;
  ar: number;
  budgetRevenue: number | null;
};

export type CCDriver = {
  id: string;
  label: string;
  delta: number;
  kind: "start" | "end" | "up" | "down";
  detail: string;
  lens?: CCLens;
};

export type CCAnnotation = {
  periodId: string;
  kind: "anomaly" | "break" | "note";
  label: string;
  detail: string;
};

export type CommandCenterModel = {
  clientName: string;
  firmName: string;
  userName: string;
  userRole: string;
  periodId: string;
  periods: CCPeriod[];
  drivers: CCDriver[];
  expenses: { label: string; amount: number }[];
  insights: { label: string; value: string; detail: string; tone: "up" | "down" | "flat" }[];
  narrative: { headline: string; body: string; signal: string | null };
  annotations: CCAnnotation[];
  contributions: { driver: string; impact: number; share: number; note: string }[];
  demo: boolean;
};

export const LENS_META: Record<CCLens, { label: string; unit: "money" | "pct"; key: keyof CCPeriod }> = {
  revenue: { label: "Revenue", unit: "money", key: "revenue" },
  gp: { label: "Gross profit", unit: "money", key: "gp" },
  margin: { label: "Gross margin", unit: "pct", key: "margin" },
  ni: { label: "Net income", unit: "money", key: "ni" },
  cash: { label: "Cash", unit: "money", key: "cash" },
  ar: { label: "Receivables", unit: "money", key: "ar" },
};

export function fixtureCommandCenter(): CommandCenterModel {
  const periods: CCPeriod[] = [
    { id: "2025-05", label: "May 2025", year: 2025, month: 5, revenue: 162.4, gp: 48.1, margin: 29.6, ni: 21.2, cash: 118.0, ar: 74.2, budgetRevenue: 160 },
    { id: "2025-06", label: "Jun 2025", year: 2025, month: 6, revenue: 168.9, gp: 50.4, margin: 29.8, ni: 22.0, cash: 121.5, ar: 76.1, budgetRevenue: 165 },
    { id: "2025-07", label: "Jul 2025", year: 2025, month: 7, revenue: 171.2, gp: 49.8, margin: 29.1, ni: 20.4, cash: 119.8, ar: 79.4, budgetRevenue: 168 },
    { id: "2025-08", label: "Aug 2025", year: 2025, month: 8, revenue: 174.6, gp: 51.2, margin: 29.3, ni: 21.8, cash: 124.1, ar: 78.0, budgetRevenue: 170 },
    { id: "2025-09", label: "Sep 2025", year: 2025, month: 9, revenue: 176.0, gp: 52.0, margin: 29.5, ni: 22.6, cash: 126.4, ar: 80.2, budgetRevenue: 172 },
    { id: "2025-10", label: "Oct 2025", year: 2025, month: 10, revenue: 178.4, gp: 53.1, margin: 29.8, ni: 23.1, cash: 128.0, ar: 81.5, budgetRevenue: 175 },
    { id: "2025-11", label: "Nov 2025", year: 2025, month: 11, revenue: 180.1, gp: 54.0, margin: 30.0, ni: 23.8, cash: 130.2, ar: 82.0, budgetRevenue: 176 },
    { id: "2025-12", label: "Dec 2025", year: 2025, month: 12, revenue: 182.5, gp: 55.2, margin: 30.2, ni: 24.4, cash: 133.5, ar: 79.8, budgetRevenue: 178 },
    { id: "2026-01", label: "Jan 2026", year: 2026, month: 1, revenue: 184.0, gp: 54.8, margin: 29.8, ni: 23.9, cash: 131.0, ar: 84.1, budgetRevenue: 180 },
    { id: "2026-02", label: "Feb 2026", year: 2026, month: 2, revenue: 179.2, gp: 52.6, margin: 29.4, ni: 22.1, cash: 129.4, ar: 86.3, budgetRevenue: 182 },
    { id: "2026-03", label: "Mar 2026", year: 2026, month: 3, revenue: 186.4, gp: 55.9, margin: 30.0, ni: 24.8, cash: 134.2, ar: 85.0, budgetRevenue: 185 },
    { id: "2026-04", label: "Apr 2026", year: 2026, month: 4, revenue: 190.9, gp: 57.4, margin: 30.1, ni: 25.6, cash: 136.8, ar: 88.4, budgetRevenue: 188 },
  ];

  return {
    clientName: "Northbridge Care",
    firmName: "Hathorn Advisory Group",
    userName: "Regen",
    userRole: "ADMIN",
    periodId: "2026-04",
    periods,
    drivers: [
      { id: "start", label: "Mar net income", delta: 24.8, kind: "start", detail: "Prior month close." },
      { id: "rev", label: "Revenue", delta: 8.4, kind: "up", lens: "revenue", detail: "Volume hours and rate mix both contributed. Adult day remains the smaller slice." },
      { id: "labor", label: "Direct labor", delta: -4.1, kind: "down", lens: "margin", detail: "Hours paid rose with revenue; OT share stayed under 6%. Ratio inside 65–72%." },
      { id: "opex", label: "Operating expense", delta: -1.2, kind: "down", lens: "ni", detail: "Insurance renewal stepped up; residual opex flat in dollars." },
      { id: "other", label: "Other / below line", delta: 0.7, kind: "up", lens: "ni", detail: "Small interest and timing items — not an operational story." },
      { id: "end", label: "Apr net income", delta: 25.6, kind: "end", detail: "Current close." },
    ],
    expenses: [
      { label: "Direct care labor", amount: 98.4 },
      { label: "Attendant labor", amount: 22.1 },
      { label: "Payroll taxes & WC", amount: 14.6 },
      { label: "Occupancy", amount: 6.8 },
      { label: "Admin & other", amount: 8.2 },
    ],
    insights: [
      { label: "Labor ratio", value: "68.2%", detail: "Inside agreed band", tone: "up" },
      { label: "Cash cover", value: "9.1 wks", detail: "Operating runway", tone: "flat" },
      { label: "AR 61+", value: "$31K", detail: "Name the payer", tone: "down" },
    ],
    narrative: {
      headline: "Top line held. Collections is the conversation.",
      body: "Revenue kept the year-over-year lift and labor stayed inside the band. Aged AR is what to open in the room — not the headline figure.",
      signal: "Labor inside 65–72%",
    },
    annotations: [
      { periodId: "2026-02", kind: "break", label: "Trend break", detail: "February dipped vs the trailing slope — short month + census timing." },
      { periodId: "2026-04", kind: "note", label: "Above budget", detail: "Revenue cleared the month’s plan by $2.9K." },
      { periodId: "2025-07", kind: "anomaly", label: "Margin soft", detail: "Gross margin slipped while revenue rose — labor timing." },
    ],
    contributions: [
      { driver: "Core home care volume", impact: 6.1, share: 0.52, note: "Hours + rate mix" },
      { driver: "Adult day", impact: 1.4, share: 0.12, note: "Still the smaller slice" },
      { driver: "Direct labor", impact: -4.1, share: 0.35, note: "Tracks revenue; band intact" },
      { driver: "Insurance renewal", impact: -0.8, share: 0.07, note: "Step-up in opex" },
      { driver: "Other", impact: 0.7, share: 0.06, note: "Below-line timing" },
    ],
    demo: true,
  };
}
