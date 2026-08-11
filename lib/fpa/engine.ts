/**
 * Engine router — native always works; Forge only when explicitly enabled and available.
 */

import { runNativeForecast } from "./native-engine";
import { forgeStatus, runForgeForecast } from "./forge-engine";
import type {
  ActualPoint, Assumptions, EngineKind, ModelCheck, ModelResults, ScenarioKey,
} from "./types";

export type EngineRun = {
  results: ModelResults;
  checks: ModelCheck[];
  engine: EngineKind;
  engineVersion: string;
};

/**
 * preferForge=true only when the caller asked for Forge AND it is available.
 * On Forge failure we do NOT silently fall back and claim Forge — we surface the error
 * unless preferForge is false (default), in which case we use native.
 */
export async function runForecast(opts: {
  history: ActualPoint[];
  baseline: ActualPoint;
  assumptions: Assumptions;
  scenario: ScenarioKey;
  preferForge?: boolean;
}): Promise<EngineRun> {
  const st = forgeStatus();
  if (opts.preferForge) {
    // Caller asked for Forge — never silently substitute native under a Forge badge.
    if (!st.enabled || !st.available) {
      throw new Error(st.reason || "Forge is not available.");
    }
    try {
      const out = await runForgeForecast({
        assumptions: opts.assumptions,
        scenario: opts.scenario,
        baselineRevenue: opts.baseline.revenue,
      });
      return { ...out, engine: "forge" };
    } catch (e: any) {
      throw new Error(`Forge engine failed: ${e?.message || e}`);
    }
  }

  const out = runNativeForecast(opts);
  return { ...out, engine: "native" };
}

export { forgeStatus };
