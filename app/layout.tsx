import type { Metadata } from "next";
import "./globals.css";
import { assertProductionReady } from "@/lib/config";

export const metadata: Metadata = {
  title: "Hathorn Dashboard",
  description: "Monthly financial dashboards — Hathorn Advisory Group",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Fails the first request loudly rather than serving with a public signing key.
  assertProductionReady();

  return (
    <html lang="en">
      <head>
        {/* Hathorn v2026.1 type system. Loaded in the browser, not at build time. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Libre+Franklin:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
