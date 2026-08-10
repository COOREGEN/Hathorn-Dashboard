import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeMembership, firmIdForClient } from "@/lib/tenancy";
import ClientManage from "@/components/client-manage";
import StaffHeader from "@/components/staff-header";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function ManageClient({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !["ADMIN", "ADVISOR"].includes(s.role)) redirect("/login");

  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(params.id);
  const ownerFirm = firmIdForClient(params.id);
  if (!c || !ownerFirm || !activeMembership(s.userId, ownerFirm)) redirect("/clients");

  const entities: any[] = db().prepare("SELECT * FROM entities WHERE client_id=? ORDER BY rowid").all(params.id);
  const users: any[] = db().prepare("SELECT id,email,name,role FROM users WHERE client_id=? ORDER BY name").all(params.id);
  const goals: any[] = db().prepare("SELECT * FROM goals WHERE client_id=? ORDER BY rowid").all(params.id);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Manage"
        maxWidth={1000}
        userName={s.name}
        links={[
          { href: "/clients", label: "Clients" },
          { href: "/admin", label: "Firm" },
        ]}
      />
      <main className="sheet" style={{ maxWidth: 1000, paddingTop: 44 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="eyebrow">Client</div>
          <h1 className="display-m" style={{ marginTop: 6 }}>{c.name}</h1>
          <p className="caption" style={{ marginTop: 6 }}>
            <Link href={`/dash?client=${c.id}`} style={{ color: "var(--gold-deep)" }}>Dashboard</Link>
            {" · "}
            <Link href={`/portal?client=${c.slug}`} style={{ color: "var(--gold-deep)" }}>Portal</Link>
            {" · "}
            <Link href={`/engagement?client=${c.id}`} style={{ color: "var(--gold-deep)" }}>Engagement</Link>
          </p>
        </div>
        <ClientManage
          client={{ id: c.id, name: c.name, slug: c.slug, template: c.template,
            brandPrimary: c.brand_primary, brandAccent: c.brand_accent,
            logoText: c.logo_text, logoSub: c.logo_sub,
            logoUrl: c.logo_asset_id ? `/api/assets/${c.logo_asset_id}` : null,
            targetLaborLo: c.target_labor_lo, targetLaborHi: c.target_labor_hi,
            notifyEmail: c.notify_email || "" }}
          entities={entities}
          clientUsers={users}
          goals={goals}
          isAdmin={s.role === "ADMIN"}
          qboConfigured={config.qbo.enabled}
        />
      </main>
    </div>
  );
}
