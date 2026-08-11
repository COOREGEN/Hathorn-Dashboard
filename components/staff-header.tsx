import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import StaffRail from "@/components/staff-rail";
import StaffScroll from "@/components/staff-scroll";
import StaffCommand, { CommandTrigger } from "@/components/staff-command";

/**
 * Shared staff chrome — left practice rail, quiet top bar.
 *
 * The rail owns the wordmark and every destination. The top bar is context and
 * identity only: where you are, how to jump, who you are. It sits on the paper
 * rather than on a black slab, so the page reads as one surface and the eye goes
 * to the figures instead of the furniture.
 */
const TOP_LINKS = [
  { href: "/today", label: "Today" },
  { href: "/ask", label: "Ask" },
] as const;

function initials(name?: string) {
  if (!name) return "H";
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "H";
}

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
  const crumbs = sub.split("·").map((s) => s.trim()).filter(Boolean);

  const chrome = (
    <>
      <StaffRail role={role} />
      <StaffCommand role={role} />
      <StaffScroll />
      <header className="staff-topbar">
        <div className="staff-topbar-inner" style={{ maxWidth }}>
          <nav aria-label="Breadcrumb" className="topbar-crumbs">
            {crumbs.map((c, i) => (
              <span key={c + i} className="topbar-crumb" data-last={i === crumbs.length - 1}>
                {i > 0 && <span className="topbar-crumb-sep" aria-hidden="true">/</span>}
                {i === crumbs.length - 1 ? c : <Link href="/today">{c}</Link>}
              </span>
            ))}
          </nav>

          <div className="topbar-right">
            <CommandTrigger />
            <span className="topbar-divider" aria-hidden="true" />
            <nav aria-label="Shortcuts" className="topbar-links">
              {top.map((l) => (
                <Link key={l.href + l.label} href={l.href} className="topbar-link">
                  {l.label}
                </Link>
              ))}
            </nav>
            {userName && (
              <span className="topbar-user" title={role ? `${userName} · ${role}` : userName}>
                <span className="topbar-avatar" aria-hidden="true">{initials(userName)}</span>
                <span className="topbar-user-text">
                  <span className="topbar-user-name">{userName}</span>
                  {role && <span className="topbar-user-role">{role}</span>}
                </span>
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
        <span className="staff-progress" aria-hidden="true" />
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
