"use client";

/**
 * Left practice rail.
 *
 * Ink surface, gold indicator, monoline glyphs. Collapses to glyphs on demand
 * (remembered per browser) and becomes an off-canvas drawer under 960px, so the
 * whole module set stays one reach away without a footer dump.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { STAFF_NAV, staffNavActive } from "@/lib/staff-nav";
import StaffIcon from "@/components/staff-icons";

const COLLAPSE_KEY = "hathorn.rail.collapsed";

export default function StaffRail({
  role,
}: {
  role?: string;
}) {
  const pathname = usePathname() || "/today";
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSE_KEY) === "1";
    setCollapsed(saved);
    document.documentElement.dataset.rail = saved ? "collapsed" : "open";
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      document.documentElement.dataset.rail = next ? "collapsed" : "open";
      return next;
    });
  }, []);

  // A drawer that survives navigation is a drawer covering the page you asked for.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.documentElement.dataset.railDrawer = open ? "open" : "closed";
    return () => { document.documentElement.dataset.railDrawer = "closed"; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const showUpload = !role || role === "ADMIN" || role === "ADVISOR" || role === "BOOKKEEPER";
  const showOps = !role || role === "ADMIN" || role === "ADVISOR";

  const groups = STAFF_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (role === "BOOKKEEPER") {
        const blocked = [
          "/admin", "/portfolio", "/intelligence", "/client-experience",
          "/engagement", "/planning", "/tax", "/guidance",
        ];
        if (blocked.includes(item.href)) return false;
      }
      if ((item.href === "/upload" || item.href === "/close") && !showUpload) return false;
      if (item.href === "/firm" && !showOps && role === "CLIENT") return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <button
        type="button"
        className="staff-rail-burger"
        aria-expanded={open}
        aria-controls="staff-rail"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="staff-burger-bars" aria-hidden="true" />
        <span className="sr-only">{open ? "Close navigation" : "Open navigation"}</span>
      </button>

      <div
        className="staff-rail-scrim"
        hidden={!open}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="staff-rail"
        className="staff-rail"
        aria-label="Practice navigation"
        data-collapsed={collapsed ? "true" : "false"}
        data-open={open ? "true" : "false"}
      >
        <div className="staff-rail-inner">
          <div className="staff-rail-brand">
            <Link href="/today" className="staff-rail-mark">
              <span className="staff-rail-mark-h">Hathorn</span>
              <span className="staff-rail-mark-s">Dashboard</span>
            </Link>
            <button
              type="button"
              className="staff-rail-collapse"
              onClick={toggleCollapsed}
              aria-pressed={collapsed}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={collapsed ? "M6 4l4 4-4 4" : "M10 4L6 8l4 4"} />
              </svg>
              <span className="sr-only">{collapsed ? "Expand navigation" : "Collapse navigation"}</span>
            </button>
          </div>

          <nav className="staff-rail-nav">
            {groups.map((group) => (
              <div key={group.id} className="staff-rail-group">
                <div className="staff-rail-group-label">{group.label}</div>
                <ul className="staff-rail-list">
                  {group.items.map((item) => {
                    const active = staffNavActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`staff-rail-link${active ? " is-active" : ""}`}
                          aria-current={active ? "page" : undefined}
                          title={item.label}
                        >
                          <StaffIcon name={item.icon} />
                          <span className="staff-rail-text">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="staff-rail-foot">
            <span className="staff-rail-foot-k">⌘K</span>
            <span className="staff-rail-text">Jump to anything</span>
          </div>
        </div>
      </aside>
    </>
  );
}
