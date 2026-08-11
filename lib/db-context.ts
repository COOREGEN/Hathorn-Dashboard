/**
 * Request-scoped database / RLS context.
 *
 * Postgres RLS policies read `app.current_firm_id` (and optionally
 * `app.platform_admin`) via SET LOCAL. Those settings must never leak across
 * pooled connections — they are applied inside a transaction per statement
 * group, driven by this AsyncLocalStorage bag.
 */
import { AsyncLocalStorage } from "async_hooks";

export type DbContextStore = {
  /** Active firm for RLS. Null/undefined → fail-closed (no firm rows). */
  firmId?: string | null;
  /** Authenticated user id — allows membership bootstrap before firm is chosen. */
  userId?: string | null;
  /** Platform admin escape hatch for /platform cross-firm ops only. */
  platformAdmin?: boolean;
};

const als = new AsyncLocalStorage<DbContextStore>();

export function getDbContext(): DbContextStore {
  return als.getStore() || {};
}

export function runWithDbContext<T>(ctx: DbContextStore, fn: () => T): T {
  return als.run({ ...getDbContext(), ...ctx }, fn);
}

export async function runWithDbContextAsync<T>(
  ctx: DbContextStore,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run({ ...getDbContext(), ...ctx }, fn);
}

function enter(patch: Partial<DbContextStore>) {
  const current = als.getStore() || {};
  // enterWith binds the store to the current async resource (Next.js request).
  als.enterWith({ ...current, ...patch });
}

export function setRlsFirmId(firmId: string | null | undefined) {
  enter({ firmId: firmId ?? null });
}

export function setRlsUserId(userId: string | null | undefined) {
  enter({ userId: userId ?? null });
}

export function setPlatformAdmin(enabled: boolean) {
  enter({ platformAdmin: enabled });
}

export function clearRlsContext() {
  enter({ firmId: null, userId: null, platformAdmin: false });
}

/**
 * Re-bind RLS onto the *caller's* async resource after `await getSession()`.
 * `enterWith` inside getSession does not reliably persist across Next.js RSC
 * await boundaries — callers must bind again in their own continuation.
 */
export function bindRlsFromSession(session: {
  userId: string;
  firmId?: string | null;
  isPlatformAdmin?: boolean;
} | null | undefined, opts?: { platformAdmin?: boolean }) {
  if (!session) {
    clearRlsContext();
    return;
  }
  enter({
    userId: session.userId,
    firmId: session.firmId ?? null,
    platformAdmin: opts?.platformAdmin ?? false,
  });
}
