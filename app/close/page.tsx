import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import ClosePortfolio from "@/components/close/close-portfolio";
import { closeAutomationEnabled, firmClosePortfolio } from "@/lib/close";

export const dynamic = "force-dynamic";

export default async function ClosePage({
  searchParams,
}: { searchParams: { year?: string; month?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  const year = Number(searchParams.year || 2026);
  const month = Number(searchParams.month || 4);
  const portfolio = firmClosePortfolio(year, month);

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
        {!closeAutomationEnabled() && (
          <p className="caption" style={{ marginBottom: 16 }}>Close automation is disabled via configuration.</p>
        )}
        <ClosePortfolio
          year={portfolio.year}
          month={portfolio.month}
          counts={portfolio.counts}
          clients={portfolio.clients as any}
        />
      </main>
    </div>
  );
}
