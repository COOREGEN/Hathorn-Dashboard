"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function SecurityInner() {
  const [status, setStatus] = useState<{ enabled: boolean; email?: string; name?: string } | null>(null);
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const enroll = params.get("enroll") === "1";

  async function refresh() {
    const res = await fetch("/api/auth/mfa/setup");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setStatus({ enabled: data.enabled, email: data.email, name: data.name });
  }

  useEffect(() => { refresh(); }, []);

  async function begin() {
    setBusy(true); setError(""); setBackupCodes(null);
    const res = await fetch("/api/auth/mfa/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "begin" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Could not start enrollment."); return; }
    setSecret(data.secret || "");
    setQr(data.qr || "");
  }

  async function confirm() {
    setBusy(true); setError("");
    const res = await fetch("/api/auth/mfa/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Code did not match."); return; }
    setBackupCodes(data.backupCodes || []);
    setSecret(""); setQr(""); setCode("");
    await refresh();
    if (enroll) {
      setTimeout(() => { router.push("/"); router.refresh(); }, 2500);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <main className="sheet" style={{ maxWidth: 560, paddingTop: 48 }}>
        <div className="eyebrow">Account</div>
        <h1 className="display-m" style={{ marginTop: 8 }}>Security</h1>
        <p className="caption" style={{ marginTop: 10, marginBottom: 28 }}>
          {enroll
            ? "Staff accounts require an authenticator before a session is issued."
            : "Protect staff access with an authenticator app (Authy, 1Password, Google Authenticator)."}
        </p>

        {status && (
          <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 16, marginBottom: 24 }}>
            <div className="flex justify-between items-center">
              <span style={{ fontFamily: "var(--utility)", fontSize: 12, fontWeight: 600 }}>
                {status.name} · {status.email}
              </span>
              <span className="tag" style={{ color: status.enabled ? "var(--brand)" : "var(--accent-deep)" }}>
                {status.enabled ? "MFA on" : "MFA off"}
              </span>
            </div>
          </div>
        )}

        {!qr && !backupCodes && (
          <button className="btn" onClick={begin} disabled={busy}>
            {status?.enabled ? "Re-enroll authenticator" : "Set up authenticator"}
          </button>
        )}

        {qr && (
          <div style={{ marginTop: 24 }}>
            <p className="caption" style={{ marginBottom: 12 }}>
              Scan this QR code, or enter the secret manually:
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="MFA QR code" width={200} height={200} style={{ marginBottom: 12 }} />
            <code style={{ display: "block", fontSize: 12, wordBreak: "break-all", marginBottom: 16 }}>{secret}</code>
            <label className="field-label" htmlFor="code">Confirm with a 6-digit code</label>
            <input id="code" className="input" style={{ marginTop: 5, marginBottom: 14 }}
              value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            <button className="btn" onClick={confirm} disabled={busy || code.length < 6}>
              {busy ? "Confirming…" : "Enable MFA"}
            </button>
          </div>
        )}

        {backupCodes && (
          <div style={{ marginTop: 24, padding: 16, background: "var(--wash)" }}>
            <p className="caption" style={{ marginBottom: 10, color: "var(--accent-deep)" }}>
              Save these backup codes now. They will not be shown again.
            </p>
            <ul style={{ fontFamily: "var(--utility)", fontSize: 13, lineHeight: 1.8 }}>
              {backupCodes.map((c) => <li key={c} className="tnum">{c}</li>)}
            </ul>
            {enroll && <p className="caption" style={{ marginTop: 12 }}>Continuing to the book…</p>}
          </div>
        )}

        {error && (
          <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginTop: 16 }}>{error}</p>
        )}

        {!enroll && (
          <div style={{ marginTop: 32 }}>
            <Link href="/today" className="caption" style={{ color: "var(--gold-deep)" }}>← Back to the book</Link>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AccountSecurity() {
  return (
    <Suspense fallback={<div className="sheet caption" style={{ paddingTop: 48 }}>Loading…</div>}>
      <SecurityInner />
    </Suspense>
  );
}
