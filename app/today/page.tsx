import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { loadPortfolio } from "@/lib/portfolio";
import { readiness } from "@/lib/engagement";
import LogoutButton from "@/components/logout-button";

/**
 * The arrival.
 *
 * The front door used to be a filtered register — four rows of chips above a table,
 * answering "who needs attention" without ever answering "what do I do right now". A
 * partner opening this on a Tuesday morning wants one clear next action, then the option
 * to look wider.
 *
 * So this page is a briefing, not a dashboard. One line of state, then the two or three
 * things that actually need doing, each with the button that does it. Everything else is
 * a link away.
 */
export const dynamic = "force-dynamic";

const money = (n: number) => {
  const v = Math.abs(n);
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}M` : `$${v.toFixed(0)}K`;
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

type Task = {
  urgency: "now" | "soon" | "later";
  client: string; clientId: string;
  headline: string; detail: string;
  action: string; href: string;
};

export default async function Today() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "CLIENT") redirect("/portal");

  const p = loadPortfolio();
  const firstName = s.name.split(" ")[0];

  /**
   * The work, in the order it should be done.
   *
   * Deliberately capped and deliberately opinionated — a list of everything is the same
   * problem as no list. What matters is the next two or three things, each with the
   * action attached so nobody has to work out where to go.
   */
  const tasks: Task[] = [];

  for (const r of p.rows) {
    const eng = readiness(r.clientId);

    // A close that has not happened outranks everything: advice cannot run ahead of books.
    if (r.monthsBehind >= 1) {
      tasks.push({
        urgency: r.monthsBehind >= 2 ? "now" : "soon",
        client: r.name, clientId: r.clientId,
        headline: `${r.monthsBehind} month${r.monthsBehind > 1 ? "s" : ""} behind on the close`,
        detail: `Latest figures are ${r.periodLabel}. Nothing downstream moves until this does.`,
        action: "Upload the close", href: `/upload?client=${r.clientId}`,
      });
    }
    if (r.gatePass === false) {
      tasks.push({
        urgency: "now", client: r.name, clientId: r.clientId,
        headline: "The close does not tie",
        detail: "The gate is blocking publication. The numbers are not trustworthy yet.",
        action: "Review the breaks", href: `/review/${r.periodId}`,
      });
    }
    if (r.status === "IN_REVIEW" && r.gatePass !== false) {
      tasks.push({
        urgency: "soon", client: r.name, clientId: r.clientId,
        headline: `${r.periodLabel} is ready to publish`,
        detail: "It ties. It needs the commentary written and your approval.",
        action: "Write and approve", href: `/review/${r.periodId}`,
      });
    }
    // The engagement's own next step, when the client is not yet in advisory.
    if (eng.stage !== "ADVISORY" && eng.nextAction) {
      const firstOpen = eng.checks.find((c) => !c.done);
      if (firstOpen?.href) {
        tasks.push({
          urgency: "later", client: r.name, clientId: r.clientId,
          headline: `${eng.stageLabel}: ${firstOpen.label.toLowerCase()}`,
          detail: firstOpen.detail,
          action: firstOpen.action ?? "Continue", href: firstOpen.href,
        });
      }
    }
    if (r.oldestCommitmentMonths >= 3) {
      tasks.push({
        urgency: "soon", client: r.name, clientId: r.clientId,
        headline: `A commitment has been open ${r.oldestCommitmentMonths} months`,
        detail: "Follow-through is the advisory product. This one has stalled.",
        action: "Open the dashboard", href: `/dash/alerts?client=${r.clientId}`,
      });
    }
  }

  const rank = { now: 0, soon: 1, later: 2 };
  tasks.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
  const top = tasks.slice(0, 5);
  const rest = tasks.length - top.length;

  const URG = {
    now: { col: "#9E401D", label: "Now" },
    soon: { col: "#B8860B", label: "This week" },
    later: { col: "#2C504D", label: "When you can" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      {/* The brand moment. Ink, gold hairline, nothing else competing. */}
      <header style={{ background: "var(--ink)", padding: "0 0 1px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 32px 30px",
          display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--display)", fontSize: 27, letterSpacing: ".18em",
              color: "var(--paper)", lineHeight: 1 }}>HATHORN</div>
            <div style={{ fontFamily: "var(--utility)", fontSize: 8.5, fontWeight: 500,
              letterSpacing: ".3em", color: "var(--gold)", marginTop: 7 }}>ADVISORY GROUP</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
            <span className="prepared-by">{s.name}</span>
            <LogoutButton />
          </div>
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 32px 80px" }}>
        {/* One sentence of state. Not six statistics. */}
        <h1 style={{ fontFamily: "var(--display)", fontSize: 38, fontWeight: 300,
          letterSpacing: "-.015em", margin: 0, lineHeight: 1.1 }}>
          {greeting()}, {firstName}.
        </h1>
        <p style={{ fontFamily: "var(--editorial)", fontSize: 17, color: "var(--ink-soft)",
          marginTop: 12, maxWidth: 560, lineHeight: 1.55 }}>
          {tasks.length === 0
            ? `All ${p.cohort.count} clients are current and nothing is outstanding. A rare morning.`
            : tasks.filter((t) => t.urgency === "now").length > 0
              ? `${tasks.filter((t) => t.urgency === "now").length} thing${tasks.filter((t) => t.urgency === "now").length > 1 ? "s need" : " needs"} you today, across ${p.cohort.count} clients.`
              : `Nothing urgent. ${tasks.length} item${tasks.length > 1 ? "s" : ""} to work through when you can.`}
        </p>

        {/* The work. Each row carries the button that does it. */}
        <div style={{ marginTop: 40 }}>
          {top.length === 0 ? (
            <div className="today-empty">
              <div style={{ fontFamily: "var(--display)", fontSize: 22 }}>Nothing outstanding</div>
              <p className="caption" style={{ marginTop: 8, maxWidth: 400 }}>
                Every close is current, everything ties, and no commitment has stalled.
              </p>
            </div>
          ) : top.map((t, i) => (
            <div key={i} className="today-row">
              <div style={{ width: 3, background: URG[t.urgency].col, alignSelf: "stretch" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="today-when" style={{ color: URG[t.urgency].col }}>{URG[t.urgency].label}</div>
                <div className="today-head">{t.headline}</div>
                <div className="today-client">{t.client}</div>
                <p className="today-detail">{t.detail}</p>
              </div>
              <Link href={t.href} className="btn today-btn">{t.action}</Link>
            </div>
          ))}
          {rest > 0 && (
            <Link href="/portfolio" className="linkish" style={{ display: "inline-block", marginTop: 16 }}>
              {rest} more across the book →
            </Link>
          )}
        </div>

        {/* Everywhere else. Named plainly, not hidden behind icons. */}
        <div style={{ marginTop: 56, paddingTop: 26, borderTop: "1px solid var(--hairline)" }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Go to</div>
          <div className="today-links">
            {[
              ["The book", "/portfolio", `All ${p.cohort.count} clients ranked by urgency`],
              ["Clients", "/clients", "Add, remove, and set up a client"],
              ["Upload a close", "/upload", "Bring in this month's documents"],
              ["Client dashboard", "/dash", "Walk a single client's month"],
            ].map(([label, href, sub]) => (
              <Link key={href} href={href} className="today-link">
                <div className="today-link-t">{label}</div>
                <div className="caption">{sub}</div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
