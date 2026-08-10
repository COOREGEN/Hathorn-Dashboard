import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import ClientManage from "@/components/client-manage";
import LogoutButton from "@/components/logout-button";
import BrandMark from "@/components/brand-mark";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function ManageClient({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !["ADMIN", "ADVISOR"].includes(s.role)) redirect("/login");

  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(params.id);
  if (!c) redirect("/admin");

  const entities: any[] = db().prepare("SELECT * FROM entities WHERE client_id=? ORDER BY rowid").all(params.id);
  const users: any[] = db().prepare("SELECT id,email,name,role FROM users WHERE client_id=? ORDER BY name").all(params.id);
  const goals: any[] = db().prepare("SELECT * FROM goals WHERE client_id=? ORDER BY rowid").all(params.id);
  const allUsers: any[] = db().prepare("SELECT id,email,name,role FROM users ORDER BY name").all();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header className="masthead">
        <div className="masthead-inner" style={{ maxWidth: 1000 }}>
          <BrandMark href="/" tone="paper" size="sm" sub="Ledger" />
          <div className="wordmark" style={{ fontSize: 18 }}>{c.name}</div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/admin" className="prepared-by">The Book</Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="sheet" style={{ maxWidth: 1000, paddingTop: 44 }}>
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
