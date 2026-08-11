"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="eyebrow"
      style={{ background: "transparent", border: "1px solid var(--hairline)", padding: "6px 12px", cursor: "pointer" }}
      onClick={async () => { await fetch("/api/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}
    >Sign out</button>
  );
}
