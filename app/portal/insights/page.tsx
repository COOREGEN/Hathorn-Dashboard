import { redirect } from "next/navigation";
import ClientPortalShell from "@/components/client-portal/shell";
import InsightsClient from "@/components/client-portal/insights-client";
import { resolvePortalClient } from "@/lib/client-portal/resolve";
import { listInsights, listQuestions } from "@/lib/client-portal";

export const dynamic = "force-dynamic";

export default async function PortalInsights({
  searchParams,
}: { searchParams: { client?: string; preview?: string } }) {
  const ctx = await resolvePortalClient(searchParams);
  if (!ctx.modules.showInsights) redirect("/portal");

  const insights = listInsights({ clientId: ctx.clientId, forClient: true });
  const questions = listQuestions({ clientId: ctx.clientId, forClient: true });

  return (
    <ClientPortalShell
      brand={ctx.brand}
      clientName={ctx.client.name}
      periodLabel={ctx.latest?.label}
      nav={ctx.nav}
      preview={ctx.preview}
    >
      <InsightsClient
        insights={insights}
        questions={questions}
        canAnswer={ctx.allowClientAnswers}
      />
    </ClientPortalShell>
  );
}
