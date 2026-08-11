"use client";
import { useRouter } from "next/navigation";

export default function EngagementClientSelect({
  clients, clientId, tab,
}: {
  clients: { id: string; name: string }[];
  clientId: string;
  tab: string;
}) {
  const router = useRouter();
  if (clients.length < 2) return null;
  return (
    <div>
      <label className="field-label" htmlFor="eng-client">Client</label>
      <select
        id="eng-client"
        className="input"
        style={{ marginTop: 4, minWidth: 220 }}
        value={clientId}
        onChange={(e) => router.push(`/engagement?client=${e.target.value}&tab=${tab}`)}
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
