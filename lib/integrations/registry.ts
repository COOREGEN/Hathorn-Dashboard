import { config } from "../config";
import { isProductionLike, resolveAppEnv } from "../ops/env";
import { quickbooksProvider } from "./providers/quickbooks";
import { fileProvider } from "./providers/file";
import { mockProvider } from "./providers/mock";
import type { IntegrationProvider, ProviderDefinition, ProviderKey } from "./types";

const providers: Record<ProviderKey, IntegrationProvider> = {
  quickbooks: quickbooksProvider,
  file: fileProvider,
  mock: mockProvider,
};

/** Mock hub provider is for tests/proof only — never ambient on STAGING/PRODUCTION. */
export function mockIntegrationEnabled(): boolean {
  const flag = String(process.env.ENABLE_MOCK_INTEGRATION || "").toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return !isProductionLike(resolveAppEnv());
}

export function getProvider(key: ProviderKey): IntegrationProvider {
  if (key === "mock" && !mockIntegrationEnabled()) {
    throw new Error("Mock integration provider is disabled in this environment.");
  }
  const p = providers[key];
  if (!p) throw new Error(`Unknown integration provider: ${key}`);
  return p;
}

export function listProviderDefinitions(): ProviderDefinition[] {
  const list: ProviderDefinition[] = [
    {
      key: "quickbooks",
      name: "QuickBooks Online",
      capabilities: quickbooksProvider.capabilities,
      authType: "oauth",
      configured: config.qbo.enabled,
      description: "P&L by class and AR aging. Payroll stays CSV. Existing OAuth path preserved.",
    },
    {
      key: "file",
      name: "CSV / Excel",
      capabilities: fileProvider.capabilities,
      authType: "file",
      configured: true,
      description: "First-class file import with sync history and content-hash idempotency.",
    },
  ];
  if (mockIntegrationEnabled()) {
    list.push({
      key: "mock",
      name: "Mock Provider",
      capabilities: mockProvider.capabilities,
      authType: "none",
      configured: true,
      description: "Synthetic fixture provider for hub connect/sync/idempotency tests. Not for client demos.",
    });
  }
  return list;
}

export function providerRegistry() {
  return providers;
}
