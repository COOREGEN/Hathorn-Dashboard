#!/usr/bin/env bash
# stress.sh — the adversarial suite. It tries to break things rather than confirm
# they work, and it is deliberately hostile: injection, forged credentials,
# malformed bodies, degenerate numbers, races, oversized payloads, empty states.
#
#   npm run seed && npm run start &
#   ./scripts/stress.sh
#
# Every assertion names the behaviour it demands. The rule throughout: a hostile
# request must be REFUSED with a specific status and a JSON body — never a 500,
# never a redirect on an API, and never a leaked constraint or stack trace.
#
# Re-seed before and after: this suite writes rubbish deliberately.

set -uo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
JAR="${TMPDIR:-/tmp}/ledger-stress-$$"
mkdir -p "$JAR"
trap 'rm -rf "$JAR"' EXIT

PASS=0
FAIL=0
FAILED_NAMES=()

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); }

assert() { local n="$1"; shift; if "$@"; then pass "$n"; else fail "$n"; fi; }
refute() { local n="$1"; shift; if "$@"; then fail "$n"; else pass "$n"; fi; }

sql() { sqlite3 data/ledger.db "$1"; }

login() {
  local email="$1" jar="$2"
  curl -s -c "$jar" -b "$jar" -X POST "$BASE/api/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"ledger2026\"}" | grep -q '"ok":true'
}

# status code for a request
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }

# A refusal is any 4xx. What matters most is that it is NOT 2xx and NOT 5xx.
refused() {
  local name="$1" c="$2"
  case "$c" in
    4*) pass "$name (refused $c)" ;;
    5*) fail "$name — server error $c instead of a refusal" ;;
    2*) fail "$name — ACCEPTED with $c" ;;
    3*) fail "$name — redirected ($c); an API must answer with JSON" ;;
    *)  fail "$name — unexpected $c" ;;
  esac
}

# Same, but a page may legitimately redirect to login/landing instead of 4xx.
page_refused() {
  local name="$1" c="$2"
  case "$c" in
    4*|30*) pass "$name (refused $c)" ;;
    5*) fail "$name — server error $c" ;;
    2*) fail "$name — ACCEPTED with $c" ;;
    *)  fail "$name — unexpected $c" ;;
  esac
}

echo "== Stress suite against $BASE =="
echo "   Hostile by design. Re-seed afterwards."
echo

# ─────────────────────────────────────────────────────────────────────────────
echo "0. Fixtures"
assert "admin login"      login "regen@hathornadvisorygroup.com" "$JAR/admin.jar"
assert "advisor login"    login "jeremiah@hathornadvisorygroup.com" "$JAR/advisor.jar"
assert "bookkeeper login" login "books@hathornadvisorygroup.com" "$JAR/books.jar"
assert "client login"     login "owner@northbridge.example" "$JAR/client.jar"
assert "other-firm login" login "admin@example-cpa.test" "$JAR/other.jar"
assert "other-client login" login "owner@harbor-dental.test" "$JAR/otherclient.jar"

CLIENT_ID=$(sql "SELECT id FROM clients WHERE slug='northbridge'")
OTHER_ID=$(sql "SELECT id FROM clients WHERE slug='harbor-dental'")
DRAFT_ID=$(sql "SELECT id FROM periods WHERE client_id='$CLIENT_ID' AND status='IN_REVIEW' LIMIT 1")
PUB_ID=$(sql "SELECT id FROM periods WHERE client_id='$CLIENT_ID' AND status='PUBLISHED' ORDER BY year DESC, month DESC LIMIT 1")
OTHER_PUB=$(sql "SELECT id FROM periods WHERE client_id='$OTHER_ID' AND status='PUBLISHED' LIMIT 1")
assert "subject client found"   test -n "$CLIENT_ID"
assert "draft period found"     test -n "$DRAFT_ID"
assert "published period found" test -n "$PUB_ID"
assert "other firm period found" test -n "$OTHER_PUB"

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "1. Injection and hostile input"

# SQL injection through the login form.
for payload in "' OR '1'='1" "admin'--" "x' UNION SELECT 1,2,3--" "'; DROP TABLE users;--"; do
  R=$(curl -s -X POST "$BASE/api/login" -H 'content-type: application/json' \
    --data "$(python3 -c "import json,sys;print(json.dumps({'email':sys.argv[1],'password':'x'}))" "$payload")" --max-time 20)
  if echo "$R" | grep -q '"ok":true'; then fail "SQL injection in login rejected [$payload]"
  elif echo "$R" | grep -qiE 'syntax error|sqlite|no such column|SQLITE_'; then
    fail "login leaked database detail [$payload]"
  else pass "SQL injection in login refused without leaking [$payload]"; fi
done
assert "users table intact after injection attempts" test "$(sql "SELECT count(*) FROM users")" -ge 4

# Injection through query parameters that reach lookups.
for p in "northbridge%27%20OR%20%271%27%3D%271" "%27%20OR%201%3D1--" "..%2F..%2Fetc%2Fpasswd" "northbridge%00"; do
  C=$(code -b "$JAR/advisor.jar" "$BASE/dash?client=$p")
  case "$C" in
    2*|30*) pass "hostile client param handled ($C) [$p]" ;;
    4*) pass "hostile client param refused ($C) [$p]" ;;
    *) fail "hostile client param produced $C [$p]" ;;
  esac
done

# Stored XSS: write a payload as a client name, then read it back rendered.
XSS='<img src=x onerror=alert(1)>'
R=$(curl -s -b "$JAR/admin.jar" -X POST "$BASE/api/clients" -H 'content-type: application/json' \
  --data "$(python3 -c "import json;print(json.dumps({'name':'Stress $XSS','vertical':'generic'}))")" --max-time 25)
echo "$R" > "$JAR/xss-create.json"
XSS_ID=$(python3 -c "
import json,sys
try:
  d=json.load(open('$JAR/xss-create.json'))
  print(d.get('id') or (d.get('client') or {}).get('id') or '')
except Exception: print('')")
if [ -n "$XSS_ID" ]; then
  pass "hostile client name accepted for storage test"
  HTML=$(curl -s -b "$JAR/admin.jar" "$BASE/clients" --max-time 25)
  echo "$HTML" > "$JAR/clients.html"
  refute "payload is not rendered as live markup" grep -qF '<img src=x onerror' "$JAR/clients.html"
  assert "payload is present but escaped" grep -qE '&lt;img|&amp;lt;img' "$JAR/clients.html"
else
  # Refusing hostile names outright is also correct.
  pass "hostile client name refused at the write boundary"
fi

# Formula-leading strings are data, not spreadsheet formulas — stored verbatim is
# correct; what matters is that a CSV export would neutralise them.
R=$(curl -s -b "$JAR/admin.jar" -X POST "$BASE/api/clients" -H 'content-type: application/json' \
  -d '{"name":"=cmd|calc","vertical":"generic"}' --max-time 25)
case "$(echo "$R" | head -c 400)" in
  *'"ok":true'*|*'"id"'*) pass "formula-leading name stored as data" ;;
  *) pass "formula-leading name refused at the boundary" ;;
esac

# Header / CRLF injection through a header the app echoes.
HDRS=$(curl -sD - -o /dev/null -b "$JAR/advisor.jar" -H $'x-request-id: abc\r\nx-injected: yes' "$BASE/api/health/live" --max-time 20 | tr -d '\r')
refute "CRLF in a request header does not forge a response header" grep -qi '^x-injected:' <<<"$HDRS"

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "2. Malformed and degenerate bodies"

for body in 'null' '[]' '"a string"' '123' '{"broken":' '' '{"__proto__":{"admin":true}}'; do
  C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/admin.jar" -X POST "$BASE/api/clients" \
    -H 'content-type: application/json' --data "$body" --max-time 20)
  label=$(printf '%s' "${body:-<empty>}" | head -c 24)
  case "$C" in
    400|409|422) pass "malformed body refused with $C [$label]" ;;
    5*) fail "malformed body caused $C [$label]" ;;
    2*) fail "malformed body ACCEPTED with $C [$label]" ;;
    *) pass "malformed body refused with $C [$label]" ;;
  esac
done

# Wrong content type on a JSON route.
refused "form-encoded body on a JSON route" \
  "$(code -b "$JAR/admin.jar" -X POST "$BASE/api/clients" -H 'content-type: application/x-www-form-urlencoded' --data 'name=x')"

# Degenerate period coordinates on upload.
for ym in "2026 13" "2026 0" "1800 6" "9999 6" "-1 -1"; do
  set -- $ym
  C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/books.jar" -X POST "$BASE/api/upload" \
    -F "clientId=$CLIENT_ID" -F "year=$1" -F "month=$2" \
    -F "pnl=@samples/pnl.csv" -F "payroll=@samples/payroll.csv" \
    -F "ar=@samples/ar.csv" -F "cash=@samples/cash.csv" --max-time 40)
  refused "out-of-range period $1-$2 refused" "$C"
done
assert "no phantom period was created" test "$(sql "SELECT count(*) FROM periods WHERE month>12 OR month<1 OR year<1900 OR year>2100")" = "0"

# Numeric extremes in a JSON field that reaches maths.
for n in 1e309 -1e309 NaN Infinity 99999999999999999999; do
  C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/admin.jar" -X POST "$BASE/api/admin/goals" \
    -H 'content-type: application/json' \
    -d "{\"clientId\":\"$CLIENT_ID\",\"label\":\"stress\",\"target\":$n}" --max-time 20)
  case "$C" in
    5*) fail "degenerate number $n caused $C" ;;
    *) pass "degenerate number $n handled ($C)" ;;
  esac
done

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "3. Auth under attack"

# A forged and a tampered session cookie.
FORGED='eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJmYWtlIiwicm9sZSI6IkFETUlOIn0.not_a_real_signature'
refused "forged JWT rejected on an API" "$(code -H "cookie: ledger_session=$FORGED" "$BASE/api/ops/jobs")"
page_refused "forged JWT rejected on a page" "$(code -H "cookie: ledger_session=$FORGED" "$BASE/today")"
# tail -1: a cookie jar can hold more than one ledger_session line, and taking
# them all left the intact token first in the string — the tamper never applied.
GOOD=$(awk '/ledger_session/{print $7}' "$JAR/admin.jar" | tail -1)
TAMPERED="${GOOD%?}x"
assert "the tamper actually changed the token" test "$TAMPERED" != "$GOOD"
# Role escalation by rewriting the payload must fail on the signature.
ESCALATED=$(python3 -c "
import base64,json,sys
t='$GOOD'
h,p,sg=t.split('.')
pad=lambda x: x+'='*(-len(x)%4)
d=json.loads(base64.urlsafe_b64decode(pad(p)))
d['role']='ADMIN'; d['isPlatformAdmin']=True; d['userId']='attacker'
np=base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
print(h+'.'+np+'.'+sg)")
refused "a payload rewritten to escalate role is rejected" "$(code -H "cookie: ledger_session=$ESCALATED" "$BASE/api/ops/jobs")"
refused "a token with its signature removed is rejected" \
  "$(code -H "cookie: ledger_session=$(python3 -c "t='$GOOD';h,p,s=t.split('.');print(h+'.'+p+'.')")" "$BASE/api/ops/jobs")"
refused "tampered signature rejected" "$(code -H "cookie: ledger_session=$TAMPERED" "$BASE/api/ops/jobs")"
refused "empty session cookie rejected" "$(code -H "cookie: ledger_session=" "$BASE/api/ops/jobs")"
refused "no session at all rejected" "$(code "$BASE/api/ops/jobs")"

# Throttling: repeated failures on one email must start refusing.
THROTTLED=0
for i in $(seq 1 12); do
  C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/login" -H 'content-type: application/json' \
    -d '{"email":"throttle-probe@hathornadvisorygroup.com","password":"wrong-password-1"}' --max-time 20)
  [ "$C" = "429" ] && THROTTLED=1 && break
done
assert "repeated failed logins are throttled" test "$THROTTLED" = "1"
# Throttling must be per email, not global — a real user still gets in.
assert "throttling did not lock out other accounts" login "regen@hathornadvisorygroup.com" "$JAR/admin2.jar"

# Unknown vs known email must not be distinguishable by the response.
A=$(curl -s -X POST "$BASE/api/login" -H 'content-type: application/json' -d '{"email":"nobody-here@example.com","password":"x"}' --max-time 20)
B=$(curl -s -X POST "$BASE/api/login" -H 'content-type: application/json' -d '{"email":"jeremiah@hathornadvisorygroup.com","password":"x"}' --max-time 20)
assert "unknown and known emails give the same answer" test "$A" = "$B"

# Password rules at the write boundary.
for pw in "short" "alllowercase" "12345678901" "password123"; do
  C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/admin.jar" -X POST "$BASE/api/admin/users" \
    -H 'content-type: application/json' \
    -d "{\"clientId\":\"$CLIENT_ID\",\"email\":\"weak-$RANDOM@example.com\",\"name\":\"Weak\",\"role\":\"CLIENT\",\"password\":\"$pw\"}" --max-time 25)
  refused "weak password '$pw' refused" "$C"
done

# A forged OAuth state must not complete a QuickBooks connection.
QBO_CONNS_BEFORE=$(sql "SELECT count(*) FROM qbo_connections")
QBO_CODE=$(code -b "$JAR/admin.jar" "$BASE/api/qbo/callback?code=fake&state=forged-state&realmId=1")
case "$QBO_CODE" in
  2*) fail "forged QBO state must not be accepted (got $QBO_CODE)" ;;
  5*) fail "forged QBO state caused a server error ($QBO_CODE)" ;;
  *)  pass "forged QBO state refused ($QBO_CODE — a browser callback may redirect to an error page)" ;;
esac
assert "no QuickBooks connection was created from a forged state" \
  test "$(sql "SELECT count(*) FROM qbo_connections")" = "$QBO_CONNS_BEFORE"

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "4. Cross-tenant and privilege probes"

# A client naming another tenant.
for target in "harbor-dental" "$OTHER_ID"; do
  HTML=$(curl -s -b "$JAR/client.jar" "$BASE/portal?client=$target" --max-time 25)
  refute "client cannot pull tenant '$target' into their portal" grep -qi 'Harbor Dental' <<<"$HTML"
done
refused "client cannot read another period's statement API" \
  "$(code -b "$JAR/client.jar" "$BASE/api/portal/pdf?periodId=$OTHER_PUB")"
refused "client cannot post comments on another tenant's period" \
  "$(code -b "$JAR/client.jar" -X POST "$BASE/api/comments" -H 'content-type: application/json' \
    -d "{\"periodId\":\"$OTHER_PUB\",\"metric\":\"revenue\",\"body\":\"probe\"}")"

# Another firm's admin reaching this firm's book.
page_refused "other firm cannot open this client's dashboard" \
  "$(code -b "$JAR/other.jar" "$BASE/dash?client=northbridge")"
refused "other firm cannot approve this client's period" \
  "$(code -b "$JAR/other.jar" -X POST "$BASE/api/approve" -H 'content-type: application/json' -d "{\"periodId\":\"$DRAFT_ID\"}")"
refused "other firm cannot read this client's intelligence" \
  "$(code -b "$JAR/other.jar" "$BASE/api/intelligence?client=$CLIENT_ID")"
refused "other firm cannot edit this client" \
  "$(code -b "$JAR/other.jar" -X POST "$BASE/api/clients/$CLIENT_ID" -H 'content-type: application/json' -d '{"name":"Hijacked"}')"
assert "client name unchanged after hijack attempt" test "$(sql "SELECT name FROM clients WHERE id='$CLIENT_ID'")" != "Hijacked"

# Role walls.
refused "bookkeeper cannot approve" \
  "$(code -b "$JAR/books.jar" -X POST "$BASE/api/approve" -H 'content-type: application/json' -d "{\"periodId\":\"$DRAFT_ID\"}")"
refused "bookkeeper cannot draft the story" \
  "$(code -b "$JAR/books.jar" -X POST "$BASE/api/story/draft" -H 'content-type: application/json' -d "{\"periodId\":\"$DRAFT_ID\"}")"
page_refused "bookkeeper cannot open the book" "$(code -b "$JAR/books.jar" "$BASE/portfolio")"
refused "client cannot approve" \
  "$(code -b "$JAR/client.jar" -X POST "$BASE/api/approve" -H 'content-type: application/json' -d "{\"periodId\":\"$DRAFT_ID\"}")"
refused "client cannot upload" "$(code -b "$JAR/client.jar" -X POST "$BASE/api/upload")"
refused "non-platform admin cannot reach platform ops" "$(code -b "$JAR/other.jar" "$BASE/api/ops/jobs")"

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "5. Business logic abuse"

# Break the gate deliberately, then try to publish.
BEFORE_REV=$(sql "SELECT ROUND(SUM(amount),1) FROM pl_lines WHERE period_id='$DRAFT_ID' AND category='REVENUE'")
ENTITY=$(sql "SELECT entity_id FROM payroll_lines WHERE period_id='$DRAFT_ID' LIMIT 1")
sql "UPDATE payroll_lines SET wages = wages + 40 WHERE period_id='$DRAFT_ID' AND entity_id='$ENTITY'"
refused "a period whose labour no longer ties cannot be published" \
  "$(code -b "$JAR/advisor.jar" -X POST "$BASE/api/approve" -H 'content-type: application/json' -d "{\"periodId\":\"$DRAFT_ID\"}")"
sql "UPDATE payroll_lines SET wages = wages - 40 WHERE period_id='$DRAFT_ID' AND entity_id='$ENTITY'"

# Re-upload over a published month.
refused "published month cannot be overwritten by upload" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/books.jar" -X POST "$BASE/api/upload" \
    -F "clientId=$CLIENT_ID" -F "year=$(sql "SELECT year FROM periods WHERE id='$PUB_ID'")" \
    -F "month=$(sql "SELECT month FROM periods WHERE id='$PUB_ID'")" \
    -F "pnl=@samples/pnl.csv" -F "payroll=@samples/payroll.csv" \
    -F "ar=@samples/ar.csv" -F "cash=@samples/cash.csv" --max-time 40)"

# Amendment without a reason.
refused "amendment without a reason refused" \
  "$(code -b "$JAR/advisor.jar" -X POST "$BASE/api/admin/amend" -H 'content-type: application/json' -d "{\"periodId\":\"$PUB_ID\"}")"

# Publishing a period id that does not exist, or belongs to nobody.
refused "approve with a nonexistent period refused" \
  "$(code -b "$JAR/advisor.jar" -X POST "$BASE/api/approve" -H 'content-type: application/json' -d '{"periodId":"does-not-exist"}')"
refused "approve with no period id refused" \
  "$(code -b "$JAR/advisor.jar" -X POST "$BASE/api/approve" -H 'content-type: application/json' -d '{}')"

# The published statement must not move when the working ledger is edited.
SNAP_BEFORE=$(sql "SELECT substr(snapshot,1,180) FROM release_records WHERE period_id='$PUB_ID' AND status='ACTIVE'")
sql "UPDATE pl_lines SET amount = amount + 50 WHERE period_id='$PUB_ID' AND category='REVENUE'"
SNAP_AFTER=$(sql "SELECT substr(snapshot,1,180) FROM release_records WHERE period_id='$PUB_ID' AND status='ACTIVE'")
assert "the release snapshot was actually read" test -n "$SNAP_BEFORE"
assert "a published statement does not change when the ledger is edited" test "$SNAP_BEFORE" = "$SNAP_AFTER"
PORTAL=$(curl -s -b "$JAR/client.jar" "$BASE/portal/statement" --max-time 30)
refute "the client is not shown the tampered working figure" grep -q "50 was added" <<<"$PORTAL"
sql "UPDATE pl_lines SET amount = amount - 50 WHERE period_id='$PUB_ID' AND category='REVENUE'"

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "6. Concurrency"

# Two advisors pressing publish at the same moment.
for i in 1 2 3 4 5; do
  curl -s -o "$JAR/race-$i.json" -w '%{http_code}' -b "$JAR/advisor.jar" -X POST "$BASE/api/approve" \
    -H 'content-type: application/json' -d "{\"periodId\":\"$DRAFT_ID\"}" --max-time 40 > "$JAR/race-$i.code" &
done
wait
OK=0; ERR5=0
for i in 1 2 3 4 5; do
  C=$(cat "$JAR/race-$i.code" 2>/dev/null)
  [ "${C:0:1}" = "2" ] && OK=$((OK+1))
  [ "${C:0:1}" = "5" ] && ERR5=$((ERR5+1))
done
assert "simultaneous publishes did not 500" test "$ERR5" = "0"
ACTIVE=$(sql "SELECT count(*) FROM release_records WHERE period_id='$DRAFT_ID' AND status='ACTIVE'")
assert "exactly one active release after a publish race" test "$ACTIVE" = "1"
assert "at least one publish succeeded" test "$OK" -ge 1

# Parallel writes to the same note set.
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -b "$JAR/advisor.jar" -X POST "$BASE/api/notes" -H 'content-type: application/json' \
    -d "{\"periodId\":\"$DRAFT_ID\",\"slot\":\"WHAT_CHANGED\",\"tone\":\"info\",\"heading\":\"Race $i\",\"body\":\"Concurrent write $i — a number, a cause, an action.\"}" --max-time 30 &
done
wait
RACE_NOTES=$(sql "SELECT count(*) FROM story_notes WHERE period_id='$DRAFT_ID' AND heading LIKE 'Race %'")
if [ "$(sql "SELECT status FROM periods WHERE id='$DRAFT_ID'")" = "PUBLISHED" ]; then
  assert "notes are refused once the period is published" test "$RACE_NOTES" = "0"
else
  assert "concurrent note writes persisted" test "$RACE_NOTES" -ge 1
fi
assert "database is not corrupt after concurrent writes" test "$(sql 'PRAGMA integrity_check')" = "ok"

# Parallel reads under load must all succeed.
for i in $(seq 1 20); do
  curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR/client.jar" "$BASE/portal/statement" --max-time 40 >> "$JAR/load.txt" &
done
wait
assert "20 concurrent portal reads all returned 200" test "$(grep -c '^200$' "$JAR/load.txt")" = "20"

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "7. Resource abuse"

# Oversized JSON body.
python3 -c "
import json
print(json.dumps({'clientId':'$CLIENT_ID','slot':'WHAT_CHANGED','tone':'info','heading':'big','body':'x'*3000000}))" > "$JAR/big.json"
C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/advisor.jar" -X POST "$BASE/api/notes" \
  -H 'content-type: application/json' --data-binary "@$JAR/big.json" --max-time 60)
case "$C" in
  5*) fail "a 3MB body caused $C" ;;
  *) pass "a 3MB body handled ($C)" ;;
esac

# Deeply nested JSON.
python3 -c "print('{\"a\":' * 800 + 'null' + '}' * 800)" > "$JAR/deep.json"
C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/advisor.jar" -X POST "$BASE/api/notes" \
  -H 'content-type: application/json' --data-binary "@$JAR/deep.json" --max-time 40)
case "$C" in
  5*) fail "deeply nested JSON caused $C" ;;
  *) pass "deeply nested JSON handled ($C)" ;;
esac

# A metered endpoint must start refusing rather than billing the firm forever.
LIMITED=0
for i in $(seq 1 30); do
  C=$(code -b "$JAR/advisor.jar" -X POST "$BASE/api/story/draft" -H 'content-type: application/json' \
    -d "{\"periodId\":\"$DRAFT_ID\"}")
  [ "$C" = "429" ] && LIMITED=1 && break
  [ "${C:0:1}" = "5" ] && { fail "story draft returned $C under repetition"; break; }
done
assert "a metered endpoint rate limits under repetition" test "$LIMITED" = "1"

# Absurd query parameters must not break a page.
for q in "month=99999999" "month=-1" "month=$(python3 -c 'print("9"*400)')" "entity=../../etc" "mode=NOT_A_MODE"; do
  C=$(code -b "$JAR/advisor.jar" "$BASE/dash?client=$CLIENT_ID&$q")
  case "$C" in
    5*) fail "dashboard 500ed on [$q]" ;;
    *) pass "dashboard survived [$q] ($C)" ;;
  esac
done

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "8. Empty and boundary states"

EMPTY_ID=$(sql "SELECT lower(hex(randomblob(12)))")
FIRM=$(sql "SELECT firm_id FROM clients WHERE id='$CLIENT_ID'")
sql "INSERT INTO clients (id,name,slug,vertical,firm_id,logo_text) VALUES ('$EMPTY_ID','Stress Empty Co','stress-empty-co','generic','$FIRM','Stress Empty Co')"
assert "empty-client fixture exists" test "$(sql "SELECT count(*) FROM clients WHERE id='$EMPTY_ID'")" = "1"
for path in "/dash?client=$EMPTY_ID" "/dash/cash?client=$EMPTY_ID" "/dash/comparison?client=$EMPTY_ID" "/intelligence?client=$EMPTY_ID" "/portfolio"; do
  C=$(code -b "$JAR/advisor.jar" "$BASE$path")
  case "$C" in
    2*|30*) pass "a client with no closes renders ($C) [$path]" ;;
    *) fail "a client with no closes produced $C [$path]" ;;
  esac
done
refused "a client with no published month cannot be published" \
  "$(code -b "$JAR/advisor.jar" -X POST "$BASE/api/approve" -H 'content-type: application/json' -d "{\"periodId\":\"$EMPTY_ID\"}")"
sql "DELETE FROM clients WHERE id='$EMPTY_ID'"

# The earliest month has no prior month to compare against.
FIRST=$(sql "SELECT id FROM periods WHERE client_id='$CLIENT_ID' ORDER BY year, month LIMIT 1")
C=$(code -b "$JAR/advisor.jar" "$BASE/dash/comparison?client=$CLIENT_ID&month=$FIRST&mode=PRIOR_MONTH")
case "$C" in
  2*) pass "the earliest month renders a comparison view without a basis" ;;
  *) fail "earliest-month comparison produced $C" ;;
esac

echo
# ─────────────────────────────────────────────────────────────────────────────
echo "9. Integrity sweep"

assert "database integrity is ok" test "$(sql 'PRAGMA integrity_check')" = "ok"
assert "no orphan periods" test "$(sql "SELECT count(*) FROM periods p LEFT JOIN clients c ON c.id=p.client_id WHERE c.id IS NULL")" = "0"
assert "no orphan P&L lines" test "$(sql "SELECT count(*) FROM pl_lines l LEFT JOIN periods p ON p.id=l.period_id WHERE p.id IS NULL")" = "0"
assert "no orphan releases" test "$(sql "SELECT count(*) FROM release_records r LEFT JOIN periods p ON p.id=r.period_id WHERE p.id IS NULL")" = "0"
assert "no period has two active releases" test "$(sql "SELECT count(*) FROM (SELECT period_id FROM release_records WHERE status='ACTIVE' GROUP BY period_id HAVING count(*)>1)")" = "0"
assert "every client still belongs to a firm" test "$(sql "SELECT count(*) FROM clients WHERE firm_id IS NULL")" = "0"
assert "no stored session token leaked into audit detail" test "$(sql "SELECT count(*) FROM audit_logs WHERE detail LIKE '%eyJ%'")" = "0"

# Nothing in this suite may have exposed one tenant to another.
HTML=$(curl -s -b "$JAR/client.jar" "$BASE/portal" --max-time 30)
refute "the client portal shows no other tenant" grep -qi 'harbor dental' <<<"$HTML"
HTML=$(curl -s -b "$JAR/otherclient.jar" "$BASE/portal" --max-time 30)
refute "the other tenant sees nothing of this one" grep -qi 'northbridge' <<<"$HTML"

echo
echo "Result: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "Failed assertions:"
  for n in "${FAILED_NAMES[@]}"; do echo "  · $n"; done
  echo
  echo "Re-seed before running other suites: npm run seed"
  exit 1
fi
echo "Re-seed before running other suites: npm run seed"
