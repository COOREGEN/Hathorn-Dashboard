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
  ["/api/portal/pdf", ["ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT"]],
  ["/api/auth/mfa/setup", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  // Pages — internal advisory book. Portal is staff preview of a locked statement.
  ["/admin", ["ADMIN", "ADVISOR"]],
  ["/account", ["ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT"]],
  ["/dash", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/today", ["ADMIN", "ADVISOR"]],
  ["/portfolio", ["ADMIN", "ADVISOR"]],
  ["/clients", ["ADMIN", "ADVISOR"]],
  ["/engagement", ["ADMIN", "ADVISOR"]],
  ["/planning", ["ADMIN", "ADVISOR"]],
  ["/documents", ["ADMIN", "ADVISOR", "BOOKKEEPER"]],
  ["/tax", ["ADMIN", "ADVISOR"]],
  ["/guidance", ["ADMIN", "ADVISOR"]],
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

  // Fail closed in production if the signing secret was never set or is the published default.
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.AUTH_SECRET || "";
    if (!secret || secret === DEFAULT_SECRET || secret.length < 32) {
      if (isApi) {
        return NextResponse.json(
          { ok: false, error: "Server misconfigured: AUTH_SECRET is required." },
          { status: 503 },
        );
      }
      return new NextResponse("Server misconfigured: AUTH_SECRET is required.", { status: 503 });
    }
  }

  // Intuit redirects the browser here after consent; the OAuth state token is the
  // proof of intent, not a session cookie. Guarding it would break the handshake.
  if (pathname.startsWith("/api/qbo/callback")) return NextResponse.next();

  // Password recovery and MFA challenge verification are unauthenticated by design.
  if (
    pathname.startsWith("/api/auth/forgot") ||
    pathname.startsWith("/api/auth/reset") ||
    pathname.startsWith("/api/auth/mfa/verify") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/logout")
  ) {
    return NextResponse.next();
  }

  // Forced MFA enrollment: allow the setup API with either a session or setup cookie.
  if (pathname.startsWith("/api/auth/mfa/setup") || pathname.startsWith("/account/security")) {
    const session = req.cookies.get("ledger_session")?.value;
    const setup = req.cookies.get("ledger_mfa_setup")?.value;
    if (setup && !session) return NextResponse.next();
  }

  const guard = GUARDS.filter(([p]) => pathname.startsWith(p))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!guard) return NextResponse.next();

  const token = req.cookies.get("ledger_session")?.value;
  if (!token) {
    // Mid forced-setup: send them to the security page, not login.
    if (req.cookies.get("ledger_mfa_setup")?.value && pathname.startsWith("/account")) {
      return NextResponse.next();
    }
    return deny(req, isApi, 401);
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!guard[1].includes((payload as any).role)) return deny(req, isApi, 403);
    return NextResponse.next();
  } catch {
    return deny(req, isApi, 401);
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
    "/admin/:path*", "/account/:path*", "/dash/:path*", "/today/:path*", "/portfolio/:path*",
    "/clients/:path*", "/engagement/:path*", "/planning/:path*", "/documents/:path*", "/tax/:path*", "/guidance/:path*", "/review/:path*", "/upload/:path*", "/portal/:path*",
    "/api/admin/:path*", "/api/approve/:path*", "/api/notes/:path*",
    "/api/upload/:path*", "/api/comments/:path*",
    "/api/qbo/:path*", "/api/story/:path*",
    "/api/engagement/:path*", "/api/actions/:path*", "/api/planning/:path*",
    "/api/documents/:path*", "/api/tax/:path*", "/api/research/:path*",
    "/api/portal/:path*", "/api/auth/:path*",
  ],
};
