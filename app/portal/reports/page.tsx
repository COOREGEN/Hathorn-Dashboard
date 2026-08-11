import Link from "next/link";
import { redirect } from "next/navigation";
import ClientPortalShell from "@/components/client-portal/shell";
import { resolvePortalClient } from "@/lib/client-portal/resolve";
import {
  getPublishedReport, listReports, markReportViewed,
} from "@/lib/client-portal";
import { firmIdForClient } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function PortalReports({
  searchParams,
}: { searchParams: { client?: string; preview?: string; id?: string } }) {
  const ctx = await resolvePortalClient(searchParams);
  if (!ctx.modules.showReports) redirect("/portal");

  const reports = listReports({ clientId: ctx.clientId, forClient: true });
  const selected = searchParams.id
    ? getPublishedReport(searchParams.id, ctx.clientId)
    : reports[0] || null;

  if (selected && ctx.session.role === "CLIENT") {
    const firmId = firmIdForClient(ctx.clientId);
    if (firmId) {
      markReportViewed({
        reportId: selected.id,
        clientId: ctx.clientId,
        userId: ctx.session.userId,
        firmId,
      });
    }
  }

  const base = ctx.preview && ctx.client.slug
    ? `/portal/reports?client=${ctx.client.slug}&preview=1`
    : "/portal/reports";

  return (
    <ClientPortalShell
      brand={ctx.brand}
      clientName={ctx.client.name}
      periodLabel={selected?.content.periodLabel || ctx.latest?.label}
      nav={ctx.nav}
      preview={ctx.preview}
      staffChrome={ctx.staffChrome}
    >
      <h2 className="eyebrow">Reports</h2>
      {!reports.length && (
        <p className="prose" style={{ marginTop: 16 }}>
          No advisory reports have been published yet.
        </p>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 16, marginBottom: 28 }}>
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`${base}${base.includes("?") ? "&" : "?"}id=${r.id}`}
            style={{
              display: "block",
              borderTop: "1px solid rgba(44,80,77,0.12)",
              padding: "12px 0",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div className="eyebrow">{r.content.periodLabel}</div>
            <div className="prose">{r.title}</div>
            <div className="prepared-by">
              Published {r.publishedAt?.slice(0, 10)} · v{r.version}
              {r.sourceReleaseId ? ` · Release linked` : ""}
            </div>
          </Link>
        ))}
      </div>

      {selected && (
        <article
          className="print-report"
          style={{
            borderTop: "1px solid var(--ink)",
            paddingTop: 24,
            background: "#FBF9F5",
            padding: "28px 22px",
          }}
        >
          <p className="eyebrow">{selected.branding.firmName}</p>
          <h1 className="display-m" style={{ margin: "8px 0" }}>{selected.title}</h1>
          <p className="prepared-by">
            {selected.branding.clientName} · {selected.content.periodLabel}
            {selected.content.releaseVersion
              ? ` · Release v${selected.content.releaseVersion}`
              : ""}
          </p>

          <section style={{ marginTop: 28 }}>
            <h2 className="eyebrow">Key metrics</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14, marginTop: 12 }}>
              {selected.content.kpis.map((k) => (
                <div key={k.key} style={{ borderBottom: "1px solid rgba(44,80,77,0.12)", paddingBottom: 8 }}>
                  <div className="eyebrow">{k.label}</div>
                  <div className="display-m" style={{ fontSize: 24, fontVariantNumeric: "tabular-nums" }}>{k.formatted}</div>
                  <div className="prepared-by">{k.delta || "—"}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 28 }}>
            <h2 className="eyebrow">What changed</h2>
            <p className="prose" style={{ marginTop: 10 }}>{selected.content.whatChanged}</p>
          </section>

          <section style={{ marginTop: 28 }}>
            <h2 className="eyebrow">Financial performance</h2>
            <ul style={{ listStyle: "none", padding: 0, marginTop: 10 }}>
              {selected.content.financialPerformance.map((row) => (
                <li key={row.label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(44,80,77,0.1)", padding: "6px 0", fontFamily: "var(--utility)", fontSize: 13 }}>
                  <span>{row.label}</span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{row.formatted}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section style={{ marginTop: 28 }}>
            <h2 className="eyebrow">Cash</h2>
            <p className="prose" style={{ marginTop: 10 }}>{selected.content.cash.note}</p>
          </section>

          <section style={{ marginTop: 28 }}>
            <h2 className="eyebrow">Outlook / forecast</h2>
            <p className="prose" style={{ marginTop: 10 }}>{selected.content.outlook}</p>
          </section>

          {!!selected.content.managementQuestions.length && (
            <section style={{ marginTop: 28 }}>
              <h2 className="eyebrow">Management questions</h2>
              <ul style={{ marginTop: 10 }}>
                {selected.content.managementQuestions.map((q) => (
                  <li key={q} className="prose" style={{ marginBottom: 6 }}>{q}</li>
                ))}
              </ul>
            </section>
          )}

          {!!selected.content.advisorCommentary.length && (
            <section style={{ marginTop: 28 }}>
              <h2 className="eyebrow">Advisor commentary</h2>
              {selected.content.advisorCommentary.map((n, i) => (
                <div key={i} style={{ marginTop: 12 }}>
                  <h3 className="prose" style={{ fontWeight: 600 }}>{n.heading}</h3>
                  <p className="prose">{n.body}</p>
                </div>
              ))}
            </section>
          )}

          <footer style={{ marginTop: 36, borderTop: "1px solid rgba(44,80,77,0.15)", paddingTop: 12 }}>
            <p className="prepared-by">{selected.content.disclaimer}</p>
            <p className="prepared-by">{selected.branding.reportFooter}</p>
            <p className="no-print prepared-by" style={{ marginTop: 12 }}>
              Use your browser Print / Save as PDF for an archival copy. Numbers match this published snapshot.
            </p>
          </footer>
        </article>
      )}
    </ClientPortalShell>
  );
}
