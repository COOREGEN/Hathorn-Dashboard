import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import ReconDetail from "@/components/reconciliation/recon-detail";
import { reconciliationBundle } from "@/lib/reconciliation/model";

export const dynamic = "force-dynamic";

export default async function ReconDetailPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  const bundle = reconciliationBundle(params.id);
  if (!bundle) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Reconciliations"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{
          href: `/reconciliations?client=${bundle.reconciliation.clientId}&period=${bundle.reconciliation.periodId}`,
          label: "Reconciliations",
        }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <ReconDetail initial={bundle as any} />
      </main>
    </div>
  );
}
