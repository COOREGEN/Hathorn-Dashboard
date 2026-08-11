/**
 * IRS Fact Graph adapter stub.
 *
 * FACT GRAPH PILOT: BLOCKED — TAX MODULE STILL WORKS
 *
 * Inspected 2026-08-10 (https://github.com/IRS-Public/fact-graph):
 *   - License: U.S. Government work / CC0 1.0 (commercial use permitted;
 *     no IRS endorsement — see THIRD_PARTY_NOTICES.md)
 *   - Runtime: Scala 3 cross-compiled to JVM + Scala.js (ESM .mjs)
 *   - Build requires sbt; no published npm package consumed here
 *   - sbt is not available in this environment; building the Scala.js artifact
 *     would add a multi-tool JVM toolchain to Hathorn without a narrow
 *     shippable JS binary
 *
 * Hathorn ships a native deterministic §179 pilot instead.
 * Set IRS_FACT_GRAPH_ENABLED=1 only when a prebuilt artifact path is provided
 * via IRS_FACT_GRAPH_MODULE — otherwise the adapter reports blocked.
 */

export type FactGraphStatus = {
  enabled: boolean;
  available: boolean;
  reason: string;
};

export function factGraphStatus(): FactGraphStatus {
  const enabled = !["0", "false", "no", "off", ""].includes(
    String(process.env.IRS_FACT_GRAPH_ENABLED ?? "0").toLowerCase(),
  );
  const modulePath = process.env.IRS_FACT_GRAPH_MODULE || "";
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      reason: "IRS_FACT_GRAPH_ENABLED is off (default). Native Hathorn tax rules remain available.",
    };
  }
  if (!modulePath) {
    return {
      enabled: true,
      available: false,
      reason:
        "FACT GRAPH PILOT: BLOCKED — no IRS_FACT_GRAPH_MODULE artifact. " +
        "Build Scala.js output externally and point IRS_FACT_GRAPH_MODULE at the .mjs file.",
    };
  }
  return {
    enabled: true,
    available: false,
    reason:
      "FACT GRAPH PILOT: BLOCKED — module path set but runtime loader is not wired in this phase. Use native rules.",
  };
}
