"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submitPassword() {
    if (!email || !password) return;
    setBusy(true); setError("");
    const res = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "That email and password don't match.");
      return;
    }
    if (data.mfaRequired) {
      setChallenge(data.challenge || "");
      return;
    }
    if (data.mfaSetupRequired) {
      router.push("/account/security?enroll=1");
      router.refresh();
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function submitMfa() {
    if (!challenge || !code) return;
    setBusy(true); setError("");
    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge, code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "That code did not work.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  const mfaStep = Boolean(challenge);

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 34, fontWeight: 300,
            letterSpacing: ".16em", color: "var(--paper)" }}>HATHORN</div>
          <div style={{ fontFamily: "var(--utility)", fontSize: 8.5, fontWeight: 500,
            letterSpacing: ".3em", textTransform: "uppercase", color: "var(--gold-label)",
            marginTop: 8 }}>Dashboard</div>
          <hr style={{ border: 0, borderTop: "1px solid var(--hairline-dark)", margin: "26px auto 0", width: 56 }} />
        </div>

        <div style={{ background: "var(--paper)", padding: "32px 30px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {mfaStep ? "Authenticator code" : "Sign in"}
          </div>
          <p className="caption" style={{ marginBottom: 20 }}>
            {mfaStep
              ? "Enter the 6-digit code from your authenticator app, or a backup code."
              : "Clients open their monthly statement. Advisors open the practice."}
          </p>

          {!mfaStep ? (
            <>
              <label className="field-label" htmlFor="email">Email</label>
              <input id="email" className="input" style={{ marginTop: 5, marginBottom: 16 }}
                value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                onKeyDown={(e) => e.key === "Enter" && submitPassword()} autoFocus />

              <label className="field-label" htmlFor="password">Password</label>
              <input id="password" type="password" className="input" style={{ marginTop: 5, marginBottom: 12 }}
                value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && submitPassword()} />

              <div style={{ textAlign: "right", marginBottom: 16 }}>
                <Link href="/forgot" className="caption" style={{ color: "var(--gold-deep)" }}>
                  Forgot password?
                </Link>
              </div>
            </>
          ) : (
            <>
              <label className="field-label" htmlFor="code">Code</label>
              <input id="code" className="input" style={{ marginTop: 5, marginBottom: 20 }}
                value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code"
                inputMode="numeric" onKeyDown={(e) => e.key === "Enter" && submitMfa()} autoFocus />
            </>
          )}

          {error && (
            <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginBottom: 14 }}>
              {error}
            </p>
          )}

          <button className="btn" style={{ width: "100%" }}
            onClick={mfaStep ? submitMfa : submitPassword} disabled={busy}>
            {busy ? "Working…" : mfaStep ? "Verify" : "Sign in"}
          </button>

          {mfaStep && (
            <button type="button" className="caption" style={{ marginTop: 14, background: "none", border: 0, cursor: "pointer", color: "var(--ink-mute)" }}
              onClick={() => { setChallenge(""); setCode(""); setError(""); }}>
              ← Back to email and password
            </button>
          )}
        </div>

        <p style={{ textAlign: "center", marginTop: 22, fontFamily: "var(--utility)",
          fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: "#5F5A52" }}>
          Confidential · Hathorn Dashboard
        </p>
      </div>
    </div>
  );
}
