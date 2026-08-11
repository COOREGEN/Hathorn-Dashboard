"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FirmSwitcher({
  firms,
  activeFirmId,
}: {
  firms: { id: string; name: string }[];
  activeFirmId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(firmId: string) {
    if (firmId === activeFirmId || busy) return;
    setBusy(true);
    const res = await fetch("/api/firm/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firmId }),
    });
    setBusy(false);
    if (!res.ok) return;
    // Hard navigation clears any client-side firm-scoped state.
    router.replace("/today");
    router.refresh();
  }

  if (firms.length < 2) return null;

  return (
    <label className="caption" style={{ display: "block" }}>
      Active firm
      <select
        className="input"
        value={activeFirmId}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 6 }}
      >
        {firms.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    </label>
  );
}
