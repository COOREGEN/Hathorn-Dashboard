"use client";
/**
 * Adding a client.
 *
 * This used to ask for nine things: logo wordmark, two hex colours, a template, a
 * notification email, and a labour target band — before anyone had met the business. It
 * was the database schema rendered as a modal.
 *
 * A labour band is agreed in the alignment session months later, and the platform already
 * has a form for that which records who agreed it and when. Asking for it at creation
 * produced a number with no provenance, which is exactly what the rest of the system
 * refuses to do.
 *
 * So: a name, and an optional industry tag drawn from the firm's own book. Everything
 * else is asked at the point it becomes knowable.
 */
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewClientButton({ knownIndustries = [] }: { knownIndustries?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) nameRef.current?.focus(); }, [open]);

  const close = () => { setOpen(false); setName(""); setIndustry(""); setError(""); };

  async function create() {
    if (!name.trim()) return;
    setBusy(true); setError("");
    const res = await fetch("/api/admin/clients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        industryTag: industry.trim(),
        // The wordmark defaults to the name and is editable later in the brand studio,
        // at the point someone is actually preparing something client-facing.
        logoText: name.trim().toUpperCase().slice(0, 24),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) { setError(data.error || "Could not create the client."); return; }
    close();
    // Straight into the engagement — a new client's next step is a discovery call.
    router.push(`/engagement?client=${data.id}`);
    router.refresh();
  }

  if (!open) return <button className="btn" onClick={() => setOpen(true)}>Add a client</button>;

  // Suggestions come from the firm's own book, never a list I invented.
  const suggestions = knownIndustries
    .filter((i) => i && i.toLowerCase().includes(industry.toLowerCase())
      && i.toLowerCase() !== industry.toLowerCase())
    .slice(0, 5);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true">
        <div className="flex justify-between items-start">
          <div>
            <h2 style={{ fontFamily: "var(--display)", fontSize: 24, fontWeight: 400, margin: 0 }}>
              Add a client
            </h2>
            <p className="caption" style={{ marginTop: 5 }}>
              Just the name for now. Everything else gets set up as you go.
            </p>
          </div>
          <button onClick={close} aria-label="Close"
            style={{ background: "transparent", border: 0, fontSize: 20, cursor: "pointer",
              color: "var(--ink-mute)", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginTop: 22 }}>
          <label className="field-label" htmlFor="nc-name">Client name</label>
          <input id="nc-name" ref={nameRef} className="input" style={{ marginTop: 5 }}
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }}
            placeholder="Northbridge Home Care" />
        </div>

        <div style={{ marginTop: 16, position: "relative" }}>
          <label className="field-label" htmlFor="nc-ind">
            Industry <span style={{ opacity: .6 }}>— optional</span>
          </label>
          <input id="nc-ind" className="input" style={{ marginTop: 5 }}
            value={industry} onChange={(e) => setIndustry(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }}
            placeholder={knownIndustries.length ? knownIndustries[0] : "home care, childcare, restaurant…"} />
          {suggestions.length > 0 && (
            <div className="suggest">
              {suggestions.map((sug) => (
                <button key={sug} className="suggest-item" onClick={() => setIndustry(sug)}>{sug}</button>
              ))}
            </div>
          )}
          <p className="caption" style={{ marginTop: 6 }}>
            Type anything — your industry list builds itself from your own book.
          </p>
        </div>

        {error && <p className="caption" style={{ color: "var(--accent-deep)", marginTop: 14 }}>{error}</p>}

        <div className="flex gap-3 justify-end" style={{ marginTop: 26 }}>
          <button className="btn btn-quiet" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy || !name.trim()} onClick={create}>
            {busy ? "Creating…" : "Add and start discovery →"}
          </button>
        </div>
      </div>
    </div>
  );
}
