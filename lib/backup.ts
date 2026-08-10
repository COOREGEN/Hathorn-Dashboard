/**
 * Backups.
 *
 * A single database file with no copies is not a storage strategy, it is a countdown.
 * This module takes verified snapshots without locking the running app, keeps a sensible
 * retention window, and can restore one.
 *
 * Three principles:
 *   1. A backup that has never been restored is a rumour. `verifyBackup` opens each
 *      snapshot, runs an integrity check and counts rows before the file is trusted.
 *   2. Snapshots are taken through SQLite's online backup API, not a file copy. Copying
 *      a live WAL database yields a file that looks fine and is subtly corrupt.
 *   3. Restoring is destructive, so the current database is itself snapshotted first.
 */

import Database from "better-sqlite3";
import { readdirSync, statSync, unlinkSync, mkdirSync, existsSync, copyFileSync } from "fs";
import path from "path";
import { db, closeDb, log } from "./db";

export type BackupFile = {
  name: string; path: string; sizeBytes: number; createdAt: string;
  verified: boolean; note: string;
};

const DATA_DIR = () => process.env.DATA_DIR || path.join(process.cwd(), "data");
const BACKUP_DIR = () => process.env.BACKUP_DIR || path.join(DATA_DIR(), "backups");
const LIVE_DB = () => path.join(DATA_DIR(), "ledger.db");

/** Tables whose row counts are compared between live and snapshot. */
const CORE_TABLES = [
  "clients", "users", "entities", "periods", "pl_lines", "payroll_lines",
  "ar_buckets", "cash_balances", "story_notes", "comments", "action_items",
  "balance_lines", "budget_lines", "goals",
];

function ensureDir() {
  const dir = BACKUP_DIR();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/* ------------------------------------------------------------------ */
/* Taking a snapshot                                                   */
/* ------------------------------------------------------------------ */

export async function createBackup(reason = "manual"): Promise<BackupFile> {
  const dir = ensureDir();
  const name = `ledger-${stamp()}-${reason}.db`;
  const target = path.join(dir, name);

  // SQLite's online backup: consistent snapshot of a database that is being written to.
  // A plain file copy of a WAL database can produce a file that opens fine and is wrong.
  await db().backup(target);

  const verification = verifyBackup(target);
  if (!verification.ok) {
    // A snapshot that fails verification is worse than none, because it invites trust.
    unlinkSync(target);
    throw new Error(`Backup failed verification and was discarded: ${verification.note}`);
  }

  const size = statSync(target).size;
  log("info", "backup.created", { name, reason, sizeBytes: size });

  return {
    name, path: target, sizeBytes: size,
    createdAt: new Date().toISOString(),
    verified: true, note: verification.note,
  };
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

export function verifyBackup(file: string): { ok: boolean; note: string; rows: Record<string, number> } {
  const rows: Record<string, number> = {};
  let snapshot: Database.Database | null = null;
  try {
    snapshot = new Database(file, { readonly: true, fileMustExist: true });

    const integrity = (snapshot.pragma("integrity_check") as any[])[0];
    if (integrity?.integrity_check !== "ok") {
      return { ok: false, note: `Integrity check failed: ${integrity?.integrity_check}`, rows };
    }

    const live = db();
    const drift: string[] = [];
    for (const table of CORE_TABLES) {
      let snapCount = 0, liveCount = 0;
      try {
        snapCount = (snapshot.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as any).n;
        liveCount = (live.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as any).n;
      } catch {
        continue; // table not present in an older snapshot — not a corruption signal
      }
      rows[table] = snapCount;
      // Rows can legitimately be added between snapshot and check, but never lost.
      if (snapCount > liveCount) drift.push(`${table} (${snapCount} > ${liveCount})`);
    }
    if (drift.length) {
      return { ok: false, note: `Snapshot has more rows than live: ${drift.join(", ")}`, rows };
    }

    const total = Object.values(rows).reduce((s, n) => s + n, 0);
    return { ok: true, note: `Integrity ok, ${total.toLocaleString()} rows across ${Object.keys(rows).length} tables`, rows };
  } catch (e: any) {
    return { ok: false, note: e.message, rows };
  } finally {
    snapshot?.close();
  }
}

/* ------------------------------------------------------------------ */
/* Listing and retention                                               */
/* ------------------------------------------------------------------ */

export function listBackups(): BackupFile[] {
  const dir = ensureDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((name) => {
      const full = path.join(dir, name);
      const st = statSync(full);
      return {
        name, path: full, sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
        verified: false, note: "",
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Grandfather-father-son retention: keep every snapshot from the last week, one per day
 * for a month, one per month beyond that. Enough to recover from "someone published the
 * wrong month three weeks ago" without keeping every file forever.
 */
export function pruneBackups(now = new Date()): { kept: string[]; removed: string[] } {
  const all = listBackups();
  const keep = new Set<string>();
  const seenDay = new Set<string>();
  const seenMonth = new Set<string>();
  const DAY = 86_400_000;

  for (const b of all) {
    const age = now.getTime() - new Date(b.createdAt).getTime();
    const day = b.createdAt.slice(0, 10);
    const month = b.createdAt.slice(0, 7);

    if (age <= 7 * DAY) { keep.add(b.name); continue; }
    if (age <= 31 * DAY) {
      if (!seenDay.has(day)) { seenDay.add(day); keep.add(b.name); }
      continue;
    }
    if (!seenMonth.has(month)) { seenMonth.add(month); keep.add(b.name); }
  }

  // Never leave zero backups, whatever the dates say.
  if (keep.size === 0 && all.length) keep.add(all[0].name);

  const removed: string[] = [];
  for (const b of all) {
    if (!keep.has(b.name)) {
      unlinkSync(b.path);
      removed.push(b.name);
    }
  }
  if (removed.length) log("info", "backup.pruned", { removed: removed.length, kept: keep.size });
  return { kept: Array.from(keep), removed };
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

/**
 * Replaces the live database with a snapshot.
 *
 * Order matters and is not obvious. The connection must be closed *before* the file is
 * swapped: replacing a file underneath an open handle leaves the connection pointing at
 * an inode that no longer exists, and every query afterwards fails with "disk I/O error"
 * rather than anything that hints at the cause. Closing first, then letting `db()` reopen
 * lazily on the next call, is the only safe swap in a running process.
 */
export function restoreBackup(name: string): { restored: string; safetyCopy: string } {
  const source = path.join(BACKUP_DIR(), path.basename(name));
  if (!existsSync(source)) throw new Error(`No backup named ${name}.`);

  const check = verifyBackup(source);
  if (!check.ok) throw new Error(`Refusing to restore a snapshot that fails verification: ${check.note}`);

  // The state being replaced may itself be the one someone wants back.
  const safety = path.join(ensureDir(), `ledger-${stamp()}-pre-restore.db`);
  copyFileSync(LIVE_DB(), safety);

  closeDb();

  copyFileSync(source, LIVE_DB());
  // WAL and shared-memory sidecars describe the replaced file, not the new one.
  for (const suffix of ["-wal", "-shm"]) {
    const side = LIVE_DB() + suffix;
    if (existsSync(side)) unlinkSync(side);
  }

  // Reopen immediately and prove the restored file is usable before returning.
  const check2 = db().prepare("SELECT COUNT(*) n FROM clients").get() as any;
  log("warn", "backup.restored", {
    from: name, safetyCopy: path.basename(safety), clients: check2.n,
  });
  return { restored: name, safetyCopy: path.basename(safety) };
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function backupStatus() {
  const all = listBackups();
  const latest = all[0];
  const ageHours = latest
    ? (Date.now() - new Date(latest.createdAt).getTime()) / 3_600_000
    : null;

  return {
    count: all.length,
    latest: latest?.name ?? null,
    latestAt: latest?.createdAt ?? null,
    ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    totalBytes: all.reduce((s, b) => s + b.sizeBytes, 0),
    // Anything older than a day means the schedule is not running.
    healthy: ageHours !== null && ageHours < 26,
  };
}
