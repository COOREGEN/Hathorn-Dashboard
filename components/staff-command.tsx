"use client";

/**
 * Jump-to palette — ⌘K / Ctrl-K.
 *
 * Navigation only. It moves you between destinations the rail already contains;
 * it does not query client data, because a search box over financials invites
 * exactly the self-service analytics the product deliberately does not offer.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { STAFF_NAV } from "@/lib/staff-nav";
import StaffIcon from "@/components/staff-icons";

const OPEN_EVENT = "hathorn:command-open";

export function CommandTrigger() {
  return (
    <button
      type="button"
      className="topbar-search"
      title="Jump to — ⌘K, Ctrl-K or /"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3 3" />
      </svg>
      <span className="topbar-search-label">Jump to</span>
      <kbd className="topbar-kbd">⌘K</kbd>
    </button>
  );
}

export default function StaffCommand({ role }: { role?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => {
    const blocked = role === "BOOKKEEPER"
      ? ["/admin", "/portfolio", "/intelligence", "/client-experience", "/engagement", "/planning", "/tax", "/guidance"]
      : [];
    return STAFF_NAV.flatMap((group) =>
      group.items
        .filter((item) => !blocked.includes(item.href))
        .map((item) => ({ ...item, group: group.label })));
  }, [role]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      e.label.toLowerCase().includes(q) || e.group.toLowerCase().includes(q));
  }, [entries, query]);

  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Chrome claims Ctrl-K for its address bar whenever the page has not got
      // the keystroke first, so "/" is offered as the shortcut that always lands.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) { setQuery(""); setCursor(0); return; }
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="Jump to">
      <div className="cmdk-scrim" onClick={() => setOpen(false)} />
      <div className="cmdk-panel">
        <div className="cmdk-field">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3 3" />
          </svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Jump to a destination"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setOpen(false); return; }
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === "Enter" && results[cursor]) { e.preventDefault(); go(results[cursor].href); }
            }}
          />
          <kbd className="topbar-kbd">esc</kbd>
        </div>
        <ul className="cmdk-list">
          {!results.length && <li className="cmdk-empty">Nothing matches that.</li>}
          {results.map((r, i) => (
            <li key={r.href}>
              <button
                type="button"
                className={`cmdk-row${i === cursor ? " is-cursor" : ""}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(r.href)}
              >
                <StaffIcon name={r.icon} />
                <span className="cmdk-row-label">{r.label}</span>
                <span className="cmdk-row-group">{r.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
