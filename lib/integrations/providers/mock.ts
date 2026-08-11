/**
 * MockIntegrationProvider — verifies hub connect/sync/idempotency without third-party credentials.
 */

import { upsertCanonicalRecord, upsertRawRecord } from "../staging";
import type { HubConnection, IntegrationProvider, SyncRequest } from "../types";

const FIXTURE = [
  { id: "mock-rev-1", type: "REVENUE_LINE", label: "Mock service revenue", amount: 120.5, period: "2026-04" },
  { id: "mock-ar-1", type: "AR_BALANCE", label: "Mock payer A", amount: 45.2, period: "2026-04" },
  { id: "mock-ar-2", type: "AR_BALANCE", label: "Mock payer B", amount: 18.0, period: "2026-04" },
];

export const mockProvider: IntegrationProvider = {
  key: "mock",
  name: "Mock Provider",
  capabilities: ["PROFIT_AND_LOSS", "ACCOUNTS_RECEIVABLE", "OPERATING_METRICS"],
  isConfigured() {
    return true;
  },
  async getConnectionHealth(clientId) {
    void clientId;
    return { status: "CONNECTED", health: "HEALTHY", detail: "Synthetic fixture provider." };
  },
  async sync(req: SyncRequest, connection: HubConnection) {
    const runId = (req as any)._runId || "pending";
    let created = 0, updated = 0, skipped = 0;

    const force = req.importPayload?.force;
    const forceFail = force === "fail" || req.importPayload?.docType === "FORCE_FAIL";
    const forceAuth = force === "auth" || req.importPayload?.docType === "FORCE_AUTH_FAIL";
    const forcePartial = force === "partial" || req.importPayload?.docType === "PARTIAL_FAIL";

    // Optional failure injection for tests
    if (forceFail) {
      return {
        recordsReceived: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0,
        warnings: [],
        errorClass: "TRANSIENT",
        errorCode: "TRANSIENT",
        errorMessage: "Simulated provider outage.",
        summary: { simulated: true },
      };
    }
    if (forceAuth) {
      return {
        recordsReceived: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0,
        warnings: [],
        errorClass: "AUTH",
        errorCode: "AUTH",
        errorMessage: "Simulated revoked credentials — reconnect required.",
        summary: { simulated: true },
      };
    }

    const records = forcePartial
      ? [...FIXTURE, { id: "mock-bad", type: "INVALID", label: "", amount: NaN, period: "2026-04" }]
      : FIXTURE;

    let failed = 0;
    for (const row of records) {
      if (!Number.isFinite(row.amount) || !row.label) {
        failed += 1;
        skipped += 1;
        continue;
      }
      const raw = upsertRawRecord({
        connectionId: connection.id,
        syncRunId: runId,
        provider: "mock",
        recordType: row.type,
        externalRecordId: row.id,
        externalUpdatedAt: "2026-04-30",
        payload: row,
      });
      if (raw.skipped) skipped += 1;
      else if (raw.created) created += 1;
      else if (raw.updated) updated += 1;

      const canon = upsertCanonicalRecord({
        clientId: req.clientId,
        connectionId: connection.id,
        syncRunId: runId,
        recordType: row.type,
        externalRecordId: row.id,
        periodKey: row.period,
        currency: "USD",
        sourceUpdatedAt: "2026-04-30",
        payload: {
          label: row.label,
          amount: row.amount,
          period: row.period,
          provider: "mock",
        },
      });
      if (canon.created) created += 1;
      else if (canon.updated) updated += 1;
    }

    return {
      recordsReceived: records.length,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      warnings: failed ? [`${failed} invalid fixture row(s) skipped.`] : [],
      partial: failed > 0,
      summary: {
        fixture: "mock-v1",
        note: "Synthetic data for hub testing. Does not write pl_lines or releases.",
      },
    };
  },
};
