/**
 * Controlled fetch of official tax-source URLs — not a generic proxy.
 * HTTPS + allowlisted hosts + block private/metadata IPs.
 */

import { createHash } from "crypto";
import { lookup as dnsLookup } from "dns/promises";
import { isIP } from "net";
import { fetchWithTimeout } from "../security";

/** MVP allowlist — official public tax / statutory sources only. */
export const AUTHORITY_HOST_ALLOWLIST = new Set([
  "www.irs.gov",
  "irs.gov",
  "www.ecfr.gov",
  "ecfr.gov",
  "www.federalregister.gov",
  "federalregister.gov",
  "www.govinfo.gov",
  "govinfo.gov",
  "uscode.house.gov",
  "www.law.cornell.edu",
  "law.cornell.edu",
]);

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export async function assertSafeAuthorityUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS authority URLs are allowed.");
  if (url.username || url.password) throw new Error("Credentials in URL are not allowed.");
  const host = url.hostname.toLowerCase();
  if (!AUTHORITY_HOST_ALLOWLIST.has(host)) {
    throw new Error("Host is not on the official tax-source allowlist.");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private IP addresses are blocked.");
  } else {
    const records = await dnsLookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error("Host resolves to a private address and is blocked.");
      }
    }
  }
  return url;
}

export async function fetchAuthorityPage(rawUrl: string): Promise<{
  url: string;
  text: string;
  contentHash: string;
  retrievedAt: string;
}> {
  const url = await assertSafeAuthorityUrl(rawUrl);
  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      "User-Agent": "HathornDashboard-TaxResearch/1.0 (internal; not a crawler)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
    redirect: "manual",
  }, 15_000);

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) throw new Error("Redirect without location.");
    const next = new URL(loc, url);
    await assertSafeAuthorityUrl(next.toString());
    return fetchAuthorityPage(next.toString());
  }
  if (!res.ok) throw new Error(`Authority fetch failed (${res.status}).`);

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text") && !ct.includes("html") && !ct.includes("xml")) {
    throw new Error("Unsupported content type for authority snapshot.");
  }

  let text = await res.text();
  if (text.length > 500_000) text = text.slice(0, 500_000);
  const plain = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80_000);

  const contentHash = createHash("sha256").update(plain).digest("hex");
  return {
    url: url.toString(),
    text: plain,
    contentHash,
    retrievedAt: new Date().toISOString(),
  };
}
