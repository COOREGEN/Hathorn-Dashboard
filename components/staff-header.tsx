import BrandMark from "@/components/brand-mark";
import LogoutButton from "@/components/logout-button";
import Link from "next/link";

/**
 * Shared staff chrome — dark masthead, clickable mark, consistent destinations.
 *
 * Naming (deliberate — these used to collide as "The Book"):
 *   Attention → /portfolio (who needs you)
 *   Clients   → /clients
 *   Firm      → /firm (profile, branding, team) · Ops → /admin
 */
export default function StaffHeader({
  sub,
  maxWidth = 1080,
  userName,
  role,
  links,
}: {
  sub: string;
  maxWidth?: number | string;
  userName?: string;
  role?: string;
  /** Extra right-side links beyond the standard set. */
  links?: { href: string; label: string }[];
}) {
  const nav = [
    { href: "/", label: "Today" },
    { href: "/ask", label: "Ask Hathorn" },
    { href: "/intelligence", label: "Intelligence" },
    { href: "/portfolio", label: "Attention" },
    { href: "/clients", label: "Clients" },
    { href: "/planning", label: "Planning" },
    { href: "/documents", label: "Documents" },
    { href: "/tax", label: "Tax" },
    { href: "/guidance", label: "Guidance" },
    { href: "/reconciliations", label: "Reconciliations" },
    { href: "/integrations", label: "Integrations" },
    { href: "/close", label: "Close" },
    { href: "/exceptions", label: "Exceptions" },
    { href: "/upload", label: "Upload" },
    { href: "/firm", label: "Firm" },
    ...(links || []),
  ];

  return (
    <header className="masthead">
      <div className="masthead-inner" style={{ maxWidth }}>
        <BrandMark href="/" tone="ink" sub={sub} />
        <nav aria-label="Practice" className="ml-auto flex items-center gap-4 flex-wrap"
          style={{ justifyContent: "flex-end" }}>
          {nav.map((l) => (
            <Link key={l.href + l.label} href={l.href} className="prepared-by"
              style={{ textDecoration: "none" }}>
              {l.label}
            </Link>
          ))}
          {userName && (
            <span className="prepared-by">
              {userName}{role ? ` · ${role}` : ""}
            </span>
          )}
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
