/**
 * Proves the latest backup can be opened and that core tables are present.
 *
 *   npm run restore-check
 *
 * Does not swap the live database — only verifies the newest snapshot. Run after
 * cron backups land, and before trusting a volume for production.
 */
import path from "path";
import { listBackups, verifyBackup } from "../lib/backup";
import { db } from "../lib/db";

async function main() {
  // Touch live DB so verifyBackup can compare row counts.
  db().prepare("SELECT 1").get();

  const all = listBackups();
  if (!all.length) {
    console.error("No backups found. Run: npm run backup");
    process.exit(1);
  }
  const latest = all[0];
  console.log(`Checking ${latest.name}…`);
  const v = verifyBackup(latest.path);
  if (!v.ok) {
    console.error(`FAILED: ${v.note}`);
    process.exit(1);
  }
  console.log(`OK: ${v.note}`);
  console.log(`Path: ${latest.path}`);
  if (!process.env.BACKUP_DIR) {
    console.warn("WARNING: BACKUP_DIR is unset — snapshots are on the same disk as the live DB.");
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
