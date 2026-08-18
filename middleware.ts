import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const DEFAULT_SECRET = "dev-secret-change-in-production-9f2a";
const rawSecret = process.env.AUTH_SECRET || DEFAULT_SECRET;
const SECRET = new TextEncoder().encode(rawSecret);

/** Path prefix -> roles allowed. Longest match wins, so specificity beats order. */
const GUARDS: [string, string[]][] = [
  // API surface — every mutating route is walled here, not only in the handler.
  ["/api/admin", ["ADMIN", "ADVISOR"]],
  ["/api/approve", ["ADMIN", "ADVISOR"]],
  ["/api/notes", ["ADMIN", "ADVISOR"]],
  ["/api/upload", ["ADMIN", "BOOKKEEPER", "ADVISOR"]],
  ["/api/comments", ["ADMIN", "ADVISOR", "CLIENT"]],
  ["/api/qbo", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/api/story", ["ADMIN", "ADVISOR"]],
  ["/api/engagement", ["ADMIN", "ADVISOR"]],
  ["/api/actions", ["ADMIN", "ADVISOR"]],
  ["/api/planning", ["ADMIN", "ADVISOR"]],
  ["/api/documents", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/api/tax", ["ADMIN", "ADVISOR"]],
  ["/api/research", ["ADMIN", "ADVISOR"]],
  ["/api/reconciliations", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/api/integrations", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/api/close", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/api/exceptions", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/api/firm", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/api/platform", ["ADMIN"]],
  ["/api/ops", ["ADMIN"]],
  ["/api/copilot", ["ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT"]],
  ["/api/intelligence", ["ADMIN", "ADVISOR"]],
  ["/api/client-portal", ["ADMIN", "ADVISOR", "CLIENT"]],
  ["/api/portal/pdf", ["ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT"]],
  // Mutating logo upload/delete — GET /api/assets/[id] is exempted below (public marks).
  ["/api/assets", ["ADMIN", "ADVISOR"]],
  ["/api/auth/mfa/setup", ["ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT"]],
  // Pages — internal advisory book. Portal is staff preview of a locked statement.
  ["/firm", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/platform", ["ADMIN"]],
  ["/admin", ["ADMIN", "ADVISOR"]],
  ["/account", ["ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT"]],
  ["/ask", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/intelligence", ["ADMIN", "ADVISOR"]],
  ["/client-experience", ["ADMIN", "ADVISOR"]],
  ["/dash", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/today", ["ADMIN", "ADVISOR"]],
  ["/portfolio", ["ADMIN", "ADVISOR"]],
  ["/clients", ["ADMIN", "ADVISOR"]],
  ["/engagement", ["ADMIN", "ADVISOR"]],
  ["/planning", ["ADMIN", "ADVISOR"]],
  ["/documents", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/tax", ["ADMIN", "ADVISOR"]],
  ["/guidance", ["ADMIN", "ADVISOR"]],
  ["/reconciliations", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/integrations", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/close", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/exceptions", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/review", ["ADMIN", "ADVISOR"]],
  ["/upload", ["ADMIN", "BOOKKEEPER", "ADVISOR"]],
  ["/portal", ["ADMIN", "ADVISOR", "CLIENT"]],
];

/** APIs get JSON errors; pages get redirects. A 500 is never the right answer for "not allowed". */
function deny(req: NextRequest, isApi: boolean, status: 401 | 403) {
  if (isApi) {
    return NextResponse.json(
      { ok: false, error: status === 401 ? "Not signed in" : "Not permitted for your role" },
      { status },
    );
  }
  return NextResponse.redirect(new URL(status === 401 ? "/login" : "/", req.url));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const correlationId =
    req.headers.get("x-request-id") ||
    req.headers.get("x-correlation-id") ||
    cryptoRandomId();

  const withCorr = (res: NextResponse) => {
    res.headers.set("x-request-id", correlationId);
    return res;
  };

  // Fail closed in production if the signing secret was never set or is the published default.
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.AUTH_SECRET || "";
    if (!secret || secret === DEFAULT_SECRET || secret.length < 32) {
      if (isApi) {
        return withCorr(NextResponse.json(
          { ok: false, error: "Server misconfigured: AUTH_SECRET is required." },
          { status: 503 },
        ));
      }
      return withCorr(new NextResponse("Server misconfigured: AUTH_SECRET is required.", { status: 503 }));
    }
  }

  // Health probes stay unauthenticated and must not require a session.
  if (
    pathname === "/api/health" ||
    pathname.startsWith("/api/health/")
  ) {
    return withCorr(NextResponse.next());
  }

  // Intuit redirects the browser here after consent; the OAuth state token is the
  // proof of intent, not a session cookie. Guarding it would break the handshake.
  if (pathname.startsWith("/api/qbo/callback")) return withCorr(NextResponse.next());

  // Client logos are public marks served into <img> tags — GET by id stays open.
  // POST/DELETE on /api/assets remain role-guarded via GUARDS.
  if (req.method === "GET" && /^\/api\/assets\/[^/]+$/.test(pathname)) {
    return withCorr(NextResponse.next());
  }

  // Password recovery and MFA challenge verification are unauthenticated by design.
  if (
    pathname.startsWith("/api/auth/forgot") ||
    pathname.startsWith("/api/auth/reset") ||
    pathname.startsWith("/api/auth/mfa/verify") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/logout")
  ) {
    return withCorr(NextResponse.next());
  }

  // Forced MFA enrollment: allow the setup API with either a session or setup cookie.
  if (pathname.startsWith("/api/auth/mfa/setup") || pathname.startsWith("/account/security")) {
    const session = req.cookies.get("ledger_session")?.value;
    const setup = req.cookies.get("ledger_mfa_setup")?.value;
    if (setup && !session) return withCorr(NextResponse.next());
  }

  const guard = GUARDS.filter(([p]) => pathname.startsWith(p))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!guard) return withCorr(NextResponse.next());

  const token = req.cookies.get("ledger_session")?.value;
  if (!token) {
    // Mid forced-setup: send them to the security page, not login.
    if (req.cookies.get("ledger_mfa_setup")?.value && pathname.startsWith("/account")) {
      return withCorr(NextResponse.next());
    }
    return withCorr(deny(req, isApi, 401));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!guard[1].includes((payload as any).role)) return withCorr(deny(req, isApi, 403));
    return withCorr(NextResponse.next());
  } catch {
    return withCorr(deny(req, isApi, 401));
  }
}

function cryptoRandomId(): string {
  // Edge-safe-ish: middleware may run on Edge; prefer Web Crypto when present.
  try {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  }
}

/**
 * Next requires this to be a static literal — it cannot be derived from GUARDS. That
 * makes the two lists a drift hazard: a guard whose prefix is missing here is silently
 * never enforced, which is how a client briefly reached /dash. `test.sh` asserts every
 * GUARDS prefix appears below.
 */
export const config = {
  matcher: [
    "/admin/:path*", "/firm/:path*", "/platform/:path*", "/account/:path*", "/ask/:path*", "/intelligence/:path*", "/client-experience/:path*", "/dash/:path*", "/today/:path*", "/portfolio/:path*",
    "/clients/:path*", "/engagement/:path*", "/planning/:path*", "/documents/:path*", "/tax/:path*", "/guidance/:path*", "/reconciliations/:path*", "/integrations/:path*", "/close/:path*", "/exceptions/:path*", "/review/:path*", "/upload/:path*", "/portal/:path*",
    "/api/admin/:path*", "/api/approve/:path*", "/api/notes/:path*",
    "/api/upload/:path*", "/api/comments/:path*",
    "/api/qbo/:path*", "/api/story/:path*",
    "/api/engagement/:path*", "/api/actions/:path*", "/api/planning/:path*",
    "/api/documents/:path*", "/api/tax/:path*", "/api/research/:path*",
    "/api/reconciliations/:path*", "/api/integrations/:path*",
    "/api/close/:path*", "/api/exceptions/:path*",
    "/api/firm/:path*", "/api/platform/:path*", "/api/ops/:path*", "/api/copilot/:path*", "/api/intelligence/:path*",
    "/api/client-portal/:path*",
    "/api/portal/:path*", "/api/assets", "/api/assets/:path*", "/api/auth/:path*",
    "/api/health", "/api/health/:path*",
  ],
};
