# Operations — Hathorn Dashboard

## Database runtime

**Active:** SQLite (`data/ledger.db` or `DATA_DIR`).  
**Postgres:** tooling only — see `docs/POSTGRES-MIGRATION.md`.

## Backups (SQLite)

```bash
npm run backup          # online snapshot + prune
npm run restore-check   # verify latest snapshot
```

- Snapshots use SQLite backup API (not file copy).  
- Verify opens + integrity-checks before trust.  
- Restore closes the connection before swap (`closeDb()`).  
- Treat `data/backups/` as highly sensitive multi-tenant data.

**Postgres backup (when cut over):** managed automated backups + PITR; restore test required before production claim. Not proven here.

## Disaster recovery

| Asset | Recovery |
|---|---|
| Database | Restore verified snapshot; or Postgres PITR after cutover |
| Document files | `data/documents/` (or `DOCUMENTS_DIR`) — back up with DB |
| Encryption keys | `AUTH_SECRET` / token encryption material — out of band |
| Release snapshots | Inside DB `release_records.snapshot` — never regenerate |

## Firm offboarding

Prefer `firms.status = ARCHIVED` / client stage paused. Do **not** expose `DELETE FROM firms CASCADE` in UI.

## Platform provisioning

`POST /api/platform/firms` (platform admin only) creates firm + firm admin membership.
