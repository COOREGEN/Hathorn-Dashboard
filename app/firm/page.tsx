import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import StaffHeader from "@/components/staff-header";
import {
  getFirm, listFirmMembers, listFirmsForUser, resolveActiveFirmId,
} from "@/lib/tenancy";
import FirmSettingsForm from "@/components/firm-settings-form";
import FirmSwitcher from "@/components/firm-switcher";

export const dynamic = "force-dynamic";

export default async function FirmPage() {
  const s = await getSession();
  if (!s || !["ADMIN", "ADVISOR", "BOOKKEEPER"].includes(s.role)) redirect("/login");

  const firmId = resolveActiveFirmId(s);
  if (!firmId) redirect("/login");
  const firm = getFirm(firmId);
  if (!firm) redirect("/login");

  const members = listFirmMembers(firm.id);
  const firms = listFirmsForUser(s.userId);
  const canEdit = s.role === "ADMIN";

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub={`${firm.name} · Settings`}
        maxWidth={880}
        userName={s.name}
        role={s.role}
        links={[
          { href: "/admin", label: "Ops" },
          ...(s.isPlatformAdmin ? [{ href: "/platform", label: "Platform" }] : []),
        ]}
      />
      <main className="sheet" style={{ maxWidth: 880, paddingTop: 48 }}>
        <div className="eyebrow">Product · Hathorn Dashboard</div>
        <h1 className="display-l" style={{ marginTop: 8 }}>{firm.name}</h1>
        <p className="section-q" style={{ marginBottom: 28 }}>
          Firm profile, controlled branding tokens, and team. Client books live under Clients.
        </p>

        {firms.length > 1 && (
          <div style={{ marginBottom: 32 }}>
            <FirmSwitcher
              firms={firms.map((f) => ({ id: f.id, name: f.name }))}
              activeFirmId={firm.id}
            />
          </div>
        )}

        {canEdit ? (
          <FirmSettingsForm firm={firm} />
        ) : (
          <section style={{ marginBottom: 40 }}>
            <h2 className="display-m">Profile</h2>
            <p className="caption" style={{ marginTop: 12 }}>
              {firm.supportEmail || "No support email"} · {firm.primaryContact || "No primary contact"}
            </p>
            <p className="caption" style={{ marginTop: 8 }}>
              Brand tokens: {firm.brandPrimary} / {firm.brandAccent}
            </p>
          </section>
        )}

        <section style={{ marginTop: 48 }}>
          <h2 className="display-m">Team</h2>
          <p className="section-q" style={{ marginBottom: 18 }}>
            Active memberships in this firm. Staff with membership may access every client
            in the firm (current policy).
          </p>
          <table className="data" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>{m.name}</td>
                  <td>{m.email}</td>
                  <td>{m.role}</td>
                  <td>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="caption" style={{ marginTop: 40 }}>
          <Link href="/clients" style={{ color: "var(--gold-deep)" }}>Open clients →</Link>
        </p>
      </main>
    </div>
  );
}
