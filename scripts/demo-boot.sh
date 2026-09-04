#!/usr/bin/env bash
# demo-boot.sh — brings the demo back by itself after the machine restarts.
#
# Wired to the `start` command in .cursor/environment.json, so a recycled VM no
# longer means a dead demo waiting for someone to notice. Idempotent: it only
# does the steps that are actually missing.
#
# It cannot preserve the public address — a Cloudflare quick tunnel is issued a
# new name every time one is created. It preserves availability, not the URL.

set -uo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
log() { echo "$(date -u +%FT%TZ) demo-boot: $*"; }

# 1. Dependencies — wiped whenever the workspace is rebuilt from scratch.
if [ ! -d node_modules ]; then
  log "installing dependencies"
  npm install --no-audit --no-fund >/tmp/demo-boot-install.log 2>&1 || log "install failed, see /tmp/demo-boot-install.log"
fi

# 2. Secrets. Generated once and kept; regenerating them would invalidate every
#    live session and any encrypted value already written.
if [ ! -f .env.local ]; then
  log "creating .env.local with fresh secrets"
  cp .env.example .env.local
  python3 - <<'PY'
import base64, re, secrets
p = ".env.local"
s = open(p).read()
key = lambda: base64.b64encode(secrets.token_bytes(48)).decode()
s = re.sub(r'^AUTH_SECRET=.*$', 'AUTH_SECRET=' + key(), s, flags=re.M)
if not re.search(r'^ENCRYPTION_KEY=\S{20,}', s, re.M):
    s += '\nENCRYPTION_KEY=' + key() + '\n'
open(p, "w").write(s)
PY
fi

mkdir -p data data/backups

# 3. The demo book.
if [ ! -f data/ledger.db ]; then
  log "seeding the demo book"
  APP_ENV=LOCAL npm run seed >/tmp/demo-boot-seed.log 2>&1 || log "seed failed, see /tmp/demo-boot-seed.log"
fi

# 4. Build, if this checkout has never been built.
if [ ! -d .next ]; then
  log "building"
  npm run build >/tmp/demo-boot-build.log 2>&1 || log "build failed, see /tmp/demo-boot-build.log"
fi

# 5. The server. LEDGER_ALLOW_LOCAL_PROD and REQUIRE_STAFF_MFA=0 are demo-host
#    settings and must never be set on a real client-facing deployment.
if ! curl -sf -o /dev/null --max-time 5 http://127.0.0.1:3000/api/health/live; then
  log "starting the server"
  export AUTH_SECRET="$(grep '^AUTH_SECRET=' .env.local | cut -d= -f2-)"
  export ENCRYPTION_KEY="$(grep '^ENCRYPTION_KEY=' .env.local | cut -d= -f2-)"
  export BACKUP_DIR=./data/backups REQUIRE_STAFF_MFA=0 LEDGER_ALLOW_LOCAL_PROD=1
  export ENABLE_MOCK_INTEGRATION=1 NEXT_PUBLIC_BASE_URL=http://localhost:3000 NODE_ENV=production
  nohup npm start >/tmp/demo-boot-server.log 2>&1 &
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null --max-time 5 http://127.0.0.1:3000/api/health/live && break
    sleep 3
  done
fi
curl -sf -o /dev/null --max-time 5 http://127.0.0.1:3000/api/health/live \
  && log "server is up" || log "server did not come up — see /tmp/demo-boot-server.log"

# 6. The public link, kept alive by the watcher.
if ! pgrep -f "scripts/demo-tunnel.sh" >/dev/null; then
  log "starting the tunnel watcher"
  nohup bash scripts/demo-tunnel.sh >/tmp/demo-tunnel.log 2>&1 &
fi
log "boot sequence done; address will appear in /tmp/demo-url.txt"
