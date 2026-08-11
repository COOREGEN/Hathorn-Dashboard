# Restore drill evidence

| Field | Value |
|---|---|
| Date | 2026-08-10 |
| Environment | Local STAGING (cloud agent VM) |

## SQLite file-swap drill

| Field | Value |
|---|---|
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
| Released snapshots verified | checksum `129584b1…` intact |
| Document metadata verified | 0 docs in fresh seed (table present) |
| Close / reconciliation | tables present (0 rows in fresh seed) |
| Tenant ownership verified | Northbridge→Hathorn; Harbor Dental→Example CPA |
| Verdict | **DATED DRILL VERIFIED** |

## Postgres dump → restore drill

| Field | Value |
|---|---|
| Engine | POSTGRESQL |
| Source backup | `ledger-2026-08-10T23-55-14-restore-drill.pg.dump` |
| Backup creation | `pg_dump --format=custom` + `pg_restore --list` |
| Restoration destination | `hathorn_restore_drill` (separate database) |
| Restore duration | 366 ms |
| Firms / users / clients | 2 / 6 / 5 |
| Releases | 18 |
| Revenue total ($K) | 2186.1 (matches source) |
| Verdict | **DATED DRILL VERIFIED** |

## Notes

- Live SQLite book was **not destroyed**; Postgres cutover keeps SQLite as rollback.
- `npm run restore-check` remains the automated hourly verify; this log is the dated DR drill.
