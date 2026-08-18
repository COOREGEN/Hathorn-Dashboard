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
  const clientsWaiting = new Set(tasks.map((t) => t.clientId)).size;

  // Counted from the same rows the queue is built from — never a decorative figure.
  const glance = [
    { label: "Clients in the book", value: p.cohort.count },
    { label: "Waiting on you", value: clientsWaiting },
    { label: "Needs today", value: urgentCount },
  ];

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
      <main className="today">
        <header className="today-hero">
          <p className="eyebrow">Today · {new Date().toLocaleDateString("en-US",
            { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="today-greeting">
            {greeting()}, {firstName}.
          </h1>
          <p className="today-lede">
            {tasks.length === 0
              ? `All ${p.cohort.count} clients are current. Nothing outstanding.`
              : urgentCount > 0
                ? `${urgentCount} need${urgentCount === 1 ? "s" : ""} you today.`
                : `${tasks.length} item${tasks.length === 1 ? "" : "s"} when you have a moment.`}
          </p>

          <dl className="today-glance">
            {glance.map((g) => (
              <div key={g.label} className="today-glance-cell">
                <dt className="today-glance-label">{g.label}</dt>
                <dd className="today-glance-value tnum">{g.value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <section className="today-next reveal">
          {!primary ? (
            <div className="today-card today-card--calm">
              <div className="eyebrow">Clear</div>
              <div className="today-next-head">Nothing waiting</div>
              <p className="today-next-detail">
                Every close is current and no commitment has stalled.
              </p>
            </div>
          ) : (
            <div className="today-card" data-urgency={primary.urgency}>
              <div className="today-next-mark">
                <span className="today-dot" style={{ background: URG[primary.urgency].col }} aria-hidden="true" />
                <span className="eyebrow" style={{ color: URG[primary.urgency].col }}>
                  Next · {URG[primary.urgency].label}
                </span>
              </div>
              <div className="today-next-head">{primary.headline}</div>
              <div className="today-next-client">{primary.client}</div>
              <p className="today-next-detail">{primary.detail}</p>
              <Link href={primary.href} className="btn btn-arrow">
                {primary.action}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </section>

        {queue.length > 0 && (
          <section className="today-also">
            <div className="today-section-head">
              <span className="eyebrow">Also</span>
              <span className="today-rule" aria-hidden="true" />
            </div>
            {queue.map((t, i) => (
              <Link key={i} href={t.href} className="home-queue-row reveal">
                <span className="home-queue-when" style={{ color: URG[t.urgency].col }}>
                  {URG[t.urgency].label}
                </span>
                <span className="home-queue-head">{t.headline}</span>
                <span className="home-queue-client">{t.client}</span>
                <span className="home-queue-go" aria-hidden="true">→</span>
              </Link>
            ))}
            {more > 0 && (
              <Link href="/portfolio" className="today-more">
                {more} more in the book
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </section>
        )}
      </main>
    </StaffHeader>
  );
}
