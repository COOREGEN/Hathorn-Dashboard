import { redirect } from "next/navigation";
import ClientPortalShell from "@/components/client-portal/shell";
import DocumentsClient from "@/components/client-portal/documents-client";
import { resolvePortalClient } from "@/lib/client-portal/resolve";
import { listClientVisibleDocuments, listDocumentRequests } from "@/lib/client-portal";

export const dynamic = "force-dynamic";

export default async function PortalDocuments({
  searchParams,
}: { searchParams: { client?: string; preview?: string } }) {
  const ctx = await resolvePortalClient(searchParams);
  if (!ctx.modules.showDocuments) redirect("/portal");

  const documents = listClientVisibleDocuments(ctx.clientId);
  const requests = listDocumentRequests({ clientId: ctx.clientId });

  return (
    <ClientPortalShell
      brand={ctx.brand}
      clientName={ctx.client.name}
      periodLabel={ctx.latest?.label}
      nav={ctx.nav}
      preview={ctx.preview}
      staffChrome={ctx.staffChrome}
    >
      <DocumentsClient
        documents={documents}
        requests={requests}
        canUpload={ctx.allowClientUploads}
      />
    </ClientPortalShell>
  );
}
