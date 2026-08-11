"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QboPanel from "./qbo-panel";
import BrandStudio from "./brand-studio";

type Client = { id: string; name: string; slug: string; template: string; brandPrimary: string;
  brandAccent: string; logoText: string; logoSub: string; logoUrl: string | null;
  targetLaborLo: number; targetLaborHi: number; notifyEmail: string };
type Entity = { id: string; name: string; status: string };
type User = { id: string; email: string; name: string; role: string };
type Goal = { id: string; title: string; target: string; current: string; progress: number; active: number };

export default function ClientManage({ client: init, entities: initEnt, clientUsers: initUsers, goals: initGoals, isAdmin, qboConfigured }:
  { client: Client; entities: Entity[]; clientUsers: User[]; goals: Goal[]; isAdmin: boolean; qboConfigured: boolean }) {
  const [tab, setTab] = useState<"brand" | "settings" | "entities" | "users" | "goals" | "integrations">("brand");
  const router = useRouter();

  // Settings
  const [c, setC] = useState(init);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setC((x) => ({ ...x, [k]: e.target.value }));

  async function saveSettings() {
    setSaving(true);
    await fetch(`/api/admin/clients/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: c.name, slug: c.slug, template: c.template,
        notifyEmail: c.notifyEmail,
        targetLaborLo: +c.targetLaborLo, targetLaborHi: +c.targetLaborHi }),
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  // Entities
  const [entities, setEntities] = useState(initEnt);
  const [newEnt, setNewEnt] = useState({ name: "", status: "ACTIVE" });

  async function addEntity() {
    if (!newEnt.name) return;
    const res = await fetch("/api/admin/entities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: c.id, ...newEnt }),
    });
    const { id } = await res.json();
    setEntities([...entities, { id, ...newEnt }]);
    setNewEnt({ name: "", status: "ACTIVE" });
  }

  async function deleteEntity(id: string) {
    if (!confirm("Delete this entity? This will break any uploaded data tied to it.")) return;
    await fetch(`/api/admin/entities/${id}`, { method: "DELETE" });
    setEntities(entities.filter((e) => e.id !== id));
  }

  async function toggleEntityStatus(ent: Entity) {
    const newStatus = ent.status === "ACTIVE" ? "STARTUP" : "ACTIVE";
    await fetch(`/api/admin/entities/${ent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ent.name, status: newStatus }),
    });
    setEntities(entities.map((e) => e.id === ent.id ? { ...e, status: newStatus } : e));
  }

  // Users
  const [users, setUsers] = useState(initUsers);
  const [newUser, setNewUser] = useState({ email: "", name: "", role: "CLIENT", password: "" });
  const [pwdReset, setPwdReset] = useState<Record<string, string>>({});

  async function addUser() {
    if (!newUser.email || !newUser.name) return;
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newUser, clientId: c.id }),
    });
    const { id } = await res.json();
    setUsers([...users, { id, email: newUser.email, name: newUser.name, role: newUser.role }]);
    setNewUser({ email: "", name: "", role: "CLIENT", password: "" });
  }

  async function resetPassword(id: string) {
    const pwd = pwdReset[id] || "";
    if (!pwd) return;
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    setPwdReset((p) => ({ ...p, [id]: "" }));
  }

  async function deleteUser(id: string) {
    if (!confirm("Remove this user?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setUsers(users.filter((u) => u.id !== id));
  }

  // Goals
  const [goals, setGoals] = useState(initGoals);
  const [newGoal, setNewGoal] = useState({ title: "", target: "", current: "", progress: "0" });

  async function addGoal() {
    if (!newGoal.title || !newGoal.target) return;
    const res = await fetch("/api/admin/goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: c.id, ...newGoal, progress: +newGoal.progress }),
    });
    const { id } = await res.json();
    setGoals([...goals, { id, ...newGoal, progress: +newGoal.progress, active: 1 }]);
    setNewGoal({ title: "", target: "", current: "", progress: "0" });
  }

  async function updateGoal(g: Goal) {
    await fetch(`/api/admin/goals/${g.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(g),
    });
  }

  async function deleteGoal(id: string) {
    await fetch(`/api/admin/goals/${id}`, { method: "DELETE" });
    setGoals(goals.filter((g) => g.id !== id));
  }

  const TABS = [
    { key: "brand", label: "Brand" },
    { key: "settings", label: "Settings" },
    { key: "entities", label: `Entities (${entities.length})` },
    { key: "users", label: `Users (${users.length})` },
    { key: "goals", label: `Goals (${goals.length})` },
    { key: "integrations", label: "Integrations" },
  ] as const;

  return (
    <div>
      {/* preview strip */}
      {/* tabs */}
      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--hairline)", marginBottom: 28 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              fontFamily: "var(--utility)", fontSize: 11, fontWeight: 600, letterSpacing: ".1em",
              textTransform: "uppercase", padding: "10px 16px", marginBottom: -1,
              borderBottom: `2px solid ${tab === t.key ? "var(--ink)" : "transparent"}`,
              color: tab === t.key ? "var(--ink)" : "var(--ink-mute)", cursor: "pointer",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* BRAND */}
      {tab === "brand" && (
        <BrandStudio brand={{
          id: c.id, name: c.name, template: c.template,
          brandPrimary: c.brandPrimary, brandAccent: c.brandAccent,
          logoText: c.logoText, logoSub: c.logoSub, logoUrl: c.logoUrl,
        }} />
      )}

      {/* SETTINGS */}
      {tab === "settings" && (
        <div className="card">
          <h2 className="text-[15px] font-bold mb-4">Client settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="field-label">Client name</label><input className="input mt-1" value={c.name} onChange={setf("name")} /></div>
            <div><label className="field-label">URL slug</label><input className="input mt-1" value={c.slug} onChange={setf("slug")} /></div>
            <div><label className="field-label">Labor target low %</label><input className="input mt-1" type="number" value={c.targetLaborLo} onChange={setf("targetLaborLo")} /></div>
            <div><label className="field-label">Labor target high %</label><input className="input mt-1" type="number" value={c.targetLaborHi} onChange={setf("targetLaborHi")} /></div>
            <div className="col-span-2">
              <label className="field-label">Client notification email</label>
              <input className="input mt-1" type="email" value={c.notifyEmail} onChange={setf("notifyEmail")}
                placeholder="owner@company.com — gets emailed when a period publishes" />
            </div>
          </div>
          <div className="flex justify-end mt-5">
            <button className="btn" style={{ background: "#0C0B0A" }} disabled={saving} onClick={saveSettings}>
              {saved ? "Saved ✓" : saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      )}

      {/* ENTITIES */}
      {tab === "entities" && (
        <div className="space-y-3">
          {entities.map((e) => (
            <div key={e.id} className="card flex items-center gap-3">
              <div className="flex-1">
                <div className="font-bold text-[13px]">{e.name}</div>
              </div>
              <span className={`badge ${e.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {e.status}
              </span>
              <button className="text-[11px] text-neutral-400 hover:text-neutral-700" onClick={() => toggleEntityStatus(e)}>
                Toggle
              </button>
              {isAdmin && (
                <button className="text-[11px] text-red-400" onClick={() => deleteEntity(e.id)}>Delete</button>
              )}
            </div>
          ))}
          <div className="card">
            <div className="text-[12px] font-bold mb-3">Add entity</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><input className="input" value={newEnt.name} onChange={(e) => setNewEnt((x) => ({ ...x, name: e.target.value }))} placeholder="Entity name" /></div>
              <select className="select w-full" value={newEnt.status} onChange={(e) => setNewEnt((x) => ({ ...x, status: e.target.value }))}>
                <option value="ACTIVE">Active</option><option value="STARTUP">Startup</option>
              </select>
            </div>
            <button className="btn mt-3 text-[12px]" style={{ background: "#0C0B0A" }} onClick={addEntity} disabled={!newEnt.name}>
              Add entity
            </button>
          </div>
        </div>
      )}

      {/* USERS */}
      {tab === "users" && (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="card">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  <div className="font-bold text-[13px]">{u.name}</div>
                  <div className="text-[11px] text-neutral-500">{u.email} · {u.role}</div>
                </div>
                <button className="text-[11px] text-red-400" onClick={() => deleteUser(u.id)}>Remove</button>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <input className="input text-[12px]" placeholder="Set new password"
                    value={pwdReset[u.id] || ""}
                    onChange={(e) => setPwdReset((p) => ({ ...p, [u.id]: e.target.value }))} />
                  <button className="btn text-[11px]" style={{ background: "#e8e5e0", color: "#232323" }}
                    disabled={!pwdReset[u.id]} onClick={() => resetPassword(u.id)}>
                    Reset
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="card">
            <div className="text-[12px] font-bold mb-3">Add user</div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser((x) => ({ ...x, name: e.target.value }))} />
              <input className="input" placeholder="Email" type="email" value={newUser.email} onChange={(e) => setNewUser((x) => ({ ...x, email: e.target.value }))} />
              <select className="select w-full" value={newUser.role} onChange={(e) => setNewUser((x) => ({ ...x, role: e.target.value }))}>
                <option value="CLIENT">Client</option>
                <option value="BOOKKEEPER">Bookkeeper</option>
                <option value="ADVISOR">Advisor</option>
                {isAdmin && <option value="ADMIN">Admin</option>}
              </select>
              <input className="input" placeholder="Initial password" value={newUser.password} onChange={(e) => setNewUser((x) => ({ ...x, password: e.target.value }))} />
            </div>
            <button className="btn mt-3 text-[12px]" style={{ background: "#0C0B0A" }}
              disabled={!newUser.name || !newUser.email} onClick={addUser}>
              Add user
            </button>
          </div>
        </div>
      )}

      {/* INTEGRATIONS */}
      {tab === "integrations" && <QboPanel clientId={c.id} configured={qboConfigured} />}

      {/* GOALS */}
      {tab === "goals" && (
        <div className="space-y-3">
          {goals.map((g) => (
            <div key={g.id} className="card">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input className="input text-[12px]" value={g.title} onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, title: e.target.value } : x))} placeholder="Goal title" />
                <input className="input text-[12px]" value={g.target} onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, target: e.target.value } : x))} placeholder="Target" />
                <input className="input text-[12px]" value={g.current} onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, current: e.target.value } : x))} placeholder="Current status" />
                <div className="flex gap-2 items-center">
                  <input type="range" min={0} max={100} value={g.progress} className="flex-1"
                    onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, progress: +e.target.value } : x))} />
                  <span className="text-[11px] font-bold w-8">{g.progress}%</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn text-[11px]" style={{ background: "#0C0B0A" }} onClick={() => updateGoal(g)}>Save</button>
                <button className="text-[11px] text-red-400 ml-auto" onClick={() => deleteGoal(g.id)}>Delete</button>
              </div>
            </div>
          ))}
          <div className="card">
            <div className="text-[12px] font-bold mb-3">Add goal</div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Goal title" value={newGoal.title} onChange={(e) => setNewGoal((x) => ({ ...x, title: e.target.value }))} />
              <input className="input" placeholder="Target" value={newGoal.target} onChange={(e) => setNewGoal((x) => ({ ...x, target: e.target.value }))} />
              <input className="input" placeholder="Current status" value={newGoal.current} onChange={(e) => setNewGoal((x) => ({ ...x, current: e.target.value }))} />
              <div className="flex gap-2 items-center">
                <input type="range" min={0} max={100} value={newGoal.progress} className="flex-1"
                  onChange={(e) => setNewGoal((x) => ({ ...x, progress: e.target.value }))} />
                <span className="text-[11px] font-bold w-8">{newGoal.progress}%</span>
              </div>
            </div>
            <button className="btn mt-3 text-[12px]" style={{ background: "#0C0B0A" }}
              disabled={!newGoal.title || !newGoal.target} onClick={addGoal}>
              Add goal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
