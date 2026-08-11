"use client";

/**
 * Scroll chrome.
 *
 * Publishes two facts to the document so CSS can react without re-rendering the
 * tree: whether the page has left the top (the top bar compresses and grows a
 * hairline) and how far through it we are (the gold progress line). Also offers
 * a return-to-top once the fold is well behind you.
 */

import { useEffect, useState } from "react";

export default function StaffScroll() {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      root.dataset.scrolled = y > 8 ? "true" : "false";
      root.style.setProperty("--scroll-p", String(Math.min(1, y / max)));
      setPast(y > window.innerHeight * 0.75);
    };

    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measure); };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      delete root.dataset.scrolled;
      root.style.removeProperty("--scroll-p");
    };
  }, []);

  return (
    <button
      type="button"
      className="to-top"
      data-show={past ? "true" : "false"}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 13V4M4.6 7.4 8 4l3.4 3.4" />
      </svg>
      <span className="sr-only">Back to top</span>
    </button>
  );
}
