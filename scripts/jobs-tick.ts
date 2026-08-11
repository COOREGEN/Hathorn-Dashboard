/**
 * Claim and process due background jobs.
 * Cron example: every minute — cd /srv/ledger && npm run jobs:tick
 */
import { tickJobs, enqueueMaintenanceSweep } from "../lib/ops/jobs";
import { log } from "../lib/db";

async function main() {
  // Hourly maintenance idempotency key uses the hour stamp inside enqueueMaintenanceSweep.
  if (new Date().getMinutes() < 2) {
    enqueueMaintenanceSweep("cron");
  }
  const result = await tickJobs(Number(process.env.JOBS_TICK_LIMIT || 8));
  log("info", "jobs.tick", result);
  console.log(JSON.stringify({ ok: true, ...result }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
