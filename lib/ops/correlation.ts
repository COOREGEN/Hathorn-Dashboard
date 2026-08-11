/**
 * Request / job correlation IDs for support investigations.
 * Never put secrets in these IDs.
 */

import { AsyncLocalStorage } from "async_hooks";
import crypto from "crypto";

type CorrStore = {
  correlationId: string;
  firmId?: string | null;
  clientId?: string | null;
  userId?: string | null;
  operation?: string;
};

const als = new AsyncLocalStorage<CorrStore>();

export function newCorrelationId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function getCorrelation(): CorrStore {
  return als.getStore() || { correlationId: "no-corr" };
}

export function runWithCorrelation<T>(store: CorrStore, fn: () => T): T {
  return als.run(store, fn);
}

export async function runWithCorrelationAsync<T>(store: CorrStore, fn: () => Promise<T>): Promise<T> {
  return als.run(store, fn);
}

export function bindCorrelation(partial: Partial<CorrStore>) {
  const cur = getCorrelation();
  const next = { ...cur, ...partial };
  // ALS cannot mutate in place across awaits reliably — callers should prefer runWith*.
  Object.assign(cur, next);
}
