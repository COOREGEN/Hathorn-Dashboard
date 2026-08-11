# Restore drill evidence

## SQLite file-swap drill (2026-08-10)

| Field | Value |
|---|---|
| Date | 2026-08-10 |
| Environment | Local STAGING (cloud agent VM) |
| Engine | SQLITE |
| Source backup | `ledger-2026-08-10T23-54-53-restore-drill.db` |
| Backup creation | SQLite online backup API + integrity_check |
| Restoration destination | live `DATA_DIR/ledger.db` (file swap after `closeDb()`) |
| Restore duration | 15 ms |
| Application usable after restore | YES — `SELECT COUNT(*) FROM clients` succeeded |
| Firms verified | Example CPA Firm, Hathorn Advisory Group |
| Users verified | 6 |
| Clients verified | 5 |
| Financial data verified | Revenue total $K 2186.1 unchanged |
| Released snapshots verified | checksum intact |
| Tenant ownership verified | Northbridge→Hathorn; Harbor Dental→Example CPA |
| Verdict | **DATED DRILL VERIFIED** |

## Postgres dump → restore drill (2026-08-11)

| Field | Value |
|---|---|
| Date | 2026-08-11 |
| Environment | Local STAGING (cloud agent VM) |
| Engine | POSTGRESQL |
| Source backup | `ledger-2026-08-11T00-39-24-restore-drill.pg.dump` |
| Backup creation | `pg_dump --format=custom` + `pg_restore --list` (94 table-data entries) |
| Restoration destination | `hathorn_restore_drill` (separate database; live book untouched) |
| Restore duration | 351 ms |
| Application startup after restore | Destination DB opened; row counts compared to source |
| Firms / users / clients | 2 / 6 / 5 (exact match) |
| Releases | 32 (exact match) |
| Financial data verified | Revenue total $K 2356.1 matches source |
| Released snapshots | checksums marked INTACT by drill script |
| Verdict | **DATED DRILL VERIFIED** |

## Notes

- Live SQLite book was **not destroyed**; Postgres staging cutover keeps SQLite as rollback until production cutover is separately authorized.
- `npm run restore-check` remains the automated verify; this log is the dated DR drill.
- Command: `npm run restore:drill` (`scripts/restore-drill.ts`).
