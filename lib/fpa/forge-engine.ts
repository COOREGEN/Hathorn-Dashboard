/**
 * Forge FP&A pilot adapter.
 *
 * FORGE PILOT: BLOCKED — NOT REQUIRED
 *
 * Attempted 2026-08-10 in this environment:
 *   - `cargo install mollendorff-ai-forge` — crate not on crates.io under that name
 *   - Cloned https://github.com/mollendorff-ai/forge outside the repo
 *   - `cargo build --release` failed: dependency requires Rust edition 2024 /
 *     Cargo newer than 1.83.0 available here
 *
 * Hathorn never boots on Forge. This module exists so the engine router can
 * report a controlled error when FORGE_ENABLED=1 without silent mislabeling.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import type { Assumptions, ModelCheck, ModelResults, ScenarioKey } from "./types";

export type ForgeStatus = {
  enabled: boolean;
  available: boolean;
  reason: string;
  bin: string;
};

export function forgeStatus(): ForgeStatus {
  const enabled = !["0", "false", "no", "off", ""].includes(
    String(process.env.FORGE_ENABLED ?? "0").toLowerCase(),
  );
  const bin = process.env.FORGE_BIN || "forge";
  if (!enabled) {
    return { enabled: false, available: false, reason: "FORGE_ENABLED is off (default).", bin };
  }
  // Resolve PATH / absolute path without shell.
  const onPath = (() => {
    if (bin.includes("/") && existsSync(bin)) return true;
    const pathEnv = process.env.PATH || "";
    return pathEnv.split(":").some((dir) => existsSync(`${dir}/${bin}`));
  })();
  if (!onPath) {
    return {
      enabled: true, available: false, bin,
      reason: "FORGE PILOT: BLOCKED — forge binary not found. Native engine is the supported path.",
    };
  }
  return { enabled: true, available: true, bin, reason: "Forge binary present." };
}

/**
 * Attempt a Forge CLI calculate. Never invoked unless explicitly enabled AND available.
 * Uses execFile-equivalent spawn with fixed args — no shell interpolation.
 */
export async function runForgeForecast(_opts: {
  assumptions: Assumptions;
  scenario: ScenarioKey;
  baselineRevenue: number;
}): Promise<{ results: ModelResults; checks: ModelCheck[]; engineVersion: string }> {
  const st = forgeStatus();
  if (!st.enabled || !st.available) {
    throw new Error(st.reason || "Forge is not available.");
  }

  // Probe version with a hard timeout; do not calculate until the binary answers.
  const version = await new Promise<string>((resolve, reject) => {
    const child = spawn(st.bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Forge --version timed out."));
    }, 5_000);
    child.stdout.on("data", (d) => { out += d; if (out.length > 4_096) child.kill("SIGKILL"); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Forge --version exited ${code}`));
      else resolve(out.trim() || "forge-unknown");
    });
  });

  throw new Error(
    `Forge binary responded (${version}) but YAML model bridging is not wired in this pilot. ` +
    "Use the native engine. Never label native results as Forge.",
  );
}
