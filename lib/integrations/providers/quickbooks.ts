/**
 * QuickBooks Online adapter — wraps existing lib/qbo.ts.
 * Does NOT rewrite OAuth, token encryption, or report parsing.
 */

import { config } from "../../config";
import {
  getConnection, syncPeriodIntoLedger, disconnect as qboDisconnect,
} from "../../qbo";
import { classifyProviderError, sanitizeErrorMessage } from "../health";
import type { HubConnection, IntegrationProvider, SyncRequest } from "../types";

export const quickbooksProvider: IntegrationProvider = {
  key: "quickbooks",
  name: "QuickBooks Online",
  capabilities: [
    "PROFIT_AND_LOSS",
    "ACCOUNTS_RECEIVABLE",
    "GENERAL_LEDGER",
  ],
  isConfigured() {
    return config.qbo.enabled;
  },
  async getConnectionHealth(clientId) {
    const c = getConnection(clientId);
    if (!c) return { status: "DISCONNECTED", health: "DISCONNECTED" };
    if (/auth|reconnect|revoked|invalid_grant/i.test(c.last_sync_status || "")) {
      return { status: "RECONNECT_REQUIRED", health: "RECONNECT_REQUIRED", detail: c.last_sync_status };
    }
    if (!c.last_sync_at) {
      return { status: "CONNECTED", health: "STALE", detail: "Connected but never synced." };
    }
    return { status: "CONNECTED", health: "HEALTHY", detail: c.last_sync_status || undefined };
  },
  async sync(req: SyncRequest, _connection: HubConnection) {
    const year = req.year || new Date().getFullYear();
    const month = req.month || (new Date().getMonth() + 1);
    try {
      // Shared write path with /api/qbo/sync — working period only, not releases.
      const result = await syncPeriodIntoLedger(req.clientId, year, month);
      const received = result.plLines.length + result.arBuckets.length;
      return {
        recordsReceived: received,
        recordsCreated: received,
        recordsUpdated: 0,
        recordsSkipped: result.warnings.length,
        warnings: result.warnings,
        summary: {
          year, month,
          periodId: result.periodId,
          plLines: result.plLines.length,
          arRows: result.arBuckets.length,
          gatePass: result.gate.pass,
          note: "Writes working period P&L/AR only. Does not mutate published release snapshots.",
        },
        cursor: `${year}-${String(month).padStart(2, "0")}`,
      };
    } catch (e: any) {
      const msg = sanitizeErrorMessage(e?.message || "QuickBooks sync failed");
      const { errorClass, errorCode } = classifyProviderError(msg);
      return {
        recordsReceived: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        warnings: [],
        errorClass,
        errorCode,
        errorMessage: msg,
        summary: { year, month },
      };
    }
  },
  async disconnect(clientId) {
    qboDisconnect(clientId);
  },
};
