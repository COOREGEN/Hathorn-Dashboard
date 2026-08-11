"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Firm } from "@/lib/tenancy";

export default function FirmSettingsForm({ firm }: { firm: Firm }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name") || ""),
      supportEmail: String(fd.get("supportEmail") || ""),
      primaryContact: String(fd.get("primaryContact") || ""),
      brandPrimary: String(fd.get("brandPrimary") || ""),
      brandAccent: String(fd.get("brandAccent") || ""),
      logoText: String(fd.get("logoText") || ""),
      reportFooter: String(fd.get("reportFooter") || ""),
      clientPortalName: String(fd.get("clientPortalName") || ""),
      showPlatformMark: fd.get("showPlatformMark") === "on",
    };
    const res = await fetch("/api/firm", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok || !data.ok) {
      setMsg(data.error || "Could not save.");
      return;
    }
    setMsg("Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 16, maxWidth: 520 }}>
      <h2 className="display-m">Firm profile</h2>
      <label className="caption">
        Name
        <input name="name" defaultValue={firm.name} required className="input" />
      </label>
      <label className="caption">
        Support email
        <input name="supportEmail" defaultValue={firm.supportEmail || ""} className="input" />
      </label>
      <label className="caption">
        Primary contact
        <input name="primaryContact" defaultValue={firm.primaryContact || ""} className="input" />
      </label>
      <h2 className="display-m" style={{ marginTop: 12 }}>Branding tokens</h2>
      <p className="caption">Controlled colours and wordmark only — no custom CSS or scripts.</p>
      <label className="caption">
        Primary
        <input name="brandPrimary" defaultValue={firm.brandPrimary} className="input" />
      </label>
      <label className="caption">
        Accent
        <input name="brandAccent" defaultValue={firm.brandAccent} className="input" />
      </label>
      <label className="caption">
        Logo text
        <input name="logoText" defaultValue={firm.logoText || ""} className="input" />
      </label>
      <label className="caption">
        Report footer
        <input name="reportFooter" defaultValue={firm.reportFooter || ""} className="input" />
      </label>
      <label className="caption">
        Client portal name
        <input name="clientPortalName" defaultValue={firm.clientPortalName || ""} className="input" />
      </label>
      <label className="caption" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" name="showPlatformMark" defaultChecked={firm.showPlatformMark} />
        Show “Hathorn Dashboard” platform mark where appropriate
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Saving…" : "Save firm settings"}
      </button>
      {msg && <p className="caption">{msg}</p>}
    </form>
  );
}
