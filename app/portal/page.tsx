import Link from "next/link";
import ClientPortalShell from "@/components/client-portal/shell";
import AskPanel from "@/components/copilot/ask-panel";
import { resolvePortalClient } from "@/lib/client-portal/resolve";
import { buildClientOverview } from "@/lib/client-portal";

export const dynamic = "force-dynamic";

/**
 * Client portal home — curated advisory landing.
 * Only published releases and explicitly shared presentation content.
 */
export default async function PortalHome({
  searchParams,
}: { searchParams: { client?: string; preview?: string } }) {
  const ctx = await resolvePortalClient(searchParams);
  const overview = buildClientOverview(ctx.clientId);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (!overview.period) {
    return (
      <ClientPortalShell brand={ctx.brand} clientName={ctx.client.name} nav={ctx.nav} preview={ctx.preview} staffChrome={ctx.staffChrome}>
        <p className="eyebrow">{greeting}</p>
        <h2 className="display-m" style={{ marginTop: 8 }}>Nothing published yet</h2>
        <p className="prose" style={{ marginTop: 12 }}>
          Your advisor will publish this month’s statement when the numbers are ready. You’ll see it here.
        </p>
      </ClientPortalShell>
    );
  }

  const statementHref = ctx.preview
    ? `/portal/statement?client=${ctx.client.slug}&month=${overview.period.periodId}`
    : `/portal/statement?month=${overview.period.periodId}`;
  const reportHref = overview.latestReport
    ? (ctx.preview
      ? `/portal/reports?client=${ctx.client.slug}&preview=1&id=${overview.latestReport.id}`
      : `/portal/reports?id=${overview.latestReport.id}`)
    : null;

  return (
    <ClientPortalShell
      brand={ctx.brand}
      clientName={ctx.client.name}
      periodLabel={overview.period.label}
      nav={ctx.nav}
      preview={ctx.preview}
      staffChrome={ctx.staffChrome}
    >
      <p className="eyebrow">{greeting}</p>
      <h2 className="display-m" style={{ margin: "6px 0 8px" }}>{overview.period.label}</h2>
      <p className="prepared-by">
        Published financial release
        {overview.period.amended ? ` · Amended (v${overview.period.releaseVersion})` : ""}
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 18,
          marginTop: 28,
          marginBottom: 36,
        }}
      >
        {overview.metrics.map((m) => (
          <div key={m.key} style={{ borderBottom: "1px solid rgba(44,80,77,0.12)", paddingBottom: 10 }}>
            <div className="eyebrow">{m.label}</div>
            <div
              className="display-m"
              style={{ fontSize: 28, fontVariantNumeric: "tabular-nums lining-nums", marginTop: 4 }}
            >
              {m.formatted}
            </div>
            <div className="prepared-by">{m.delta || "—"}</div>
          </div>
        ))}
      </section>

      {overview.whatChanged && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="eyebrow">What changed</h3>
          <p className="prose" style={{ marginTop: 10, maxWidth: 640 }}>{overview.whatChanged}</p>
        </section>
      )}

      {!!overview.attention.length && (
        <section
          style={{
            marginBottom: 32,
            borderTop: "1px solid var(--ink)",
            paddingTop: 16,
          }}
        >
          <h3 className="eyebrow">Needs your attention</h3>
          <p className="prepared-by" style={{ marginTop: 6 }}>
            {overview.attention.length} item{overview.attention.length === 1 ? "" : "s"}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 10 }}>
            {overview.attention.map((a) => (
              <li key={`${a.kind}-${a.id}`}>
                <Link href={a.href} className="prose" style={{ textDecoration: "underline" }}>
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!overview.questions.length && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="eyebrow">Questions for management</h3>
          <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
            {overview.questions.map((q) => (
              <li key={q.id} className="prose" style={{ marginBottom: 8 }}>{q.question}</li>
            ))}
          </ul>
          <Link href={ctx.nav.find((n) => n.label === "Insights")?.href || "/portal/insights"} className="chip" style={{ marginTop: 8, display: "inline-block" }}>
            Answer questions
          </Link>
        </section>
      )}

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginBottom: 36 }}>
        <div style={{ borderTop: "1px solid rgba(44,80,77,0.15)", paddingTop: 12 }}>
          <h3 className="eyebrow">Latest report</h3>
          {overview.latestReport ? (
            <>
              <p className="prose" style={{ marginTop: 8 }}>{overview.latestReport.title}</p>
              <p className="prepared-by">Published {overview.latestReport.publishedAt?.slice(0, 10)}</p>
              {reportHref && (
                <Link href={reportHref} className="chip" style={{ marginTop: 10, display: "inline-block" }}>
                  View report
                </Link>
              )}
            </>
          ) : (
            <p className="prepared-by" style={{ marginTop: 8 }}>No advisory report has been shared yet.</p>
          )}
        </div>
        <div style={{ borderTop: "1px solid rgba(44,80,77,0.15)", paddingTop: 12 }}>
          <h3 className="eyebrow">Financial statement</h3>
          <p className="prepared-by" style={{ marginTop: 8 }}>
            Full published monthly statement with comparisons.
          </p>
          <Link href={statementHref} className="chip" style={{ marginTop: 10, display: "inline-block" }}>
            Open financials
          </Link>
        </div>
        {overview.sharedScenario && (
          <div style={{ borderTop: "1px solid rgba(44,80,77,0.15)", paddingTop: 12 }}>
            <h3 className="eyebrow">Shared forecast</h3>
            <p className="prose" style={{ marginTop: 8 }}>{overview.sharedScenario.scenario}</p>
            <p className="prepared-by">Forecast — not actual results</p>
          </div>
        )}
      </section>

      {ctx.showCopilot && (
        <AskPanel
          clientId={ctx.clientId}
          clientName={ctx.client.name}
          periodId={overview.period.periodId}
          periodLabel={overview.period.label}
        />
      )}
    </ClientPortalShell>
  );
}
