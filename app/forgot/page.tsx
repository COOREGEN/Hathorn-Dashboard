"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email) return;
    setBusy(true); setError(""); setMessage("");
    const res = await fetch("/api/auth/forgot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not process that request.");
      return;
    }
    setMessage(data.message || "If that email is on file, a reset link is on its way.");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 34, fontWeight: 300,
            letterSpacing: ".16em", color: "var(--paper)" }}>HATHORN</div>
        </div>
        <div style={{ background: "var(--paper)", padding: "32px 30px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Reset password</div>
          <p className="caption" style={{ marginBottom: 20 }}>
            Enter your email. If it is on file, we will send a one-hour reset link.
          </p>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" className="input" style={{ marginTop: 5, marginBottom: 20 }}
            value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginBottom: 14 }}>{error}</p>}
          {message && <p className="caption" style={{ color: "var(--brand)", marginBottom: 14 }}>{message}</p>}
          <button className="btn" style={{ width: "100%" }} onClick={submit} disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <div style={{ marginTop: 18 }}>
            <Link href="/login" className="caption" style={{ color: "var(--gold-deep)" }}>← Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
