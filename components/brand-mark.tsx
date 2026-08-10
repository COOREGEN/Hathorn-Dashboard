import Link from "next/link";

/**
 * Hathorn mark — always a way home.
 *
 * Staff land on `/` (which routes to Today). Clients land on the portal.
 * Tone: "ink" for dark mastheads, "paper" for light pages.
 */
export default function BrandMark({
  href = "/",
  sub = "ADVISORY GROUP",
  tone = "ink",
  size = "md",
}: {
  href?: string;
  sub?: string;
  tone?: "ink" | "paper";
  size?: "sm" | "md" | "lg";
}) {
  const title = tone === "ink" ? "var(--paper)" : "var(--ink)";
  const label = tone === "ink" ? "var(--gold)" : "var(--gold-deep)";
  const titleSize = size === "lg" ? 27 : size === "sm" ? 18 : 21;
  const subSize = size === "lg" ? 8.5 : 8;

  return (
    <Link href={href} aria-label="Hathorn Ledger home"
      style={{ textDecoration: "none", display: "inline-block", color: "inherit" }}>
      <div style={{
        fontFamily: "var(--display)", fontSize: titleSize, fontWeight: size === "lg" ? 300 : 400,
        letterSpacing: size === "lg" ? ".18em" : ".1em", color: title, lineHeight: 1,
      }}>
        HATHORN
      </div>
      {sub && (
        <div style={{
          fontFamily: "var(--utility)", fontSize: subSize, fontWeight: 500,
          letterSpacing: ".26em", color: label, marginTop: size === "lg" ? 7 : 5,
          textTransform: "uppercase",
        }}>
          {sub}
        </div>
      )}
    </Link>
  );
}
