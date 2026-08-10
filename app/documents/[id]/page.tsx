import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import DocumentDetail from "@/components/documents/document-detail";
import {
  getDocument, listExtractions, latestExtraction,
} from "@/lib/documents/model";
import { reconcilePayrollRegister } from "@/lib/documents/reconcile-payroll";
import { draftDocumentSummary } from "@/lib/documents/summary";
import { DOCUMENT_TYPES } from "@/lib/documents/types";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  const doc = getDocument(params.id);
  if (!doc) notFound();

  const extractions = listExtractions(doc.id);
  const latest = latestExtraction(doc.id);
  const reconciliation = doc.documentType === "PAYROLL_REGISTER"
    ? reconcilePayrollRegister(doc.id)
    : null;
  const summary = draftDocumentSummary(doc, latest);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Documents"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[
          { href: `/documents?client=${doc.clientId}`, label: "Documents" },
        ]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <DocumentDetail
          document={doc}
          extractions={extractions}
          latest={latest}
          reconciliation={reconciliation}
          summary={summary}
          types={DOCUMENT_TYPES}
        />
      </main>
    </div>
  );
}
