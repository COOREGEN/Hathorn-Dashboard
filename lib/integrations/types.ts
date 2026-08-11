/**
 * Integration Hub types — connect once, normalize once, use everywhere.
 * Provider quirks stop at the adapter boundary.
 */

export type ProviderKey = "quickbooks" | "file" | "mock";

export type IntegrationCapability =
  | "GENERAL_LEDGER"
  | "PROFIT_AND_LOSS"
  | "BALANCE_SHEET"
  | "ACCOUNTS_RECEIVABLE"
  | "ACCOUNTS_PAYABLE"
  | "TRANSACTIONS"
  | "PAYROLL"
  | "INVOICES"
  | "CUSTOMERS"
  | "VENDORS"
  | "BANK_BALANCES"
  | "PAYMENTS"
  | "OPERATING_METRICS"
  | "FILE_IMPORT";

export type ConnectionStatus =
  | "CONNECTED"
  | "SYNCING"
  | "DEGRADED"
  | "RECONNECT_REQUIRED"
  | "DISCONNECTED"
  | "ERROR";

export type SyncRunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type SyncType = "INCREMENTAL" | "FULL" | "MANUAL" | "IMPORT";

export type ErrorClass =
  | "TRANSIENT"
  | "AUTH"
  | "RATE_LIMIT"
  | "VALIDATION"
  | "PERMANENT"
  | "UNKNOWN";

export type HealthLabel = "HEALTHY" | "STALE" | "DEGRADED" | "RECONNECT_REQUIRED" | "DISCONNECTED";

export type CapabilityReadiness = "CURRENT" | "STALE" | "NOT_AVAILABLE" | "ERROR";

export type ProviderDefinition = {
  key: ProviderKey;
  name: string;
  capabilities: IntegrationCapability[];
  authType: "oauth" | "file" | "none" | "api_key";
  configured: boolean;
  description: string;
};

export type HubConnection = {
  id: string;
  clientId: string;
  provider: ProviderKey;
  externalAccountId: string | null;
  externalAccountName: string | null;
  status: ConnectionStatus;
  connectedBy: string | null;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  metadata: Record<string, unknown>;
  /** Never include tokens — public view only. */
  health: HealthLabel;
  capabilities: IntegrationCapability[];
};

export type SyncRun = {
  id: string;
  connectionId: string;
  clientId: string;
  provider: ProviderKey;
  syncType: SyncType;
  status: SyncRunStatus;
  startedAt: string;
  completedAt: string | null;
  recordsReceived: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorCode: string | null;
  errorMessage: string | null;
  cursorOrCheckpoint: string | null;
  triggeredBy: string;
  metadata: Record<string, unknown>;
};

export type SyncRequest = {
  connectionId: string;
  clientId: string;
  triggeredBy: string;
  syncType?: SyncType;
  year?: number;
  month?: number;
  fullResync?: boolean;
  /** File provider / mock fixture payload. Never contains secrets. */
  importPayload?: {
    filename: string;
    sha256: string;
    docType: string;
    periodId?: string | null;
    rowCount?: number;
    /** Mock failure injection for tests only. */
    force?: "fail" | "auth" | "partial" | null;
  };
};

export type SyncOutcome = {
  run: SyncRun;
  warnings: string[];
  /** Provider-specific summary safe for the UI (no secrets). */
  summary: Record<string, unknown>;
};

export interface IntegrationProvider {
  key: ProviderKey;
  name: string;
  capabilities: IntegrationCapability[];
  isConfigured(): boolean;
  getConnectionHealth(clientId: string): Promise<{
    status: ConnectionStatus;
    health: HealthLabel;
    detail?: string;
  }>;
  sync(req: SyncRequest, connection: HubConnection): Promise<{
    recordsReceived: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsSkipped: number;
    warnings: string[];
    errorClass?: ErrorClass;
    errorCode?: string;
    errorMessage?: string;
    cursor?: string | null;
    summary?: Record<string, unknown>;
    partial?: boolean;
  }>;
  disconnect?(clientId: string): Promise<void>;
}

export const STALE_SYNC_HOURS = 72;
