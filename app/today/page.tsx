import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveActiveFirmId } from "@/lib/tenancy";
import { loadPortfolio } from "@/lib/portfolio";
import { readiness } from "@/lib/engagement";
import StaffHeader from "@/components/staff-header";

/**
 * The arrival — a briefing, not a register.
 *
 * One next action. A short queue beneath it.
 * Practice destinations live in the left rail — not a footer dump.
 */
export const dynamic = "force-dynamic";

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

  const p = loadPortfolio({}, new Date(), resolveActiveFirmId(s));
  const firstName = s.name.split(" ")[0];

  const tasks: Task[] = [];

  for (const r of p.rows) {
    const eng = readiness(r.clientId);

    if (r.monthsBehind >= 1) {
      tasks.push({
        urgency: r.monthsBehind >= 2 ? "now" : "soon",
        client: r.name, clientId: r.clientId,
        headline: `${r.monthsBehind} month${r.monthsBehind > 1 ? "s" : ""} behind on the close`,
        detail: `Latest figures are ${r.periodLabel}.`,
        action: "Upload the close", href: `/upload?client=${r.clientId}`,
      });
    }
    if (r.gatePass === false) {
      tasks.push({
        urgency: "now", client: r.name, clientId: r.clientId,
        headline: "The close does not tie",
        detail: "The gate is blocking publication.",
        action: "Review the breaks", href: `/review/${r.periodId}`,
      });
    }
    if (r.status === "IN_REVIEW" && r.gatePass !== false) {
      tasks.push({
        urgency: "soon", client: r.name, clientId: r.clientId,
        headline: `${r.periodLabel} is ready to publish`,
        detail: "It ties. Write the commentary and approve.",
        action: "Write and approve", href: `/review/${r.periodId}`,
      });
    }
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
        headline: `Commitment open ${r.oldestCommitmentMonths} months`,
        detail: "Follow-through has stalled.",
        action: "Open alerts", href: `/dash/alerts?client=${r.clientId}`,
      });
    }
  }

  const rank = { now: 0, soon: 1, later: 2 };
  tasks.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
  const primary = tasks[0] ?? null;
  const queue = tasks.slice(1, 4);
  const more = Math.max(0, tasks.length - 1 - queue.length);
  const urgentCount = tasks.filter((t) => t.urgency === "now").length;

  const URG = {
    now: { col: "#9E401D", label: "Now" },
    soon: { col: "#B8860B", label: "This week" },
    later: { col: "#2C504D", label: "When you can" },
  };

  return (
    <StaffHeader
      sub="Dashboard · Today"
      maxWidth={880}
      userName={s.name}
      role={s.role}
    >
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 32px 88px" }}>
        <p className="eyebrow" style={{ marginBottom: 14 }}>Today</p>
        <h1 style={{ fontFamily: "var(--display)", fontSize: 40, fontWeight: 300,
          letterSpacing: "-.015em", margin: 0, lineHeight: 1.08 }}>
          {greeting()}, {firstName}.
        </h1>
        <p style={{ fontFamily: "var(--editorial)", fontSize: 18, color: "var(--ink-soft)",
          marginTop: 14, maxWidth: 480, lineHeight: 1.55 }}>
          {tasks.length === 0
            ? `All ${p.cohort.count} clients are current. Nothing outstanding.`
            : urgentCount > 0
              ? `${urgentCount} need${urgentCount === 1 ? "s" : ""} you today.`
              : `${tasks.length} item${tasks.length === 1 ? "" : "s"} when you have a moment.`}
        </p>

        <section style={{ marginTop: 48 }}>
          {!primary ? (
            <div style={{ padding: "36px 0", borderTop: "1px solid var(--hairline)" }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 24, fontWeight: 300 }}>
                Nothing waiting
              </div>
              <p className="caption" style={{ marginTop: 8, maxWidth: 380 }}>
                Every close is current and no commitment has stalled.
              </p>
            </div>
          ) : (
            <div style={{ borderTop: "1px solid var(--ink)", paddingTop: 28 }}>
              <div className="eyebrow" style={{ color: URG[primary.urgency].col, marginBottom: 10 }}>
                Next · {URG[primary.urgency].label}
              </div>
              <div style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 300,
                lineHeight: 1.2, maxWidth: 560 }}>
                {primary.headline}
              </div>
              <div style={{ fontFamily: "var(--utility)", fontSize: 11, letterSpacing: ".08em",
                textTransform: "uppercase", color: "var(--ink-mute)", marginTop: 10 }}>
                {primary.client}
              </div>
              <p style={{ fontFamily: "var(--editorial)", fontSize: 16, color: "var(--ink-soft)",
                marginTop: 12, maxWidth: 480, lineHeight: 1.5 }}>
                {primary.detail}
              </p>
              <Link href={primary.href} className="btn" style={{ marginTop: 22, display: "inline-block" }}>
                {primary.action}
              </Link>
            </div>
          )}
        </section>

        {queue.length > 0 && (
          <section style={{ marginTop: 44 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Also</div>
            {queue.map((t, i) => (
              <Link key={i} href={t.href} className="home-queue-row">
                <span className="home-queue-when" style={{ color: URG[t.urgency].col }}>
                  {URG[t.urgency].label}
                </span>
                <span className="home-queue-head">{t.headline}</span>
                <span className="home-queue-client">{t.client}</span>
                <span className="home-queue-go">→</span>
              </Link>
            ))}
            {more > 0 && (
              <Link href="/portfolio" className="linkish" style={{ display: "inline-block", marginTop: 14 }}>
                {more} more in the book →
              </Link>
            )}
          </section>
        )}
      </main>
    </StaffHeader>
  );
}
