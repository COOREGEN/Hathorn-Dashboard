/**
 * Firm-level feature entitlements (technical enablement — not billing).
 */

import { db } from "../db";

export const FIRM_CAPABILITIES = [
  "FPA",
  "TAX_INTELLIGENCE",
  "ACCOUNTING_GUIDANCE",
  "COPILOT",
  "CLIENT_PORTAL",
  "DOCUMENT_INTELLIGENCE",
  "INTEGRATION_HUB",
  "CLOSE_AUTOMATION",
  "FINANCIAL_INTELLIGENCE",
] as const;

export type FirmCapability = (typeof FIRM_CAPABILITIES)[number];

export function ensureFirmCapabilities(firmId: string, updatedBy?: string | null) {
  const ins = db().prepare(`
    INSERT OR IGNORE INTO firm_capabilities (firm_id, capability, enabled, updated_by)
    VALUES (?, ?, 1, ?)
  `);
  for (const c of FIRM_CAPABILITIES) ins.run(firmId, c, updatedBy ?? null);
}

export function listFirmCapabilities(firmId: string): { capability: string; enabled: boolean }[] {
  ensureFirmCapabilities(firmId);
  const rows: any[] = db().prepare(
    `SELECT capability, enabled FROM firm_capabilities WHERE firm_id=? ORDER BY capability`,
  ).all(firmId);
  return rows.map((r) => ({ capability: r.capability, enabled: Boolean(r.enabled) }));
}

export function firmCapabilityEnabled(firmId: string, capability: FirmCapability): boolean {
  ensureFirmCapabilities(firmId);
  const row: any = db().prepare(
    `SELECT enabled FROM firm_capabilities WHERE firm_id=? AND capability=?`,
  ).get(firmId, capability);
  return row ? Boolean(row.enabled) : true;
}

export function setFirmCapability(
  firmId: string,
  capability: FirmCapability,
  enabled: boolean,
  updatedBy?: string | null,
) {
  if (!(FIRM_CAPABILITIES as readonly string[]).includes(capability)) {
    throw new Error(`Unknown capability: ${capability}`);
  }
  db().prepare(`
    INSERT INTO firm_capabilities (firm_id, capability, enabled, updated_at, updated_by)
    VALUES (?, ?, ?, datetime('now'), ?)
    ON CONFLICT(firm_id, capability) DO UPDATE SET
      enabled=excluded.enabled,
      updated_at=datetime('now'),
      updated_by=excluded.updated_by
  `).run(firmId, capability, enabled ? 1 : 0, updatedBy ?? null);
}
