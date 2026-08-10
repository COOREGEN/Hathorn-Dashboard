"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PlatformCreateFirm() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/platform/firms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        slug: fd.get("slug"),
        adminName: fd.get("adminName"),
        adminEmail: fd.get("adminEmail"),
        adminPassword: fd.get("adminPassword"),
        brandPrimary: fd.get("brandPrimary"),
        brandAccent: fd.get("brandAccent"),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok || !data.ok) {
      setMsg(data.error || "Could not create firm.");
      return;
    }
    setMsg(`Created ${data.firm.name}.`);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={create} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <h2 className="display-m">Create firm</h2>
      <input name="name" placeholder="Firm name" required className="input" />
      <input name="slug" placeholder="slug (optional)" className="input" />
      <input name="adminName" placeholder="Firm admin name" required className="input" />
      <input name="adminEmail" type="email" placeholder="Firm admin email" required className="input" />
      <input name="adminPassword" type="password" placeholder="Temp password" required className="input" />
      <input name="brandPrimary" placeholder="Primary #hex" defaultValue="#2C504D" className="input" />
      <input name="brandAccent" placeholder="Accent #hex" defaultValue="#DB5928" className="input" />
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Creating…" : "Create firm"}
      </button>
      {msg && <p className="caption">{msg}</p>}
    </form>
  );
}