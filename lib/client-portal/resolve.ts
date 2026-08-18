import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brandingForClient } from "@/lib/tenancy";
import { getPortalConfig } from "./config";
import { lockedStatements } from "../statement";

/** Shared portal page bootstrap — CLIENT forced to own client; staff may preview. */
export async function resolvePortalClient(searchParams: { client?: string; preview?: string }) {
  const s = await getSession();
  if (!s) redirect("/login");
  try {
    const { bindRlsFromSession } = await import("@/lib/db-context");
    bindRlsFromSession(s);
  } catch { /* sqlite */ }

  let clientId = s.clientId;
  const preview = s.role !== "CLIENT" && (searchParams.preview === "1" || !!searchParams.client);
  if (!clientId && ["ADMIN", "ADVISOR"].includes(s.role) && searchParams.client) {
    const c: any = db().prepare("SELECT id FROM clients WHERE slug=?").get(searchParams.client);
    clientId = c?.id;
  }
  if (!clientId && ["ADMIN", "ADVISOR"].includes(s.role) && searchParams.client) {
    // allow id as well as slug
    const byId: any = db().prepare("SELECT id FROM clients WHERE id=?").get(searchParams.client);
    clientId = byId?.id;
  }
  if (!clientId) redirect(s.role === "CLIENT" ? "/login" : "/today");

  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(clientId);
  if (!c) redirect(s.role === "CLIENT" ? "/login" : "/today");
  if (s.role !== "CLIENT") {
    const { activeMembership } = await import("@/lib/tenancy");
    if (!c.firm_id || !activeMembership(s.userId, c.firm_id)) redirect("/today");
  }

  const brand = brandingForClient(clientId!);
  const modules = getPortalConfig(clientId!);
  const periods = lockedStatements(clientId!);
  const latest = periods.length ? periods[periods.length - 1] : null;

  const q = preview && c.slug ? `?client=${c.slug}&preview=1` : "";
  const nav = [
    { href: `/portal${q.replace("?", q ? "?" : "")}` || "/portal", label: "Overview", enabled: true },
    {
      href: `/portal/statement${preview && c.slug ? `?client=${c.slug}` : ""}`,
      label: "Financials",
      enabled: modules.showFinancialStatements,
    },
    {
      href: `/portal/insights${preview && c.slug ? `?client=${c.slug}&preview=1` : ""}`,
      label: "Insights",
      enabled: modules.showInsights,
    },
    {
      href: `/portal/planning${preview && c.slug ? `?client=${c.slug}&preview=1` : ""}`,
      label: "Planning",
      enabled: modules.showPlanning,
    },
    {
      href: `/portal/reports${preview && c.slug ? `?client=${c.slug}&preview=1` : ""}`,
      label: "Reports",
      enabled: modules.showReports,
    },
    {
      href: `/portal/documents${preview && c.slug ? `?client=${c.slug}&preview=1` : ""}`,
      label: "Documents",
      enabled: modules.showDocuments,
    },
  ];

  // Fix overview href
  nav[0].href = preview && c.slug ? `/portal?client=${c.slug}&preview=1` : "/portal";
  // Keep preview=1 on statement so staff don't silently leave preview mode.
  if (preview && c.slug) {
    nav[1].href = `/portal/statement?client=${c.slug}&preview=1`;
  }

  const staffChrome = s.role !== "CLIENT"
    ? {
        homeHref: "/today",
        homeLabel: "Back to Today",
        exitPreviewHref: "/client-experience",
        exitPreviewLabel: "Exit preview",
        clientHref: `/admin/clients/${clientId}`,
        clientLabel: "Client settings",
      }
    : null;

  return {
    session: s,
    clientId: clientId!,
    client: c,
    brand,
    modules,
    periods,
    latest,
    nav,
    preview: !!preview && s.role !== "CLIENT",
    staffChrome,
    showCopilot: modules.showCopilot && s.role === "CLIENT",
    allowClientAnswers: modules.allowClientAnswers && s.role === "CLIENT",
    allowClientUploads: modules.allowClientUploads && s.role === "CLIENT",
  };
}
