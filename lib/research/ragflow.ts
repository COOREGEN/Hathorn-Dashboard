/**
 * RAGFlow adapter stub.
 *
 * RAGFLOW: DEFERRED
 *
 * Evaluated for Phase 4. RAGFlow is a full retrieval platform (services, memory,
 * ops surface) that does not clearly beat Hathorn-native chunk search for the
 * initial controlled corpus. Accounting Guidance ships with NativeResearchRetriever.
 *
 * Hathorn never requires RAGFlow to boot. If a future deploy runs RAGFlow
 * separately, wire it behind ResearchRetriever without vendoring its tree.
 */

export type RagflowStatus = {
  enabled: boolean;
  available: boolean;
  reason: string;
};

export function ragflowStatus(): RagflowStatus {
  const enabled = !["0", "false", "no", "off", ""].includes(
    String(process.env.RAGFLOW_ENABLED ?? "0").toLowerCase(),
  );
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      reason: "RAGFLOW: DEFERRED — native retrieval is the supported path (RAGFLOW_ENABLED off).",
    };
  }
  return {
    enabled: true,
    available: false,
    reason: "RAGFLOW: DEFERRED — flag on but no RAGFlow service is wired in this phase.",
  };
}
