"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    if (!email || !password) return;
    setBusy(true); setError("");
    const res = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) { router.push("/"); router.refresh(); return; }
    const data = await res.json().catch(() => ({}));
    setError(data.error || "That email and password don't match.");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 34, fontWeight: 300,
            letterSpacing: ".16em", color: "var(--paper)" }}>HATHORN</div>
          <div style={{ fontFamily: "var(--utility)", fontSize: 8.5, fontWeight: 500,
            letterSpacing: ".3em", textTransform: "uppercase", color: "var(--gold-label)",
            marginTop: 8 }}>Advisory Group</div>
          <hr style={{ border: 0, borderTop: "1px solid var(--hairline-dark)", margin: "26px auto 0", width: 56 }} />
        </div>

        <div style={{ background: "var(--paper)", padding: "32px 30px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Sign in</div>
          <p className="caption" style={{ marginBottom: 20 }}>
            Clients open their monthly statement. Advisors open the book.
          </p>

          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" className="input" style={{ marginTop: 5, marginBottom: 16 }}
            value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />

          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" style={{ marginTop: 5, marginBottom: 20 }}
            value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && submit()} />

          {error && (
            <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginBottom: 14 }}>
              {error}
            </p>
          )}

          <button className="btn" style={{ width: "100%" }} onClick={submit} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: 22, fontFamily: "var(--utility)",
          fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: "#5F5A52" }}>
          Confidential · Hathorn Advisory Group
        </p>
      </div>
    </div>
  );
}
