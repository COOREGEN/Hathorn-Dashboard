/**
 * Multi-firm tenancy.
 *
 * Every request that touches firm-owned data must resolve a server-validated firm
 * context. Browser-supplied firm/client ids are never trusted as authorization —
 * they are candidates that must match membership and ownership.
 *
 * Policy (Phase 8): staff with an ACTIVE firm membership may access every client
 * in that firm. Client users are scoped to their own client_id. Platform admins
 * administer firms; they do not silently browse another firm's books.
 */

import { db, uid } from "./db";
import { AuthError, getSession, requireRole, type Role, type Session } from "./auth";
import { hexColour, text, uniqueSlug, ValidationError } from "./validate";

export type FirmStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type MembershipStatus = "ACTIVE" | "INVITED" | "DISABLED";

export type Firm = {
  id: string;
  name: string;
  slug: string;
  status: FirmStatus;
  supportEmail: string | null;
  primaryContact: string | null;
  brandPrimary: string;
  brandAccent: string;
  logoText: string | null;
  logoData: string | null;
  reportFooter: string | null;
  clientPortalName: string | null;
  showPlatformMark: boolean;
  featureFlags: Record<string, boolean>;
  customDomain: string | null;
};

export type FirmMembership = {
  id: string;
  firmId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
};

export type FirmContext = {
  session: Session;
  firm: Firm;
  membership: FirmMembership | null;
};

const RESERVED_FIRM_SLUGS = new Set([
  "admin", "api", "www", "app", "login", "portal", "platform", "hathorn",
  "dashboard", "static", "assets", "health",
]);

function mapFirm(r: any): Firm {
  let flags: Record<string, boolean> = {};
  try { flags = JSON.parse(r.feature_flags || "{}"); } catch { flags = {}; }
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    supportEmail: r.support_email,
    primaryContact: r.primary_contact,
    brandPrimary: r.brand_primary || "#2C504D",
    brandAccent: r.brand_accent || "#DB5928",
    logoText: r.logo_text,
    logoData: r.logo_data,
    reportFooter: r.report_footer,
    clientPortalName: r.client_portal_name,
    showPlatformMark: Boolean(r.show_platform_mark ?? 1),
    featureFlags: flags,
    customDomain: r.custom_domain,
  };
}

export function getFirm(firmId: string): Firm | null {
  const r: any = db().prepare("SELECT * FROM firms WHERE id=?").get(firmId);
  return r ? mapFirm(r) : null;
}

export function getFirmBySlug(slug: string): Firm | null {
  const r: any = db().prepare("SELECT * FROM firms WHERE slug=?").get(slug);
  return r ? mapFirm(r) : null;
}

export function firmIdForClient(clientId: string): string | null {
  const r: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(clientId);
  return r?.firm_id ?? null;
}

export function clientBelongsToFirm(clientId: string, firmId: string): boolean {
  const r: any = db().prepare(
    "SELECT 1 FROM clients WHERE id=? AND firm_id=?",
  ).get(clientId, firmId);
  return Boolean(r);
}

export function activeMembership(userId: string, firmId: string): FirmMembership | null {
  const r: any = db().prepare(
    `SELECT * FROM firm_memberships
      WHERE user_id=? AND firm_id=? AND status='ACTIVE'`,
  ).get(userId, firmId);
  if (!r) return null;
  return {
    id: r.id, firmId: r.firm_id, userId: r.user_id,
    role: r.role, status: r.status,
  };
}

export function listMemberships(userId: string): FirmMembership[] {
  const rows: any[] = db().prepare(
    `SELECT * FROM firm_memberships WHERE user_id=? AND status='ACTIVE' ORDER BY created_at`,
  ).all(userId);
  return rows.map((r) => ({
    id: r.id, firmId: r.firm_id, userId: r.user_id,
    role: r.role, status: r.status,
  }));
}

export function listFirmsForUser(userId: string): Firm[] {
  const rows: any[] = db().prepare(
    `SELECT f.* FROM firms f
       JOIN firm_memberships m ON m.firm_id = f.id
      WHERE m.user_id=? AND m.status='ACTIVE' AND f.status='ACTIVE'
      ORDER BY f.name`,
  ).all(userId);
  return rows.map(mapFirm);
}

/** Resolve the firm a session should operate in. Revalidated every request. */
export function resolveActiveFirmId(session: {
  userId: string; role: Role; clientId: string | null; firmId?: string | null;
}): string | null {
  if (session.role === "CLIENT" && session.clientId) {
    return firmIdForClient(session.clientId);
  }
  const memberships = listMemberships(session.userId);
  if (!memberships.length) return null;
  if (session.firmId && memberships.some((m) => m.firmId === session.firmId)) {
    return session.firmId;
  }
  return memberships[0].firmId;
}

/**
 * Staff + firm-admin path. Throws 403 with a generic message (no cross-tenant leakage).
 */
export async function requireFirmContext(preferredFirmId?: string | null): Promise<FirmContext> {
  const session = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
  let firmId = preferredFirmId || session.firmId;
  if (session.role === "CLIENT") {
    firmId = session.clientId ? firmIdForClient(session.clientId) : null;
  } else if (!firmId || !activeMembership(session.userId, firmId)) {
    firmId = resolveActiveFirmId(session);
  }
  if (!firmId) throw new AuthError(403, "Resource not found.");
  const firm = getFirm(firmId);
  if (!firm || firm.status !== "ACTIVE") throw new AuthError(403, "Resource not found.");

  if (session.role === "CLIENT") {
    return { session, firm, membership: activeMembership(session.userId, firmId) };
  }
  const membership = activeMembership(session.userId, firmId);
  if (!membership) throw new AuthError(403, "Resource not found.");
  return { session, firm, membership };
}

export async function requirePlatformAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthError(401);
  if (!session.isPlatformAdmin) throw new AuthError(403, "Resource not found.");
  return session;
}

export async function requireFirmAdmin(firmId?: string): Promise<FirmContext> {
  const ctx = await requireFirmContext(firmId);
  if (ctx.session.role !== "ADMIN" && ctx.membership?.role !== "ADMIN") {
    throw new AuthError(403, "Resource not found.");
  }
  return ctx;
}

/**
 * Clients visible to this session inside the active firm.
 * Filtering is server-side — never load all clients and filter in the UI.
 */
export function listClientsForFirm(firmId: string): { id: string; name: string; slug?: string }[] {
  return db().prepare(
    `SELECT id, name, slug FROM clients WHERE firm_id=? ORDER BY name`,
  ).all(firmId) as any[];
}

export function listClientIdsForFirm(firmId: string): string[] {
  return (db().prepare("SELECT id FROM clients WHERE firm_id=?").all(firmId) as any[])
    .map((r) => r.id);
}

/** Assert a client id is in the caller's firm. Generic 403 on miss. */
export async function requireClientInFirm(clientId: string): Promise<FirmContext & { clientId: string }> {
  if (!clientId) throw new AuthError(403, "Resource not found.");
  const ownerFirm = firmIdForClient(clientId);
  if (!ownerFirm) throw new AuthError(403, "Resource not found.");

  const session = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
  if (session.role === "CLIENT") {
    if (session.clientId !== clientId) throw new AuthError(403, "Resource not found.");
    const firm = getFirm(ownerFirm);
    if (!firm) throw new AuthError(403, "Resource not found.");
    return {
      session, firm, membership: activeMembership(session.userId, ownerFirm), clientId,
    };
  }

  const membership = activeMembership(session.userId, ownerFirm);
  if (!membership) throw new AuthError(403, "Resource not found.");
  const firm = getFirm(ownerFirm);
  if (!firm || firm.status !== "ACTIVE") throw new AuthError(403, "Resource not found.");
  return { session, firm, membership, clientId };
}

/** Period → client → firm chain. */
export async function requirePeriodAccess(periodId: string): Promise<FirmContext & {
  clientId: string; periodId: string;
}> {
  const period: any = db().prepare("SELECT id, client_id FROM periods WHERE id=?").get(periodId);
  if (!period) throw new AuthError(403, "Resource not found.");
  const ctx = await requireClientInFirm(period.client_id);
  return { ...ctx, periodId: period.id };
}

export function orphanReport(): {
  clientsWithoutFirm: number;
  documentsWithoutClient: number;
  releasesWithoutClient: number;
  membershipsWithoutFirm: number;
  staffWithoutMembership: number;
} {
  const clientsWithoutFirm = (db().prepare(
    "SELECT COUNT(*) n FROM clients WHERE firm_id IS NULL OR firm_id=''",
  ).get() as any).n;
  const documentsWithoutClient = (db().prepare(
    `SELECT COUNT(*) n FROM source_documents
      WHERE client_id IS NULL OR client_id=''
         OR client_id NOT IN (SELECT id FROM clients)`,
  ).get() as any).n;
  const releasesWithoutClient = (db().prepare(
    `SELECT COUNT(*) n FROM release_records
      WHERE client_id IS NULL OR client_id NOT IN (SELECT id FROM clients)`,
  ).get() as any).n;
  const membershipsWithoutFirm = (db().prepare(
    `SELECT COUNT(*) n FROM firm_memberships
      WHERE firm_id NOT IN (SELECT id FROM firms)`,
  ).get() as any).n;
  const staffWithoutMembership = (db().prepare(
    `SELECT COUNT(*) n FROM users u
      WHERE u.role IN ('ADMIN','ADVISOR','BOOKKEEPER')
        AND COALESCE(u.is_platform_admin,0)=0
        AND NOT EXISTS (
          SELECT 1 FROM firm_memberships m
           WHERE m.user_id=u.id AND m.status='ACTIVE'
        )`,
  ).get() as any).n;
  return {
    clientsWithoutFirm, documentsWithoutClient, releasesWithoutClient,
    membershipsWithoutFirm, staffWithoutMembership,
  };
}

/* ------------------------------------------------------------------ */
/* Firm provisioning & settings                                        */
/* ------------------------------------------------------------------ */

export function createFirm(input: {
  name: string;
  slug?: string;
  adminUserId?: string;
  brandPrimary?: string;
  brandAccent?: string;
}): Firm {
  const name = text(input.name, "Firm name", 120);
  const slug = uniqueSlug(String(input.slug || name), (candidate) => {
    if (RESERVED_FIRM_SLUGS.has(candidate)) return true;
    return Boolean(db().prepare("SELECT 1 FROM firms WHERE slug=?").get(candidate));
  });
  const id = uid();
  const primary = input.brandPrimary ? hexColour(input.brandPrimary, "Primary colour") : "#2C504D";
  const accent = input.brandAccent ? hexColour(input.brandAccent, "Accent colour") : "#DB5928";

  db().prepare(`
    INSERT INTO firms
      (id, name, slug, status, brand_primary, brand_accent, logo_text, report_footer, client_portal_name)
    VALUES (?,?,?,'ACTIVE',?,?,?,?,?)
  `).run(
    id, name, slug, primary, accent,
    name.toUpperCase().slice(0, 40),
    `Prepared by ${name}`,
    "Client Portal",
  );

  if (input.adminUserId) {
    db().prepare(`
      INSERT INTO firm_memberships (id, firm_id, user_id, role, status)
      VALUES (?, ?, ?, 'ADMIN', 'ACTIVE')
    `).run(uid(), id, input.adminUserId);
  }
  return getFirm(id)!;
}

export function updateFirmSettings(firmId: string, patch: Record<string, unknown>): Firm {
  const firm = getFirm(firmId);
  if (!firm) throw new ValidationError("Firm not found.");

  const name = patch.name != null ? text(patch.name, "Firm name", 120) : firm.name;
  const supportEmail = patch.supportEmail != null
    ? (text(patch.supportEmail, "Support email", 200, false) || null)
    : firm.supportEmail;
  const primaryContact = patch.primaryContact != null
    ? (text(patch.primaryContact, "Primary contact", 120, false) || null)
    : firm.primaryContact;
  const brandPrimary = patch.brandPrimary != null
    ? hexColour(patch.brandPrimary, "Primary colour") : firm.brandPrimary;
  const brandAccent = patch.brandAccent != null
    ? hexColour(patch.brandAccent, "Accent colour") : firm.brandAccent;
  const logoText = patch.logoText != null
    ? (text(patch.logoText, "Wordmark", 60, false) || null) : firm.logoText;
  const reportFooter = patch.reportFooter != null
    ? (text(patch.reportFooter, "Report footer", 240, false) || null) : firm.reportFooter;
  const clientPortalName = patch.clientPortalName != null
    ? (text(patch.clientPortalName, "Portal name", 80, false) || null) : firm.clientPortalName;
  const showPlatformMark = patch.showPlatformMark != null
    ? (patch.showPlatformMark ? 1 : 0) : (firm.showPlatformMark ? 1 : 0);

  // Controlled tokens only — never accept raw CSS / script.
  if (patch.customCss != null || patch.customJs != null || patch.htmlInjection != null) {
    throw new ValidationError("Custom CSS, JavaScript, and HTML are not allowed.");
  }

  db().prepare(`
    UPDATE firms SET
      name=?, support_email=?, primary_contact=?,
      brand_primary=?, brand_accent=?, logo_text=?,
      report_footer=?, client_portal_name=?, show_platform_mark=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    name, supportEmail, primaryContact, brandPrimary, brandAccent,
    logoText, reportFooter, clientPortalName, showPlatformMark, firmId,
  );
  return getFirm(firmId)!;
}

export function listFirmMembers(firmId: string): {
  userId: string; name: string; email: string; role: string; status: string;
}[] {
  return db().prepare(`
    SELECT u.id userId, u.name, u.email, m.role, m.status
      FROM firm_memberships m
      JOIN users u ON u.id = m.user_id
     WHERE m.firm_id=?
     ORDER BY u.name
  `).all(firmId) as any[];
}

export function ensureMembership(firmId: string, userId: string, role: Role) {
  db().prepare(`
    INSERT INTO firm_memberships (id, firm_id, user_id, role, status)
    VALUES (?, ?, ?, ?, 'ACTIVE')
    ON CONFLICT(firm_id, user_id) DO UPDATE SET role=excluded.role, status='ACTIVE'
  `).run(uid(), firmId, userId, role);
}

export function brandingForClient(clientId: string): {
  firmName: string;
  reportFooter: string;
  brandPrimary: string;
  brandAccent: string;
  logoText: string | null;
  showPlatformMark: boolean;
  clientPortalName: string;
} {
  const firmId = firmIdForClient(clientId);
  const firm = firmId ? getFirm(firmId) : null;
  return {
    firmName: firm?.name || "Hathorn Advisory Group",
    reportFooter: firm?.reportFooter || `Prepared by ${firm?.name || "Hathorn Advisory Group"}`,
    brandPrimary: firm?.brandPrimary || "#2C504D",
    brandAccent: firm?.brandAccent || "#DB5928",
    logoText: firm?.logoText || null,
    showPlatformMark: firm?.showPlatformMark ?? true,
    clientPortalName: firm?.clientPortalName || "Client Portal",
  };
}
