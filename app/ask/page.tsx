import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import AskPanel from "@/components/copilot/ask-panel";
import { listClientsForFirm } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function AskPage({
  searchParams,
}: {
  searchParams: { client?: string; period?: string; year?: string; month?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "CLIENT") redirect("/portal");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");
  if (!s.firmId) redirect("/firm");

  const clients = listClientsForFirm(s.firmId);
  let clientId: string | null = searchParams.client || null;
  let clientName: string | null = null;
  if (clientId) {
    const c = clients.find((x) => x.id === clientId);
    if (!c) {
      // also allow slug
      const bySlug: any = db().prepare(
        "SELECT id, name FROM clients WHERE (id=? OR slug=?) AND firm_id=?",
      ).get(clientId, clientId, s.firmId);
      if (bySlug) {
        clientId = bySlug.id;
        clientName = bySlug.name;
      } else {
        clientId = null;
      }
    } else {
      clientName = c.name;
    }
  }

  const year = searchParams.year ? Number(searchParams.year) : null;
  const month = searchParams.month ? Number(searchParams.month) : null;
  const periodId = searchParams.period || null;
  let periodLabel: string | null = null;
  if (periodId && clientId) {
    const p: any = db().prepare(
      "SELECT year, month FROM periods WHERE id=? AND client_id=?",
    ).get(periodId, clientId);
    if (p) periodLabel = `${p.year}-${String(p.month).padStart(2, "0")}`;
  } else if (year && month) {
    periodLabel = `${year}-${String(month).padStart(2, "0")}`;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Ask Hathorn"
        maxWidth={840}
        userName={s.name}
        role={s.role}
        links={[{ href: "/ask", label: "Ask Hathorn" }]}
      />
      <main className="sheet" style={{ maxWidth: 840, paddingTop: 40 }}>
        <AskPanel
          clientId={clientId}
          clientName={clientName}
          periodId={periodId}
          periodLabel={periodLabel}
          year={year}
          month={month}
        />
        {!clientId && clients.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <p className="eyebrow">Open with client context</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 }}>
              {clients.slice(0, 12).map((c) => (
                <li key={c.id}>
                  <a href={`/ask?client=${c.id}`} className="prepared-by" style={{ textDecoration: "none" }}>
                    {c.name} →
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
