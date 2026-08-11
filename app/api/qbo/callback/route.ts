import { NextResponse } from "next/server";
import { consumeState, exchangeCode } from "@/lib/qbo";
import { audit } from "@/lib/auth";
import { config } from "@/lib/config";

/** Intuit redirects here after consent. State is single-use and short-lived. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const back = (msg: string, clientId?: string) =>
    NextResponse.redirect(
      `${config.baseUrl}${clientId ? `/admin/clients/${clientId}` : "/admin"}?qbo=${encodeURIComponent(msg)}`);

  if (error) return back(`QuickBooks declined the connection: ${error}`);
  if (!code || !realmId || !state) return back("QuickBooks returned an incomplete response.");

  const claim = consumeState(state);
  if (!claim) return back("That connection link expired. Start the connection again.");

  try {
    await exchangeCode(code, realmId, claim.clientId, claim.userId);
    audit(claim.userId, "QBO_CONNECT", `${claim.clientId} realm=${realmId}`);
    return back("Connected to QuickBooks.", claim.clientId);
  } catch (e: any) {
    return back(e.message, claim.clientId);
  }
}
