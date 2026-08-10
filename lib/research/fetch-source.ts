/**
 * Safe URL checks for future public-source retrieval.
 * Research fetch must never become an SSRF proxy.
 */

import { lookup } from "dns/promises";
import { isIP } from "net";

/** Initial allowlist — empty of commercial research hosts until licensed. */
export const RESEARCH_HOST_ALLOWLIST = new Set([
  "www.fasb.org",
  "fasb.org",
  "www.sec.gov",
  "sec.gov",
  "www.pcaobus.org",
  "pcaobus.org",
  "www.irs.gov",
  "irs.gov",
]);

function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

export async function assertSafeResearchUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid source URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS source URLs are permitted.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials in source URLs are not permitted.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private hosts are blocked.");
  }
  if (!RESEARCH_HOST_ALLOWLIST.has(host)) {
    throw new Error(`Host not on research URL allowlist: ${host}`);
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new Error("Private IP addresses are blocked.");
  }
  if (!isIP(host)) {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error("Resolved address is private — blocked.");
      }
    }
  }
  return url;
}
