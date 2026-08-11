#!/usr/bin/env bash
# rc-smoke.sh — minimal critical-path smoke against a live server.
#   npm run seed && npm run start &
#   ./scripts/rc-smoke.sh
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:3000}"
COOKIE_DIR="${TMPDIR:-/tmp}/hathorn-rc-smoke-$$"
mkdir -p "$COOKIE_DIR"
PASS=0
FAIL=0

assert() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "RC smoke against $BASE"
assert "liveness" curl -sf "$BASE/api/health/live"
assert "favicon" curl -sf "$BASE/favicon.svg"
assert "login page" bash -c "curl -sf \"$BASE/login\" | grep -qi 'Dashboard'"

# Staff login
curl -sf -c "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/login" \
  -H 'content-type: application/json' \
  -d '{"email":"regen@hathornadvisorygroup.com","password":"ledger2026"}' \
  > "$COOKIE_DIR/login.json" || true
assert "staff login" bash -c "grep -Eq '\"ok\":true|\"mfa' \"$COOKIE_DIR/login.json\""
# If MFA setup required, still count as auth path alive
if grep -Eq 'mfaSetupRequired|mfaRequired' "$COOKIE_DIR/login.json" 2>/dev/null; then
  echo "  · note: MFA challenge/setup returned (expected when REQUIRE_STAFF_MFA=1)"
fi

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" "$BASE/today")
assert "staff reaches /today" bash -c "test \"$CODE\" = \"200\" -o \"$CODE\" = \"307\""

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" "$BASE/api/ops/jobs")
assert "platform ops jobs" bash -c "test \"$CODE\" = \"200\""

# Client login
curl -sf -c "$COOKIE_DIR/client.jar" -X POST "$BASE/api/login" \
  -H 'content-type: application/json' \
  -d '{"email":"owner@northbridge.example","password":"ledger2026"}' \
  > "$COOKIE_DIR/client-login.json" || true
assert "client login" bash -c "grep -q '\"ok\":true' \"$COOKIE_DIR/client-login.json\""

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/portal")
assert "client portal" bash -c "test \"$CODE\" = \"200\""

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/close")
assert "client blocked from /close" bash -c "test \"$CODE\" = \"307\" -o \"$CODE\" = \"403\""

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/api/ops/jobs")
assert "client blocked from ops" bash -c "test \"$CODE\" = \"403\" -o \"$CODE\" = \"401\""

# Firm B isolation smoke
curl -sf -c "$COOKIE_DIR/ex.jar" -X POST "$BASE/api/login" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example-cpa.test","password":"ledger2026"}' \
  > "$COOKIE_DIR/ex-login.json" || true
CLIENT_ID=$(python3 - <<'PY'
import os, subprocess
flag = (os.environ.get("POSTGRES_RUNTIME_ENABLED") or "").lower()
pg = flag in ("1", "true", "yes")
url = os.environ.get("DATABASE_MIGRATOR_URL") or os.environ.get("DATABASE_URL")
if pg and url:
    out = subprocess.check_output(
        ["psql", url, "-At", "-c",
         "SELECT id FROM clients WHERE name ILIKE 'Northbridge%' LIMIT 1"],
        text=True,
    ).strip()
    print(out)
else:
    import sqlite3
    c = sqlite3.connect(os.path.join(os.environ.get("DATA_DIR", "data"), "ledger.db"))
    row = c.execute("SELECT id FROM clients WHERE name LIKE 'Northbridge%'").fetchone()
    print(row[0] if row else "")
PY
)
if [ -n "$CLIENT_ID" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/ex.jar" \
    "$BASE/api/intelligence?clientId=$CLIENT_ID")
  assert "Firm B blocked from Firm A intelligence" bash -c "test \"$CODE\" = \"403\" -o \"$CODE\" = \"400\""
fi

rm -rf "$COOKIE_DIR"
echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
