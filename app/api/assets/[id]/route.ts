import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Serves an uploaded asset (currently client logos).
 *
 * Logos used to be stored as base64 on the client row, which meant a 900 KB upload
 * became ~1.2 MB of inline data in the HTML of every dashboard render, forever.
 * They are bytes in the database now and fetched once, then cached by the browser.
 *
 * Deliberately public: a logo is a public mark, and requiring a session here would
 * break the <img> tag on the login-adjacent preview. No other asset kind is served.
 */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const asset: any = db()
    .prepare("SELECT mime, bytes, kind FROM assets WHERE id=?")
    .get(params.id);

  if (!asset || asset.kind !== "logo") {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(asset.bytes, {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
