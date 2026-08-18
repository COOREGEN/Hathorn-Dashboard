/**
 * Shared staff practice navigation — left rail groups.
 * Keep labels short; destinations match StaffHeader / Today.
 */

import type { StaffIconName } from "@/components/staff-icons";

export type StaffNavItem = { href: string; label: string; match?: string; icon: StaffIconName };
export type StaffNavGroup = { id: string; label: string; items: StaffNavItem[] };

export const STAFF_NAV: StaffNavGroup[] = [
  {
    id: "briefing",
    label: "Briefing",
    items: [
      { href: "/today", label: "Today", match: "/today", icon: "today" },
      { href: "/portfolio", label: "Attention", match: "/portfolio", icon: "attention" },
      { href: "/ask", label: "Ask Hathorn", match: "/ask", icon: "ask" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    items: [
      { href: "/clients", label: "Clients", match: "/clients", icon: "clients" },
      { href: "/dash", label: "Dashboard", match: "/dash", icon: "dashboard" },
      { href: "/client-experience", label: "Client Experience", match: "/client-experience", icon: "experience" },
      { href: "/intelligence", label: "Intelligence", match: "/intelligence", icon: "intelligence" },
      { href: "/engagement", label: "Engagement", match: "/engagement", icon: "engagement" },
    ],
  },
  {
    id: "close",
    label: "Close",
    items: [
      { href: "/upload", label: "Upload", match: "/upload", icon: "upload" },
      { href: "/close", label: "Close", match: "/close", icon: "close" },
      { href: "/exceptions", label: "Exceptions", match: "/exceptions", icon: "exceptions" },
      { href: "/reconciliations", label: "Reconciliations", match: "/reconciliations", icon: "reconciliations" },
      { href: "/documents", label: "Documents", match: "/documents", icon: "documents" },
      { href: "/integrations", label: "Integrations", match: "/integrations", icon: "integrations" },
    ],
  },
  {
    id: "advisory",
    label: "Advisory",
    items: [
      { href: "/planning", label: "Planning", match: "/planning", icon: "planning" },
      { href: "/tax", label: "Tax", match: "/tax", icon: "tax" },
      { href: "/guidance", label: "Guidance", match: "/guidance", icon: "guidance" },
    ],
  },
  {
    id: "firm",
    label: "Firm",
    items: [
      { href: "/firm", label: "Firm", match: "/firm", icon: "firm" },
      { href: "/admin", label: "Ops", match: "/admin", icon: "ops" },
      { href: "/account/security", label: "Security", match: "/account/security", icon: "security" },
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
