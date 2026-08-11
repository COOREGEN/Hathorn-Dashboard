import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import CloseDetail from "@/components/close/close-detail";
import { closeBundle, refreshCloseRun } from "@/lib/close";

export const dynamic = "force-dynamic";

export default async function CloseDetailPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  // Fresh evaluation on open
  try { refreshCloseRun(params.id, s.userId); } catch { /* may not exist */ }
  const bundle = closeBundle(params.id);
  if (!bundle) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Close"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/close", label: "Close" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <CloseDetail initial={bundle as any} />
      </main>
    </div>
  );
}
