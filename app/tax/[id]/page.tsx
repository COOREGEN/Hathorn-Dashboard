import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import TaxIssueDetail from "@/components/tax/tax-issue-detail";
import { issueBundle, listAuthorities, ensureSeedAuthorities } from "@/lib/tax/model";

export const dynamic = "force-dynamic";

export default async function TaxIssuePage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR"].includes(s.role)) redirect("/");

  ensureSeedAuthorities();
  const bundle = issueBundle(params.id);
  if (!bundle) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Tax Intelligence"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[
          { href: `/tax?client=${bundle.issue.clientId}`, label: "Tax" },
        ]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <TaxIssueDetail
          initial={bundle}
          registry={listAuthorities()}
        />
      </main>
    </div>
  );
}
