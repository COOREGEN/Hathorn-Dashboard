import { config } from "../config";
import { quickbooksProvider } from "./providers/quickbooks";
import { fileProvider } from "./providers/file";
import { mockProvider } from "./providers/mock";
import type { IntegrationProvider, ProviderDefinition, ProviderKey } from "./types";

const providers: Record<ProviderKey, IntegrationProvider> = {
  quickbooks: quickbooksProvider,
  file: fileProvider,
  mock: mockProvider,
};

export function getProvider(key: ProviderKey): IntegrationProvider {
  const p = providers[key];
  if (!p) throw new Error(`Unknown integration provider: ${key}`);
  return p;
}

export function listProviderDefinitions(): ProviderDefinition[] {
  return [
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
    {
      key: "mock",
      name: "Mock Provider",
      capabilities: mockProvider.capabilities,
      authType: "none",
      configured: true,
      description: "Synthetic fixture provider for hub connect/sync/idempotency tests.",
    },
  ];
}

export function providerRegistry() {
  return providers;
}
