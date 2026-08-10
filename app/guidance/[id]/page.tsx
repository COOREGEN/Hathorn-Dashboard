import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import GuidanceIssueDetail from "@/components/guidance/issue-detail";
import { ensurePilotCorpus, issueBundle } from "@/lib/research/model";

export const dynamic = "force-dynamic";

export default async function GuidanceIssuePage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR"].includes(s.role)) redirect("/");

  await ensurePilotCorpus();
  const bundle = issueBundle(params.id);
  if (!bundle) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Accounting Guidance"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[
          { href: `/guidance?client=${bundle.issue.clientId || ""}`, label: "Guidance" },
        ]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <GuidanceIssueDetail initial={bundle} />
      </main>
    </div>
  );
}
