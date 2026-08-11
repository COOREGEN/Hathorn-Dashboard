/**
 * Takes a verified snapshot and prunes old ones.
 *
 *   npx tsx scripts/backup.ts
 *
 * Intended for cron. Daily is the minimum for a book that changes monthly; hourly costs
 * almost nothing at this database size and turns "we lost a day" into "we lost an hour":
 *
 *   0 * * * * cd /srv/ledger && npm run backup >> /var/log/ledger-backup.log 2>&1
 */
import { createBackup, pruneBackups, backupStatus } from "../lib/backup";

async function main() {
  const reason = process.argv[2] || "scheduled";
  const b = await createBackup(reason);
  console.log(`Created ${b.name} (${(b.sizeBytes / 1024 / 1024).toFixed(1)} MB) — ${b.note}`);

  const pruned = pruneBackups();
  if (pruned.removed.length) console.log(`Pruned ${pruned.removed.length}, kept ${pruned.kept.length}.`);

  const st = backupStatus();
  console.log(`${st.count} snapshots, ${(st.totalBytes / 1024 / 1024).toFixed(1)} MB total.`);
  if (!st.healthy) { console.error("WARNING: latest snapshot is stale."); process.exit(1); }
}
main().catch((e) => { console.error("Backup failed:", e.message); process.exit(1); });
