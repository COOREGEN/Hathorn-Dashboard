"use client";
/**
 * Brand studio.
 *
 * Hathorn's typography and layout are fixed; what a client controls is their mark
 * and two accent colours. This screen makes that boundary visible — you can see
 * exactly what changes and what doesn't — and refuses to let a colour choice
 * produce unreadable output.
 */
import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildPalette, onDarkVariant, initialsFrom, contrastRatio } from "@/lib/brand";

type Brand = {
  id: string; name: string; template: string; brandPrimary: string; brandAccent: string;
  logoText: string; logoSub: string; logoUrl: string | null;
};

const TEMPLATES = [
  { key: "editorial", name: "Editorial",
    desc: "Warm ivory paper, deepest contrast. The Hathorn signature." },
  { key: "modern", name: "Modern",
    desc: "Lighter surfaces and more air. Reads well on screen." },
  { key: "executive", name: "Executive",
    desc: "Maximum restraint — rules instead of panels, larger figures." },
];

const PRESETS = [
  { name: "Forest", primary: "#2C504D", accent: "#DB5928" },
  { name: "Slate", primary: "#33475B", accent: "#C2703D" },
  { name: "Burgundy", primary: "#6B2737", accent: "#B08247" },
  { name: "Ink", primary: "#1F2933", accent: "#8C6A3F" },
  { name: "Pine", primary: "#28453A", accent: "#B5622B" },
  { name: "Navy", primary: "#1D3557", accent: "#C1663A" },
];

export default function BrandStudio({ brand: init }: { brand: Brand }) {
  const [b, setB] = useState(init);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const palette = useMemo(() => buildPalette(b), [b]);
  const markColor = useMemo(() => onDarkVariant(b.brandPrimary), [b.brandPrimary]);
  const separation = useMemo(
    () => contrastRatio(b.brandPrimary, b.brandAccent), [b.brandPrimary, b.brandAccent]);

  const set = (k: keyof Brand, v: string | null) => setB((x) => ({ ...x, [k]: v } as Brand));

  async function save() {
    setSaving(true);
    await fetch(`/api/admin/clients/${b.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: b.template, brandPrimary: b.brandPrimary, brandAccent: b.brandAccent,
        logoText: b.logoText, logoSub: b.logoSub,
      }),
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2200);
    router.refresh();
  }

  async function pickLogo(file: File) {
    setUploadError("");
    const fd = new FormData();
    fd.set("clientId", b.id);
    fd.set("file", file);
    const res = await fetch("/api/assets", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.ok) { setUploadError(data.error || "Upload failed."); return; }
    // Cache-bust so a replacement shows immediately.
    set("logoUrl", `${data.url}?v=${Date.now()}`);
    router.refresh();
  }

  async function removeLogo() {
    await fetch("/api/assets", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: b.id }),
    });
    set("logoUrl", null);
    router.refresh();
  }

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-8 items-start">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="space-y-7">
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>The client's mark</div>
          <div className="flex items-center gap-4" style={{ marginBottom: 12 }}>
            <div style={{
              width: 62, height: 62, border: "1px solid var(--hairline)", background: "#FFFDF8",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
              {b.logoUrl
                ? <img src={b.logoUrl} alt="" style={{ maxWidth: "84%", maxHeight: "84%", objectFit: "contain" }} />
                : <span style={{ fontFamily: "var(--display)", fontSize: 20, color: "var(--ink-mute)" }}>
                    {initialsFrom(b.logoText || b.name)}
                  </span>}
            </div>
            <div className="space-y-2">
              <button className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
                {b.logoUrl ? "Replace logo" : "Upload logo"}
              </button>
              {b.logoUrl && (
                <button className="block" onClick={removeLogo}
                  style={{ fontFamily: "var(--utility)", fontSize: 10.5, color: "var(--accent-deep)" }}>
                  Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden" onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} />
          </div>
          {uploadError && (
            <p className="caption" style={{ color: "var(--accent-deep)", marginBottom: 8 }}>{uploadError}</p>
          )}
          <p className="caption">
            Transparent PNG or SVG works best — the mark sits on a near-black masthead.
            If there's no logo, the client's initials are set in Cormorant instead.
          </p>

          <div className="grid grid-cols-2 gap-3" style={{ marginTop: 14 }}>
            <div>
              <label className="field-label">Wordmark</label>
              <input className="input" style={{ marginTop: 5 }} value={b.logoText}
                onChange={(e) => set("logoText", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Sub-line</label>
              <input className="input" style={{ marginTop: 5 }} value={b.logoSub || ""}
                onChange={(e) => set("logoSub", e.target.value)} placeholder="In-Home Care" />
            </div>
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Accent colours</div>
          <div className="grid grid-cols-2 gap-3">
            {([["brandPrimary", "Primary"], ["brandAccent", "Accent"]] as const).map(([k, label]) => (
              <div key={k}>
                <label className="field-label">{label}</label>
                <div className="flex gap-2" style={{ marginTop: 5 }}>
                  <input type="color" value={b[k]} onChange={(e) => set(k, e.target.value)}
                    style={{ width: 38, height: 36, border: "1px solid var(--hairline)",
                      padding: 0, cursor: "pointer", background: "transparent" }}
                    aria-label={`${label} colour`} />
                  <input className="input tnum" value={b[k]} onChange={(e) => set(k, e.target.value)} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
            {PRESETS.map((p) => (
              <button key={p.name}
                onClick={() => setB((x) => ({ ...x, brandPrimary: p.primary, brandAccent: p.accent }))}
                title={p.name}
                style={{ display: "flex", border: "1px solid var(--hairline)", cursor: "pointer" }}>
                <span style={{ width: 22, height: 22, background: p.primary }} />
                <span style={{ width: 22, height: 22, background: p.accent }} />
              </button>
            ))}
          </div>

          {palette.warnings.map((w, i) => (
            <p key={i} className="caption" style={{ marginTop: 10, color: "var(--accent-deep)" }}>{w}</p>
          ))}
          {!palette.warnings.length && (
            <p className="caption" style={{ marginTop: 10, color: "var(--brand)" }}>
              Both colours pass contrast on this template. Separation {separation.toFixed(1)}:1.
            </p>
          )}
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Template</div>
          <div className="space-y-2">
            {TEMPLATES.map((t) => (
              <button key={t.key} onClick={() => set("template", t.key)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "12px 14px",
                  border: `1px solid ${b.template === t.key ? "var(--brand)" : "var(--hairline)"}`,
                  background: b.template === t.key ? "var(--brand-tint)" : "transparent",
                  cursor: "pointer",
                }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 16 }}>{t.name}</div>
                <div className="caption" style={{ marginTop: 2 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn" onClick={save} disabled={saving}>
            {saved ? "Saved" : saving ? "Saving…" : "Save branding"}
          </button>
          <span className="caption">Applies to every statement, past and future.</span>
        </div>
      </div>

      {/* ── Live preview ─────────────────────────────────────────────────── */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Preview</div>
        <div style={{ border: "1px solid var(--hairline)", overflow: "hidden", ...(palette.vars as any) }}>
          {/* masthead */}
          <div style={{ background: "var(--ink)", padding: "16px 20px", display: "flex",
            alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {b.logoUrl
              ? <img src={b.logoUrl} alt="" style={{ height: 32, maxWidth: 120, objectFit: "contain" }} />
              : <div style={{ width: 32, height: 32, border: `1px solid ${markColor}`, display: "flex",
                  alignItems: "center", justifyContent: "center", fontFamily: "var(--display)",
                  fontSize: 13, color: markColor }}>{initialsFrom(b.logoText || b.name)}</div>}
            <div>
              <div style={{ fontFamily: "var(--display)", fontSize: 18, letterSpacing: ".1em", color: markColor }}>
                {b.logoText || b.name}
              </div>
              {b.logoSub && <div className="wordmark-sub">{b.logoSub}</div>}
            </div>
            <div className="prepared-by" style={{ marginLeft: "auto" }}>Prepared by Hathorn Advisory Group</div>
          </div>

          {/* page */}
          <div style={{ background: "var(--paper)", padding: "26px 22px" }}>
            {/*
              A preview shows how the brand renders, never invented financials.
              This block previously carried a real client's May figures and their actual
              commentary as placeholder text, so a brand-new client with nothing uploaded
              appeared to have a cash balance, a labour ratio, and a claims-lag story that
              belonged to somebody else. A figure on screen is a figure someone will
              believe, and one client's narrative inside another client's page is worse
              than a cosmetic error.

              The proportions still have to be demonstrated — the eye needs to see how a
              large figure, a rule and a commentary block sit together — so the shapes stay
              and the content is visibly a specimen.
            */}
            <div className="eyebrow" style={{ color: "var(--gold-label)" }}>Specimen — not this client&apos;s figures</div>
            <div className="display-l" style={{ marginTop: 6 }}>Month Year</div>
            <hr className="rule-accent" style={{ marginTop: 14 }} />

            <div className="grid grid-cols-3 gap-5" style={{ marginTop: 22 }}>
              {[["Cash on hand", "var(--ink)"],
                ["Net income", "var(--brand)"],
                ["Labor ratio", "var(--accent-deep)"]].map(([l, c]) => (
                <div key={l} className="kpi">
                  <div className="eyebrow">{l}</div>
                  <div className="kpi-value tnum" style={{ color: c, fontSize: 26, opacity: .32 }}>
                    ——
                  </div>
                </div>
              ))}
            </div>

            <div className="note note-warn" style={{ marginTop: 22 }}>
              <div className="note-head">Where the commentary sits</div>
              <div className="note-body" style={{ opacity: .55 }}>
                The advisor&apos;s explanation of the month appears here, set in the editorial
                face at reading size. It leads the statement because the explanation is what
                the client is paying for.
              </div>
            </div>

            {/* small chart proof so both colours are visible together */}
            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-title">Where a chart sits</div>
              <svg viewBox="0 0 300 62" style={{ width: "100%", marginTop: 12 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <g key={i}>
                    <rect x={i * 58 + 8} y={62 - (30 + i * 3)} width={20} height={30 + i * 3} fill="var(--brand)" />
                    <rect x={i * 58 + 30} y={62 - (18 + i * 2)} width={20} height={18 + i * 2} fill="var(--accent)" />
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
        <p className="caption" style={{ marginTop: 10 }}>
          This is a specimen of the layout, not a preview of anything this client has filed.
          Real figures appear once a close is uploaded and published.{" "}
          Type, spacing and hierarchy are Hathorn&apos;s and stay the same for every client.
          The mark and the two accents are theirs.
        </p>
      </div>
    </div>
  );
}
