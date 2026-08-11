"use client";

/**
 * Left practice rail — GHL-style placement, Hathorn craft.
 * Grouped destinations; no pill chrome, no page fills.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STAFF_NAV, staffNavActive } from "@/lib/staff-nav";

export default function StaffRail({
  role,
}: {
  role?: string;
}) {
  const pathname = usePathname() || "/today";
  const showOps = !role || role === "ADMIN" || role === "ADVISOR";
  const showUpload = !role || role === "ADMIN" || role === "ADVISOR" || role === "BOOKKEEPER";

  return (
    <aside className="staff-rail" aria-label="Practice navigation">
      <div className="staff-rail-inner">
        <div className="staff-rail-brand">
          <Link href="/today" className="staff-rail-mark" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="staff-rail-mark-h">Hathorn</span>
            <span className="staff-rail-mark-s">Dashboard</span>
          </Link>
        </div>

        <nav className="staff-rail-nav">
          {STAFF_NAV.map((group) => {
            const items = group.items.filter((item) => {
              if (item.href === "/admin" && role === "BOOKKEEPER") return false;
              if (item.href === "/portfolio" && role === "BOOKKEEPER") return false;
              if (item.href === "/intelligence" && role === "BOOKKEEPER") return false;
              if (item.href === "/client-experience" && role === "BOOKKEEPER") return false;
              if (item.href === "/engagement" && role === "BOOKKEEPER") return false;
              if (item.href === "/planning" && role === "BOOKKEEPER") return false;
              if (item.href === "/tax" && role === "BOOKKEEPER") return false;
              if (item.href === "/guidance" && role === "BOOKKEEPER") return false;
              if (item.href === "/ask" && role === "BOOKKEEPER") return true;
              if ((item.href === "/upload" || item.href === "/close") && !showUpload) return false;
              if (item.href === "/firm" && !showOps && role === "CLIENT") return false;
              return true;
            });
            if (!items.length) return null;
            return (
              <div key={group.id} className="staff-rail-group">
                <div className="staff-rail-group-label">{group.label}</div>
                <ul className="staff-rail-list">
                  {items.map((item) => {
                    const active = staffNavActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`staff-rail-link${active ? " is-active" : ""}`}
                          aria-current={active ? "page" : undefined}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
