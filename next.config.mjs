/** @type {import('next').NextConfig} */

/**
 * Next's dev server compiles client bundles with eval-based source maps and talks to the
 * browser over a websocket for hot reload. A production-grade CSP blocks both, which does
 * not fail loudly — the page renders, nothing hydrates, and every button silently does
 * nothing. It cost an afternoon: the sign-in button "did not work" while the login API was
 * fine, because no client-side JavaScript was running at all.
 *
 * Production keeps the strict policy. This relaxation exists only where `next dev` needs it.
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers.
 *
 * Client financial data sits behind this app, so the portal must not be
 * frameable, must not sniff content types, and must not leak referrers to
 * third parties. CSP is deliberately strict: the only external origins are
 * the font host, Intuit (OAuth), and the Anthropic API.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next injects inline bootstrap scripts; 'unsafe-inline' is required for them.
      // 'unsafe-eval' is required by the dev compiler only, never in production.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // data: covers logo previews before upload completes.
      "img-src 'self' data: blob:",
      // Hot reload runs over a websocket to the same origin.
      `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
