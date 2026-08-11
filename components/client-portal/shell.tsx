"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/logout-button";

export type PortalNavItem = {
  href: string;
  label: string;
  enabled?: boolean;
};

export type PortalStaffChrome = {
  homeHref: string;
  homeLabel: string;
  exitPreviewHref: string;
  exitPreviewLabel: string;
  clientHref: string;
  clientLabel: string;
};

export default function ClientPortalShell({
  brand,
  clientName,
  periodLabel,
  nav,
  children,
  preview,
  staffChrome,
}: {
  brand: {
    firmName: string;
    clientPortalName: string;
    logoText: string | null;
    brandPrimary: string;
    brandAccent: string;
    showPlatformMark: boolean;
  };
  clientName: string;
  periodLabel?: string | null;
  nav: PortalNavItem[];
  children: React.ReactNode;
  preview?: boolean;
  /** Staff-only escape hatches — never shown to CLIENT users. */
  staffChrome?: PortalStaffChrome | null;
}) {
  const pathname = usePathname();
  const items = nav.filter((n) => n.enabled !== false);
  const staff = !!staffChrome;

  return (
    <div
      className="client-portal"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F7F5F1 0%, #F1EDE6 48%, #EBE6DD 100%)",
        ["--brand" as string]: brand.brandPrimary,
        ["--accent" as string]: brand.brandAccent,
      }}
    >
      {preview && staffChrome && (
        <div
          className="no-print"
          style={{
            background: "#2C504D",
            color: "#F7F5F1",
            padding: "10px 16px",
            fontFamily: "var(--utility)",
            fontSize: 12,
            letterSpacing: "0.04em",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ textTransform: "uppercase" }}>
            Preview as client — staff view using client visibility rules
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link
              href={staffChrome.exitPreviewHref}
              style={{
                color: "#2C504D",
                background: "#F7F5F1",
                textDecoration: "none",
                padding: "6px 12px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontSize: 11,
              }}
            >
              {staffChrome.exitPreviewLabel}
            </Link>
            <Link
              href={staffChrome.homeHref}
              style={{
                color: "#F7F5F1",
                border: "1px solid rgba(247,245,241,0.55)",
                textDecoration: "none",
                padding: "6px 12px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontSize: 11,
              }}
            >
              {staffChrome.homeLabel}
            </Link>
          </span>
        </div>
      )}
      <header
        style={{
          borderBottom: "1px solid rgba(44,80,77,0.12)",
          background: "rgba(247,245,241,0.92)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          className="sheet"
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "18px 20px 0",
            display: "grid",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--brand)" }}>
                {brand.logoText || brand.firmName}
                {brand.clientPortalName ? ` · ${brand.clientPortalName}` : ""}
              </div>
              <h1
                className="display-m"
                style={{ margin: "4px 0 0", fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.05 }}
              >
                {clientName}
              </h1>
              {periodLabel && (
                <p className="prepared-by" style={{ marginTop: 6 }}>
                  Published results · {periodLabel}
                </p>
              )}
            </div>
            <div
              className="no-print"
              style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "flex-end" }}
            >
              {staff && staffChrome && (
                <>
                  <Link
                    href={staffChrome.homeHref}
                    className="prepared-by"
                    style={{ textDecoration: "none", color: "var(--ink)", fontWeight: 600 }}
                  >
                    ← {staffChrome.homeLabel}
                  </Link>
                  {preview && (
                    <Link
                      href={staffChrome.exitPreviewHref}
                      className="prepared-by"
                      style={{ textDecoration: "none", color: "var(--gold-deep)", fontWeight: 600 }}
                    >
                      {staffChrome.exitPreviewLabel}
                    </Link>
                  )}
                  <Link
                    href={staffChrome.clientHref}
                    className="prepared-by"
                    style={{ textDecoration: "none" }}
                  >
                    {staffChrome.clientLabel}
                  </Link>
                </>
              )}
              {!staff && brand.showPlatformMark && (
                <span className="prepared-by" style={{ fontSize: 11 }}>Hathorn Dashboard</span>
              )}
              <LogoutButton />
            </div>
          </div>
          <nav
            aria-label="Client portal"
            className="no-print"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              borderTop: "1px solid rgba(44,80,77,0.1)",
              paddingTop: 10,
              paddingBottom: 10,
            }}
          >
            {items.map((item) => {
              const pathOnly = item.href.split("?")[0];
              const active = pathname === pathOnly
                || (pathOnly !== "/portal" && pathname.startsWith(pathOnly));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontFamily: "var(--utility)",
                    fontSize: 12,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    color: active ? "var(--brand)" : "#6E675B",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    padding: "8px 10px",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="sheet" style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 72px" }}>
        {children}
      </main>
    </div>
  );
}
