import { redirect } from "next/navigation";
import Shell from "./shell";
import { loadDashboard, alertsFor, dashboardFallback } from "@/lib/dashboard-data";

/**
 * Wraps a view in the shell and loads its data.
 *
 * Every dashboard page goes through here, so a page never has to remember to guard
 * itself, resolve the client, or compute the alert badge.
 */
export default async function Frame({ searchParams, title, subtitle, showFilters = true, children }: {
  searchParams: Record<string, string | undefined>;
  title: string; subtitle: string; showFilters?: boolean;
  children: (ctx: NonNullable<Awaited<ReturnType<typeof loadDashboard>>>) => React.ReactNode;
}) {
  const ctx = await loadDashboard(searchParams);
  if (!ctx) redirect(await dashboardFallback());

  return (
    <Shell
      clientName={ctx.client.name}
      clients={ctx.clients}
      clientId={ctx.client.id}
      periods={ctx.periods.map((p) => ({ periodId: p.periodId, label: p.label, status: p.status }))}
      periodId={ctx.cur?.periodId ?? ""}
      entities={ctx.cur?.entities.map((e) => ({ id: e.id, name: e.name })) ?? []}
      entity={(ctx as any).entity ?? "ALL"}
      mode={(ctx as any).mode ?? "PRIOR_MONTH"}
      confidence={(ctx as any).confidence ?? null}
      alertCount={ctx.cur ? alertsFor(ctx).length : 0}
      userName={ctx.session.name}
      title={title}
      subtitle={subtitle}
      showFilters={showFilters}
    >
      {ctx.cur ? children(ctx) : (
        <div className="empty">
          <h3>No statements yet</h3>
          <p>Nothing has been uploaded for {ctx.client.name}. Once a close is uploaded and
          clears the gate, every view here fills in.</p>
        </div>
      )}
    </Shell>
  );
}
