#!/usr/bin/env bash
# probe-tenancy.sh — walks every staff API that accepts a client or period id and
# calls it as a DIFFERENT firm's admin, using this firm's ids.
#
# A staff route must resolve the id to its owning firm and refuse. Role alone is
# never sufficient: every admin carries the ADMIN role, so a check that stops at
# "is this an admin?" lets one firm reach another's book by guessing an id.
#
#   npm run seed && npm run start & ./scripts/probe-tenancy.sh

set -uo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
JAR="${TMPDIR:-/tmp}/probe-$$"; mkdir -p "$JAR"; trap 'rm -rf "$JAR"' EXIT

login() {
  curl -s -c "$2" -X POST "$BASE/api/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"ledger2026\"}" | grep -q '"ok":true'
}
login "admin@example-cpa.test" "$JAR/other.jar" || { echo "other-firm login failed"; exit 2; }
login "regen@hathornadvisorygroup.com" "$JAR/own.jar"  || { echo "own login failed"; exit 2; }

CLIENT=$(sqlite3 data/ledger.db "SELECT id FROM clients WHERE slug='northbridge'")
PERIOD=$(sqlite3 data/ledger.db "SELECT id FROM periods WHERE client_id='$CLIENT' AND status='IN_REVIEW' LIMIT 1")
PUB=$(sqlite3 data/ledger.db "SELECT id FROM periods WHERE client_id='$CLIENT' AND status='PUBLISHED' LIMIT 1")
ENTITY=$(sqlite3 data/ledger.db "SELECT id FROM entities WHERE client_id='$CLIENT' LIMIT 1")
NOTES_BEFORE=$(sqlite3 data/ledger.db "SELECT count(*) FROM story_notes WHERE period_id='$PERIOD'")

LEAKS=0
# A 200 is not automatically a leak: a well-scoped read returns the caller's OWN
# data and is correct. What matters is whether the other firm's data or a write to
# it got through, so reads are judged on content and writes on effect.
probe() {
  local label="$1" method="$2" path="$3" body="${4:-}"
  local code
  if [ "$method" = "GET" ]; then
    code=$(curl -s -o "$JAR/body" -w '%{http_code}' -b "$JAR/other.jar" --max-time 30 "$BASE$path")
  else
    code=$(curl -s -o "$JAR/body" -w '%{http_code}' -b "$JAR/other.jar" -X "$method" \
      -H 'content-type: application/json' --data "$body" --max-time 30 "$BASE$path")
  fi
  case "$code" in
    2*)
      if grep -qiE 'northbridge|in-home health|riverbend|consumer directed' "$JAR/body"; then
        echo "  LEAK  $code  $label — response carries the other firm's data"; LEAKS=$((LEAKS+1))
      elif [ "$method" != "GET" ]; then
        echo "  note  $code  $label — accepted; effect verified below"
      else
        echo "  ok    $code  $label (scoped to own firm)"
      fi
      ;;
    4*) echo "  ok    $code  $label";;
    3*) echo "  ok    $code  $label (redirect)";;
    *)  echo "  ERR   $code  $label";;
  esac
}

echo "== Cross-tenant probe: Example CPA admin against Hathorn's book =="
echo

probe "approve (publish) another firm's period" POST /api/approve "{\"periodId\":\"$PERIOD\"}"
probe "amend another firm's published period"   POST /api/approve "{\"action\":\"amend\",\"periodId\":\"$PUB\",\"reason\":\"probe\"}"
probe "unpublish another firm's period"         POST /api/admin/unpublish "{\"periodId\":\"$PUB\",\"reason\":\"probe\"}"
probe "write a story note on another firm's period" POST /api/notes "{\"periodId\":\"$PERIOD\",\"slot\":\"WHAT_CHANGED\",\"tone\":\"info\",\"heading\":\"probe\",\"body\":\"probe body long enough to count as commentary\"}"
probe "draft the story for another firm's period"   POST /api/story/draft "{\"periodId\":\"$PERIOD\"}"
probe "add a goal to another firm's client"      POST /api/admin/goals "{\"clientId\":\"$CLIENT\",\"label\":\"probe\",\"target\":1}"
probe "add an entity to another firm's client"   POST /api/admin/entities "{\"clientId\":\"$CLIENT\",\"name\":\"Probe Co\"}"
probe "add a user to another firm's client"      POST /api/admin/users "{\"clientId\":\"$CLIENT\",\"email\":\"probe-$RANDOM@example.com\",\"name\":\"Probe\",\"role\":\"CLIENT\",\"password\":\"Probe12345\"}"
probe "create a client while naming another firm's id" POST "/api/admin/clients" "{\"id\":\"$CLIENT\",\"name\":\"Probed\"}"
probe "create an action on another firm's client" POST /api/actions "{\"clientId\":\"$CLIENT\",\"title\":\"probe\"}"
probe "record engagement on another firm's client" POST /api/engagement "{\"clientId\":\"$CLIENT\",\"kind\":\"discovery\",\"note\":\"probe\"}"
probe "ask the copilot about another firm's client" POST /api/copilot "{\"clientId\":\"$CLIENT\",\"question\":\"What is revenue?\"}"
probe "read another firm's audit trail"          GET  "/api/admin/audit?client=$CLIENT"
probe "read another firm's intelligence"         GET  "/api/intelligence?client=$CLIENT"
probe "read another firm's close data"           GET  "/api/close?client=$CLIENT&year=2026&month=5"
probe "read another firm's planning"             GET  "/api/planning?client=$CLIENT"
probe "read another firm's documents"            GET  "/api/documents?client=$CLIENT"
probe "read another firm's client-portal config" GET  "/api/client-portal?clientId=$CLIENT"
probe "export another firm's statement as PDF"   GET  "/api/portal/pdf?periodId=$PUB"

echo
echo "-- effect on the other firm's book --"
EFFECT=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then echo "  ok    $name"; else echo "  LEAK  $name (got '$got', wanted '$want')"; EFFECT=$((EFFECT+1)); fi
}
check "client name unchanged" "$(sqlite3 data/ledger.db "SELECT name FROM clients WHERE id='$CLIENT'")" "Northbridge Home Care"
check "no probe entity created" "$(sqlite3 data/ledger.db "SELECT count(*) FROM entities WHERE client_id='$CLIENT' AND name LIKE 'Probe%'")" "0"
check "no probe user created" "$(sqlite3 data/ledger.db "SELECT count(*) FROM users WHERE client_id='$CLIENT' AND email LIKE 'probe-%'")" "0"
check "draft period still unpublished" "$(sqlite3 data/ledger.db "SELECT status FROM periods WHERE id='$PERIOD'")" "IN_REVIEW"
check "published period still published" "$(sqlite3 data/ledger.db "SELECT status FROM periods WHERE id='$PUB'")" "PUBLISHED"
check "no probe note written" "$(sqlite3 data/ledger.db "SELECT count(*) FROM story_notes WHERE period_id='$PERIOD' AND heading='probe'")" "0"
check "no probe goal written" "$(sqlite3 data/ledger.db "SELECT count(*) FROM client_goals WHERE client_id='$CLIENT' AND title='probe'")" "0"
NOTES_NOW=$(sqlite3 data/ledger.db "SELECT count(*) FROM story_notes WHERE period_id='$PERIOD'")
check "story notes untouched by the other firm" "$NOTES_NOW" "$NOTES_BEFORE"
check "any client created landed in the caller's own firm" "$(sqlite3 data/ledger.db "SELECT count(*) FROM clients WHERE slug LIKE 'probed%' AND firm_id=(SELECT firm_id FROM clients WHERE slug='northbridge')")" "0"
sqlite3 data/ledger.db "DELETE FROM clients WHERE slug LIKE 'probed%'" 

echo
TOTAL=$((LEAKS + EFFECT))
echo "Leaks: $TOTAL  (response/write: $LEAKS, persisted effect: $EFFECT)"
[ "$TOTAL" -gt 0 ] && exit 1
exit 0
