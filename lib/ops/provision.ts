/**
 * Hardened firm / client provisioning — never SQL-insert production tenants.
 *
 * Firm: create → defaults → admin → brand → close policy → capabilities → audit
 * Client: create → firm → fiscal defaults → portal config → close template → audit
 * Safe defaults: least privilege, no integrations, nothing published.
 */

import { db, uid } from "../db";
import { audit } from "../auth";
import { createFirm, getFirm } from "../tenancy";
import { ensureFirmCapabilities, setFirmCapability, type FirmCapability } from "./capabilities";
import { ensureFirmDefaultPolicy } from "../close/policy";
import { uniqueSlug, text, hexColour, ValidationError } from "../validate";

export function provisionFirm(input: {
  name: string;
  slug?: string;
  adminUserId: string;
  brandPrimary?: string;
  brandAccent?: string;
  capabilities?: Partial<Record<FirmCapability, boolean>>;
  actorId: string;
}) {
  const firm = createFirm({
    name: input.name,
    slug: input.slug,
    adminUserId: input.adminUserId,
    brandPrimary: input.brandPrimary,
    brandAccent: input.brandAccent,
  });

  ensureFirmDefaultPolicy();
  ensureFirmCapabilities(firm.id, input.actorId);

  if (input.capabilities) {
    for (const [cap, enabled] of Object.entries(input.capabilities)) {
      if (enabled === undefined) continue;
      setFirmCapability(firm.id, cap as FirmCapability, Boolean(enabled), input.actorId);
    }
  }

  audit(input.actorId, "PLATFORM_FIRM_PROVISIONED", firm.id, { firmId: firm.id });
  return {
    firm: getFirm(firm.id)!,
    defaults: {
      closePolicy: "firm default ensured",
      capabilities: "initialized",
      integrations: "none connected",
      publishedData: "none",
    },
  };
}

export function provisionClient(input: {
  firmId: string;
  name: string;
  slug?: string;
  template?: string;
  brandPrimary?: string;
  brandAccent?: string;
  enablePortal?: boolean;
  actorId: string;
}) {
  const firm = getFirm(input.firmId);
  if (!firm || firm.status !== "ACTIVE") throw new ValidationError("Firm not found or inactive.");

  const name = text(input.name, "Client name", 120);
  const slug = uniqueSlug(String(input.slug || name), (candidate) =>
    Boolean(db().prepare("SELECT 1 FROM clients WHERE slug=?").get(candidate)),
  );
  const id = uid();
  const primary = input.brandPrimary
    ? hexColour(input.brandPrimary, "Primary colour")
    : firm.brandPrimary || "#2C504D";
  const accent = input.brandAccent
    ? hexColour(input.brandAccent, "Accent colour")
    : firm.brandAccent || "#DB5928";
  const template = ["editorial", "modern", "executive"].includes(String(input.template || ""))
    ? String(input.template)
    : "editorial";

  db().prepare(`
    INSERT INTO clients
      (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text,
       target_labor_lo, target_labor_hi)
    VALUES (?,?,?,?,?,?,?,?,65,72)
  `).run(
    id, input.firmId, name, slug, template, primary, accent,
    name.toUpperCase().slice(0, 40),
  );

  // Portal config — least privilege visibility; portal sections on but no published data yet.
  const showPortal = input.enablePortal !== false ? 1 : 0;
  db().prepare(`
    INSERT OR IGNORE INTO client_portal_config
      (client_id, firm_id, show_planning, show_documents, show_insights, show_copilot,
       show_financial_statements, show_reports, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    id, input.firmId,
    showPortal, showPortal, showPortal, showPortal, showPortal, showPortal,
    input.actorId,
  );

  audit(input.actorId, "CLIENT_PROVISIONED", id, {
    firmId: input.firmId, clientId: id,
  });

  return {
    clientId: id,
    name,
    slug,
    firmId: input.firmId,
    defaults: {
      integrations: "none",
      publishedPeriods: "none",
      portal: showPortal ? "configured (empty until publish)" : "disabled",
    },
  };
}

/** Controlled offboarding — disable access, keep history. Never hard-delete. */
export function archiveFirm(firmId: string, actorId: string) {
  const firm = getFirm(firmId);
  if (!firm) throw new ValidationError("Firm not found.");
  db().prepare(`UPDATE firms SET status='ARCHIVED' WHERE id=?`).run(firmId);
  db().prepare(`
    UPDATE firm_memberships SET status='DISABLED'
     WHERE firm_id=? AND status='ACTIVE'
  `).run(firmId);
  // Bump token_version for members so sessions die.
  db().prepare(`
    UPDATE users SET token_version = COALESCE(token_version,0) + 1
     WHERE id IN (SELECT user_id FROM firm_memberships WHERE firm_id=?)
  `).run(firmId);
  audit(actorId, "FIRM_ARCHIVED", firmId, { firmId });
  return { ok: true, firmId, status: "ARCHIVED" };
}

export function disableUser(userId: string, actorId: string) {
  db().prepare(`
    UPDATE firm_memberships SET status='DISABLED' WHERE user_id=? AND status='ACTIVE'
  `).run(userId);
  db().prepare(
    `UPDATE users SET token_version = COALESCE(token_version,0) + 1 WHERE id=?`,
  ).run(userId);
  audit(actorId, "USER_DISABLED", userId);
  return { ok: true, userId };
}
