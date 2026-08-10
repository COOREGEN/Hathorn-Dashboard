import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import GuidanceWorkspace from "@/components/guidance/guidance-workspace";
import {
  accountingGuidanceEnabled, ensurePilotCorpus, listIssues, listSources,
} from "@/lib/research/model";
import { ragflowStatus } from "@/lib/research/ragflow";
import { RESEARCH_CATEGORIES } from "@/lib/research/types";

export const dynamic = "force-dynamic";

export default async function GuidancePage({
  searchParams,
}: { searchParams: { client?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR"].includes(s.role)) redirect("/");

  await ensurePilotCorpus();
  const clients: any[] = db().prepare("SELECT id, name FROM clients ORDER BY name").all();
  if (!clients.length) redirect("/clients");

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0].id;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Accounting Guidance"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/guidance", label: "Guidance" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <GuidanceWorkspace
          clients={clients}
          initialClientId={clientId}
          issues={listIssues(clientId)}
          sources={listSources({ clientId })}
          categories={[...RESEARCH_CATEGORIES]}
          enabled={accountingGuidanceEnabled()}
          ragflow={ragflowStatus()}
        />
      </main>
    </div>
  );
}
