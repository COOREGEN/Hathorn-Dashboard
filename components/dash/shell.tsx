"use client";
/**
 * The application shell.
 *
 * Navigation is real routing, not view state. A link to a specific month of a specific
 * client on the Cash view is a URL you can send to Jeremiah — which is the difference
 * between a dashboard you can use in a meeting and one you have to drive live.
 *
 * The rail is staff-facing. Clients never see this; they get the statement at /portal,
 * which is a document rather than a tool.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const NAV: { group: string; items: { href: string; label: string; icon: string; badge?: boolean }[] }[] = [
  {
    group: "Client",
    items: [
      { href: "/dash", label: "Overview", icon: "M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z" },
      { href: "/dash/financials", label: "Financials", icon: "M3 3v18h18M7 15l4-5 3 3 5-7" },
      { href: "/dash/businesses", label: "Businesses", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" },
      { href: "/dash/cash", label: "Cash", icon: "M2 7h20v12H2zM2 11h20M6 15h4" },
      { href: "/dash/volume", label: "Volume", icon: "M3 3v18h18M8 17V9M13 17V5M18 17v-6" },
      { href: "/dash/management", label: "Management Basis", icon: "M3 12h4l3-9 4 18 3-9h4" },
    ],
  },
  {
    group: "Analysis",
    items: [
      { href: "/dash/metrics", label: "Metrics", icon: "M3 3v18h18M7 14l3-3 3 3 5-6" },
      { href: "/dash/comparison", label: "Comparison", icon: "M9 3v18M15 3v18M3 9h18M3 15h18" },
      { href: "/dash/alerts", label: "Alerts", icon: "M12 2a7 7 0 0 0-7 7c0 6-3 7-3 7h20s-3-1-3-7a7 7 0 0 0-7-7M10 21h4", badge: true },
      { href: "/dash/reports", label: "Reports", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" },
      { href: "/dash/vendors", label: "Vendors", icon: "M3 6h18l-2 13H5zM8 6V4a4 4 0 0 1 8 0v2" },
    ],
  },
  {
    group: "Practice",
    items: [
      { href: "/today", label: "Today", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
      { href: "/ask", label: "Ask Hathorn", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
      { href: "/portfolio", label: "Attention", icon: "M3 3v18h18M7 16l4-4 3 2 5-6" },
      { href: "/clients", label: "Clients", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
      { href: "/upload", label: "Upload", icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" },
      { href: "/documents", label: "Documents", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" },
      { href: "/tax", label: "Tax", icon: "M4 6h16M4 12h10M4 18h14" },
      { href: "/guidance", label: "Guidance", icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2zM8 7h8M8 11h8M8 15h5" },
      { href: "/reconciliations", label: "Reconciliations", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
      { href: "/integrations", label: "Integrations", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
      { href: "/close", label: "Close", icon: "M9 11l3 3L22 4M4 20h16" },
      { href: "/exceptions", label: "Exceptions", icon: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" },
      { href: "/planning", label: "Planning", icon: "M3 3v18h18M7 16l3-3 3 2 5-7" },
      { href: "/engagement", label: "Engagement", icon: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.0l-3-3" },
      { href: "/admin", label: "Firm", icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" },
      { href: "/dash/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z" },
    ],
  },
];

export type ShellProps = {
  clientName: string;
  clients: { id: string; name: string }[];
  clientId: string;
  periods: { periodId: string; label: string; status: string }[];
  periodId: string;
  entities: { id: string; name: string }[];
  entity: string;
  mode: string;
  confidence: { overall: number; band: string; components: { name: string; score: number; detail: string }[] } | null;
  alertCount: number;
  userName: string;
  title: string;
  subtitle: string;
  showFilters?: boolean;
  children: React.ReactNode;
};

const MODES = [
  ["PRIOR_MONTH", "vs Prior month"],
  ["PRIOR_YEAR", "vs Same month last year"],
  ["YTD", "vs Year to date"],
  ["BUDGET", "vs Budget"],
  ["NONE", "No comparison"],
];

export default function Shell(p: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [railOpen, setRailOpen] = useState(false);
  const [confOpen, setConfOpen] = useState(false);

  /** Every control writes to the URL, so the view is always linkable. */
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const href = (base: string) => {
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };

  const dot = p.confidence
    ? p.confidence.band === "high" ? "#4E8C6A"
      : p.confidence.band === "moderate" ? "var(--gold-deep)" : "var(--accent-text)"
    : "var(--ink-mute)";

  return (
    <div className="app">
      <aside className={`rail${railOpen ? " open" : ""}`}>
        <div className="rail-brand">
          <Link href="/" className="rail-mark" aria-label="Hathorn Ledger home"
            style={{ textDecoration: "none", color: "inherit" }}>
            <div className="rail-badge">H</div>
            <div>
              <div className="rail-name">HATHORN</div>
              <div className="rail-sub">Ledger</div>
            </div>
          </Link>
        </div>

        {NAV.map((g) => (
          <div key={g.group}>
            <div className="rail-section"><div className="eyebrow">{g.group}</div></div>
            <ul className="nav">
              {g.items.map((it) => {
                const on = it.href === "/dash" ? pathname === "/dash" : pathname.startsWith(it.href);
                return (
                  <li key={it.href}>
                    <Link href={href(it.href)} className={on ? "on" : ""} onClick={() => setRailOpen(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeLinecap="round" strokeLinejoin="round"><path d={it.icon} /></svg>
                      {it.label}
                      {it.badge && p.alertCount > 0 && <span className="count">{p.alertCount}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="rail-foot">
          <div className="eyebrow">Signed in</div>
          <div className="rail-client">{p.userName}</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="burger" onClick={() => setRailOpen((v) => !v)} aria-label="Menu">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div>
            <h1>{p.title}</h1>
            <p>{p.subtitle}</p>
          </div>

          <div className="top-actions">
            {p.clients.length > 1 && (
              <select className="select" value={p.clientId} aria-label="Client"
                onChange={(e) => setParam("client", e.target.value)}>
                {p.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}

            <select className="select" value={p.periodId} aria-label="Reporting period"
              onChange={(e) => setParam("month", e.target.value)}>
              {p.periods.map((x) => (
                <option key={x.periodId} value={x.periodId}>
                  {x.label}{x.status !== "PUBLISHED" ? " — draft" : ""}
                </option>
              ))}
            </select>

            {p.showFilters !== false && (
              <select className="select" value={p.mode} aria-label="Compare against"
                onChange={(e) => setParam("mode", e.target.value)}>
                {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}

            {p.confidence && (
              <button className="quality" onClick={() => setConfOpen((v) => !v)}
                title={p.confidence.components.find((c) => c.score < 80)?.detail ?? "Evidence is complete"}>
                <span className="dot" style={{ background: dot }} />
                <span className="tnum">{p.confidence.overall}% confidence</span>
              </button>
            )}

            <div className="avatar">{p.userName.charAt(0).toUpperCase()}</div>
          </div>
        </header>

        <div className="content">
          {p.confidence && confOpen && (
            <div className="card" style={{ marginBottom: 26 }}>
              <div className="card-t">How far to trust this period</div>
              <div className="card-s">
                Confidence describes the evidence, not the performance. The figures are never
                adjusted — a weak month with strong books still reads weak.
              </div>
              <div className="grid g3" style={{ marginTop: 14, gap: "0 26px" }}>
                {p.confidence.components.map((c) => {
                  const col = c.score >= 80 ? "var(--brand)" : c.score >= 55 ? "var(--gold-deep)" : "var(--accent-text)";
                  return (
                    <div key={c.name} className="conf-row">
                      <div className="conf-h"><span>{c.name}</span>
                        <span className="tnum" style={{ color: col }}>{c.score}</span></div>
                      <div className="conf-track"><div style={{ height: 3, width: `${c.score}%`, background: col }} /></div>
                      <p className="caption" style={{ marginTop: 6 }}>{c.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {p.showFilters !== false && p.entities.length > 0 && (
            <div className="pills">
              <button className={`pill${p.entity === "ALL" ? " on" : ""}`}
                onClick={() => setParam("entity", "ALL")}>Consolidated</button>
              {p.entities.map((e) => (
                <button key={e.id} className={`pill${p.entity === e.id ? " on" : ""}`}
                  onClick={() => setParam("entity", e.id)}>{e.name}</button>
              ))}
            </div>
          )}

          {p.children}
        </div>
      </div>
    </div>
  );
}
