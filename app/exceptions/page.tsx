import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import StaffHeader from "@/components/staff-header";
import ExceptionsQueue from "@/components/close/exceptions-queue";
import { listFirmExceptions } from "@/lib/close";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage({
  searchParams,
}: { searchParams: { clientId?: string; periodId?: string; mine?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/");

  const exceptions = listFirmExceptions({
    clientId: searchParams.clientId,
    periodId: searchParams.periodId,
    mineUserId: searchParams.mine === "1" ? s.userId : undefined,
  });
  const users: any[] = db().prepare(
    `SELECT id, name FROM users WHERE role IN ('ADMIN','ADVISOR','BOOKKEEPER') ORDER BY name`,
  ).all();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Exceptions"
        maxWidth={1080}
        userName={s.name}
        role={s.role}
        links={[{ href: "/exceptions", label: "Exceptions" }]}
      />
      <main className="sheet" style={{ maxWidth: 1080, paddingTop: 40 }}>
        <ExceptionsQueue initial={exceptions as any} users={users} currentUserId={s.userId} />
      </main>
    </div>
  );
}
