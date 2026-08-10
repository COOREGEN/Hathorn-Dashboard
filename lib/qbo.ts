/**
 * QuickBooks Online integration.
 *
 * What it replaces: two of the bookkeeper's four uploads (P&L by class, AR aging).
 * What it does NOT replace: payroll register and hours — Paycor/ADP APIs are
 * partner-gated, so those stay CSV. The gate still enforces that the two sides tie.
 *
 * Auth is OAuth2 with rotating refresh tokens (Intuit rotates the refresh token on
 * every use, so we always persist whatever comes back).
 */

import crypto from "crypto";
import { db, uid } from "./db";
import { config } from "./config";
import { encrypt, decrypt, fetchWithTimeout } from "./security";
import { runGate } from "./gate";
import { assertEditable } from "./release";
import type { GateResult } from "./gate";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

export type QboConnection = {
  id: string; client_id: string; realm_id: string;
  access_token: string; refresh_token: string;
  access_expires_at: string; refresh_expires_at: string;
  connected_by: string;
  connected_at: string;
  last_sync_at: string | null; last_sync_status: string;
};

/* ------------------------------------------------------------------ */
/* OAuth handshake                                                     */
/* ------------------------------------------------------------------ */

/** Builds the consent URL and stores a one-time state token to prevent CSRF. */
export function buildAuthUrl(clientId: string, userId: string): string {
  const state = crypto.randomBytes(24).toString("hex");
  db().prepare("INSERT INTO oauth_states (state, client_id, user_id) VALUES (?,?,?)")
    .run(state, clientId, userId);
  db().prepare("DELETE FROM oauth_states WHERE created_at < datetime('now','-15 minutes')").run();

  const p = new URLSearchParams({
    client_id: config.qbo.clientId,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: config.qbo.redirectUri,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export function consumeState(state: string): { clientId: string; userId: string } | null {
  const row: any = db().prepare(
    "SELECT * FROM oauth_states WHERE state=? AND created_at > datetime('now','-15 minutes')",
  ).get(state);
  if (!row) return null;
  db().prepare("DELETE FROM oauth_states WHERE state=?").run(state);
  return { clientId: row.client_id, userId: row.user_id };
}

function basicAuth() {
  return Buffer.from(`${config.qbo.clientId}:${config.qbo.clientSecret}`).toString("base64");
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  }, 15_000);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QuickBooks token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<{
    access_token: string; refresh_token: string;
    expires_in: number; x_refresh_token_expires_in: number;
  }>;
}

const inSeconds = (s: number) =>
  new Date(Date.now() + s * 1000).toISOString().replace("T", " ").slice(0, 19);

/** Exchanges the authorization code and persists the connection. */
export async function exchangeCode(code: string, realmId: string, clientId: string, userId: string) {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.qbo.redirectUri,
  });
  db().prepare("DELETE FROM qbo_connections WHERE client_id=?").run(clientId);
  // Encrypted at rest: a refresh token is standing read access to the client's books.
  db().prepare(`INSERT INTO qbo_connections
    (id, client_id, realm_id, access_token, refresh_token, access_expires_at, refresh_expires_at, connected_by)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(uid(), clientId, realmId, encrypt(t.access_token), encrypt(t.refresh_token),
      inSeconds(t.expires_in), inSeconds(t.x_refresh_token_expires_in), userId);
}

export function getConnection(clientId: string): QboConnection | null {
  return (db().prepare("SELECT * FROM qbo_connections WHERE client_id=?").get(clientId) as any) || null;
}

/** Never let a raw token leave this module. */
function tokens(conn: QboConnection) {
  return { access: decrypt(conn.access_token), refresh: decrypt(conn.refresh_token) };
}

export function disconnect(clientId: string) {
  db().prepare("DELETE FROM qbo_connections WHERE client_id=?").run(clientId);
}

/** Returns a valid access token, refreshing it first if it's close to expiring. */
async function validAccessToken(conn: QboConnection): Promise<string> {
  const { access, refresh } = tokens(conn);
  const expiresAt = new Date(conn.access_expires_at.replace(" ", "T") + "Z").getTime();
  if (expiresAt - Date.now() > 120_000) return access;

  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  // Intuit rotates refresh tokens — always persist the new one or the next call fails.
  db().prepare(`UPDATE qbo_connections
      SET access_token=?, refresh_token=?, access_expires_at=?, refresh_expires_at=?
      WHERE id=?`)
    .run(encrypt(t.access_token), encrypt(t.refresh_token), inSeconds(t.expires_in),
      inSeconds(t.x_refresh_token_expires_in), conn.id);
  return t.access_token;
}

async function qboGet(conn: QboConnection, path: string, params: Record<string, string>) {
  const token = await validAccessToken(conn);
  const url = `${config.qbo.apiBase}/v3/company/${conn.realm_id}/${path}?${new URLSearchParams(params)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }, 25_000);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QuickBooks API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Report parsing                                                      */
/* ------------------------------------------------------------------ */

/** QBO reports are deeply nested Rows/ColData. Walk them into flat leaf rows. */
function flattenRows(rows: any, out: { label: string; values: string[]; group: string }[] = [], group = "") {
  const list = rows?.Row || [];
  for (const r of list) {
    const g = r.group || r.Header?.ColData?.[0]?.value || group;
    if (r.Rows) flattenRows(r.Rows, out, g);
    if (r.ColData) {
      out.push({
        label: r.ColData[0]?.value ?? "",
        values: r.ColData.slice(1).map((c: any) => c?.value ?? "0"),
        group: g,
      });
    }
    if (r.Summary?.ColData) {
      out.push({
        label: r.Summary.ColData[0]?.value ?? "",
        values: r.Summary.ColData.slice(1).map((c: any) => c?.value ?? "0"),
        group: `${g}::SUMMARY`,
      });
    }
  }
  return out;
}

const toK = (v: string) => Math.round((parseFloat(String(v).replace(/[$,()]/g, "")) || 0) / 100) / 10;

export type SyncResult = {
  plLines: { entityName: string; category: string; label: string; amount: number }[];
  arBuckets: { payer: string; b0_30: number; b31_60: number; b61_90: number; b90p: number }[];
  warnings: string[];
};

/**
 * Pulls the P&L (by class, so each entity maps to a QBO class) and the AR aging
 * summary for one month, and shapes them into the rows our gate expects.
 *
 * Amounts are converted to $K to match the rest of the platform.
 */
export async function syncPeriod(clientId: string, year: number, month: number): Promise<SyncResult> {
  const conn = getConnection(clientId);
  if (!conn) throw new Error("QuickBooks is not connected for this client.");

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${endDate}`;

  const warnings: string[] = [];
  const entities: any[] = db().prepare("SELECT * FROM entities WHERE client_id=?").all(clientId);
  const maps: any[] = db().prepare("SELECT * FROM qbo_account_map WHERE client_id=?").all(clientId);

  /** Resolve a QBO class name to one of our entities — explicit map first, then name match. */
  function resolveEntity(className: string): string | null {
    const mapped = maps.find((m) => m.qbo_class_ref.toLowerCase() === className.toLowerCase());
    if (mapped) return entities.find((e) => e.id === mapped.entity_id)?.name ?? null;
    const byName = entities.find(
      (e) => e.name.toLowerCase() === className.toLowerCase() ||
             className.toLowerCase().includes(e.name.toLowerCase()) ||
             e.name.toLowerCase().includes(className.toLowerCase()),
    );
    return byName?.name ?? null;
  }

  // ---- Profit & Loss, split by class ----
  const pl = await qboGet(conn, "reports/ProfitAndLoss", {
    start_date: start, end_date: end, summarize_column_by: "Classes", accounting_method: "Accrual",
  });

  const columns: string[] = (pl.Columns?.Column || []).slice(1).map((c: any) => c.ColTitle || "");
  const rows = flattenRows(pl.Rows);
  const plLines: SyncResult["plLines"] = [];

  for (const row of rows) {
    if (row.group.endsWith("::SUMMARY")) continue;
    const section = row.group.toLowerCase();
    let category: string | null = null;
    if (section.includes("income") || section.includes("revenue")) category = "REVENUE";
    else if (section.includes("cost of goods") || section.includes("cogs")) category = "DIRECT_COST";
    else if (section.includes("expense")) category = "OPEX";
    if (!category) continue;

    row.values.forEach((v, i) => {
      const className = columns[i];
      if (!className || /total/i.test(className)) return;
      const amount = toK(v);
      if (amount === 0) return;
      const entityName = resolveEntity(className);
      if (!entityName) {
        const w = `QuickBooks class "${className}" doesn't match any entity — its amounts were skipped.`;
        if (!warnings.includes(w)) warnings.push(w);
        return;
      }
      plLines.push({ entityName, category, label: row.label || category, amount });
    });
  }

  if (!plLines.length) {
    warnings.push("No P&L lines came back. Check that the QuickBooks file uses classes per entity.");
  }

  // ---- AR aging summary ----
  const ar = await qboGet(conn, "reports/AgedReceivables", { report_date: end, aging_period: "30" });
  const arRows = flattenRows(ar.Rows).filter((r) => !r.group.endsWith("::SUMMARY"));
  const arBuckets: SyncResult["arBuckets"] = arRows
    .filter((r) => r.label && !/^total/i.test(r.label))
    .map((r) => ({
      payer: r.label,
      b0_30: toK(r.values[0] ?? "0"),
      b31_60: toK(r.values[1] ?? "0"),
      b61_90: toK(r.values[2] ?? "0"),
      b90p: toK(r.values[3] ?? "0") + toK(r.values[4] ?? "0"),
    }))
    .filter((b) => b.b0_30 || b.b31_60 || b.b61_90 || b.b90p);

  if (!arBuckets.length) warnings.push("No AR aging rows came back for this date.");

  db().prepare("UPDATE qbo_connections SET last_sync_at=datetime('now'), last_sync_status=? WHERE id=?")
    .run(warnings.length ? `Synced with ${warnings.length} warning(s)` : "Synced cleanly", conn.id);

  return { plLines, arBuckets, warnings };
}

/**
 * Apply a QBO pull into the working period ledger (P&L + AR only).
 * Does not touch payroll, cash, or published release snapshots.
 * Extracted so the Integration Hub and /api/qbo/sync share one write path.
 */
export function applySyncToPeriod(
  clientId: string,
  year: number,
  month: number,
  result: SyncResult,
): { periodId: string; gate: GateResult } {
  const d = db();

  const entities: any[] = d.prepare("SELECT * FROM entities WHERE client_id=?").all(clientId);
  const byName = new Map(entities.map((e) => [e.name.toLowerCase(), e.id]));

  let period: any = d.prepare("SELECT * FROM periods WHERE client_id=? AND year=? AND month=?")
    .get(clientId, year, month);
  if (!period) {
    const pid = uid();
    d.prepare("INSERT INTO periods (id,client_id,year,month,status) VALUES (?,?,?,?,'AWAITING')")
      .run(pid, clientId, year, month);
    period = { id: pid };
  } else {
    assertEditable(period.id);
  }
  const pid = period.id;

  const write = d.transaction(() => {
    d.prepare("DELETE FROM pl_lines WHERE period_id=?").run(pid);
    d.prepare("DELETE FROM ar_buckets WHERE period_id=?").run(pid);
    for (const l of result.plLines) {
      const eid = byName.get(l.entityName.toLowerCase());
      if (!eid) continue;
      d.prepare("INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)")
        .run(uid(), pid, eid, l.category, l.label, l.amount);
    }
    for (const b of result.arBuckets) {
      d.prepare("INSERT INTO ar_buckets (id,period_id,payer,b0_30,b31_60,b61_90,b90p) VALUES (?,?,?,?,?,?,?)")
        .run(uid(), pid, b.payer, b.b0_30, b.b31_60, b.b61_90, b.b90p);
    }
  });
  write();

  const gate = runGate(pid);
  if (!gate.pass) d.prepare("UPDATE periods SET status='GATED' WHERE id=?").run(pid);
  return { periodId: pid, gate };
}

/** Pull from QBO and write into the working period — used by Integration Hub. */
export async function syncPeriodIntoLedger(clientId: string, year: number, month: number) {
  const result = await syncPeriod(clientId, year, month);
  const applied = applySyncToPeriod(clientId, year, month, result);
  return { ...result, ...applied };
}
