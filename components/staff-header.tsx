import BrandMark from "@/components/brand-mark";
import LogoutButton from "@/components/logout-button";
import StaffRail from "@/components/staff-rail";
import Link from "next/link";

/**
 * Shared staff chrome — left practice rail + short top bar.
 *
 * Full module set lives in the rail (GHL-style placement, Hathorn type).
 * Top bar keeps only the page context, user, and one or two shortcuts.
 */
const TOP_LINKS = [
  { href: "/today", label: "Today" },
  { href: "/ask", label: "Ask" },
] as const;

export default function StaffHeader({
  sub,
  maxWidth = 1080,
  userName,
  role,
  links,
  children,
}: {
  sub: string;
  maxWidth?: number | string;
  userName?: string;
  role?: string;
  /** Extra right-side links beyond the short top set. */
  links?: { href: string; label: string }[];
  /** When provided, wraps page content in the staff shell. */
  children?: React.ReactNode;
}) {
  const top = [...TOP_LINKS, ...(links || [])];

  const chrome = (
    <>
      <StaffRail role={role} />
      <header className="masthead staff-masthead">
        <div className="masthead-inner" style={{ maxWidth }}>
          <BrandMark href="/today" tone="ink" sub={sub} />
          <nav
            aria-label="Shortcuts"
            className="ml-auto flex items-center flex-wrap"
            style={{ justifyContent: "flex-end", gap: "10px 18px" }}
          >
            {top.map((l) => (
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
    </>
  );

  if (children) {
    return (
      <div className="staff-app">
        {chrome}
        <div className="staff-app-main">{children}</div>
      </div>
    );
  }

  return (
    <div className="staff-app staff-app--header-only">
      {chrome}
    </div>
  );
}
