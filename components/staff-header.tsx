import BrandMark from "@/components/brand-mark";
import LogoutButton from "@/components/logout-button";
import Link from "next/link";

/**
 * Shared staff chrome — dark masthead, clickable mark, consistent destinations.
 *
 * Primary masthead stays short so hierarchy is readable. Full module set lives on
 * Today’s practice footer and the dashboard rail — not duplicated as 17 top links.
 *
 * Naming (deliberate — these used to collide as "The Book"):
 *   Attention → /portfolio (who needs you)
 *   Clients   → /clients
 *   Firm      → /firm (profile, branding, team) · Ops → /admin
 */
const PRIMARY_NAV = [
  { href: "/", label: "Today" },
  { href: "/ask", label: "Ask Hathorn" },
  { href: "/portfolio", label: "Attention" },
  { href: "/clients", label: "Clients" },
  { href: "/close", label: "Close" },
  { href: "/documents", label: "Documents" },
  { href: "/upload", label: "Upload" },
  { href: "/firm", label: "Firm" },
  { href: "/admin", label: "Ops" },
] as const;

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
  const nav = [...PRIMARY_NAV, ...(links || [])];

  return (
    <header className="masthead">
      <div className="masthead-inner" style={{ maxWidth }}>
        <BrandMark href="/" tone="ink" sub={sub} />
        <nav
          aria-label="Practice"
          className="ml-auto flex items-center flex-wrap"
          style={{ justifyContent: "flex-end", gap: "10px 18px" }}
        >
          {nav.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              className="prepared-by"
              style={{ textDecoration: "none" }}
            >
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
