"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    if (!token) { setError("Missing reset token."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    const res = await fetch("/api/auth/reset", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Reset failed.");
      return;
    }
    router.push("/login");
  }

  return (
    <div style={{ background: "var(--paper)", padding: "32px 30px" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Choose a new password</div>
      <p className="caption" style={{ marginBottom: 20 }}>
        At least 10 characters, with letters and numbers. Avoid common phrases.
      </p>
      {!token && (
        <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginBottom: 14 }}>
          This link is incomplete. Request a new reset from the sign-in page.
        </p>
      )}
      <label className="field-label" htmlFor="password">New password</label>
      <input id="password" type="password" className="input" style={{ marginTop: 5, marginBottom: 16 }}
        value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <label className="field-label" htmlFor="confirm">Confirm</label>
      <input id="confirm" type="password" className="input" style={{ marginTop: 5, marginBottom: 20 }}
        value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
        onKeyDown={(e) => e.key === "Enter" && submit()} />
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginBottom: 14 }}>{error}</p>}
      <button className="btn" style={{ width: "100%" }} onClick={submit} disabled={busy || !token}>
        {busy ? "Saving…" : "Update password"}
      </button>
      <div style={{ marginTop: 18 }}>
        <Link href="/login" className="caption" style={{ color: "var(--gold-deep)" }}>← Back to sign in</Link>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 34, fontWeight: 300,
            letterSpacing: ".16em", color: "var(--paper)" }}>HATHORN</div>
        </div>
        <Suspense fallback={<div style={{ background: "var(--paper)", padding: 32 }} className="caption">Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
