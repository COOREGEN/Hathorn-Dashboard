/**
 * Shared staff practice navigation — left rail groups.
 * Keep labels short; destinations match StaffHeader / Today.
 */

export type StaffNavItem = { href: string; label: string; match?: string };
export type StaffNavGroup = { id: string; label: string; items: StaffNavItem[] };

export const STAFF_NAV: StaffNavGroup[] = [
  {
    id: "briefing",
    label: "Briefing",
    items: [
      { href: "/today", label: "Today", match: "/today" },
      { href: "/portfolio", label: "Attention", match: "/portfolio" },
      { href: "/ask", label: "Ask Hathorn", match: "/ask" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    items: [
      { href: "/clients", label: "Clients", match: "/clients" },
      { href: "/dash", label: "Dashboard", match: "/dash" },
      { href: "/client-experience", label: "Client Experience", match: "/client-experience" },
      { href: "/intelligence", label: "Intelligence", match: "/intelligence" },
      { href: "/engagement", label: "Engagement", match: "/engagement" },
    ],
  },
  {
    id: "close",
    label: "Close",
    items: [
      { href: "/upload", label: "Upload", match: "/upload" },
      { href: "/close", label: "Close", match: "/close" },
      { href: "/exceptions", label: "Exceptions", match: "/exceptions" },
      { href: "/reconciliations", label: "Reconciliations", match: "/reconciliations" },
      { href: "/documents", label: "Documents", match: "/documents" },
      { href: "/integrations", label: "Integrations", match: "/integrations" },
    ],
  },
  {
    id: "advisory",
    label: "Advisory",
    items: [
      { href: "/planning", label: "Planning", match: "/planning" },
      { href: "/tax", label: "Tax", match: "/tax" },
      { href: "/guidance", label: "Guidance", match: "/guidance" },
    ],
  },
  {
    id: "firm",
    label: "Firm",
    items: [
      { href: "/firm", label: "Firm", match: "/firm" },
      { href: "/admin", label: "Ops", match: "/admin" },
      { href: "/account/security", label: "Security", match: "/account/security" },
    ],
  },
];

export function staffNavActive(pathname: string, item: StaffNavItem): boolean {
  const m = item.match || item.href;
  if (m === "/today") return pathname === "/" || pathname === "/today" || pathname.startsWith("/today/");
  if (m === "/dash") return pathname === "/dash" || pathname.startsWith("/dash/");
  if (m === "/clients") return pathname === "/clients" || pathname.startsWith("/admin/clients");
  return pathname === m || pathname.startsWith(m + "/");
}
