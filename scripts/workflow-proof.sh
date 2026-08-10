#!/usr/bin/env bash
# workflow-proof.sh — proves the release engine path end-to-end against a live server.
#
#   npm run seed && npm run start &
#   ./scripts/workflow-proof.sh
#
# Exit non-zero on the first failed assertion batch. Re-seed between suites.

set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COOKIE_DIR="${TMPDIR:-/tmp}/ledger-workflow-$$"
mkdir -p "$COOKIE_DIR"
trap 'rm -rf "$COOKIE_DIR"' EXIT

PASS=0
FAIL=0

assert() {
  local name="$1"
  shift
  if "$@"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

json_get() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get(sys.argv[1],''))" "$1" 2>/dev/null || true
}

login() {
  local email="$1" jar="$2"
  local body
  body=$(curl -s -c "$jar" -b "$jar" -X POST "$BASE/api/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"ledger2026\"}")
  echo "$body" | grep -q '"ok":true'
}

echo "== Workflow proof against $BASE =="
echo

echo "0. Host readiness"
HEALTH=$(curl -s "$BASE/api/health" || true)
echo "$HEALTH" > "$COOKIE_DIR/health.json"
assert "health endpoint responds" test -n "$HEALTH"
assert "schema is current" grep -q '"applied"' "$COOKIE_DIR/health.json"

echo
echo "1. Auth and role walls"
assert "client login" login "owner@northbridge.example" "$COOKIE_DIR/client.jar"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/portal")
assert "client reaches portal" test "$CODE" = "200"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/today")
assert "client blocked from /today" test "$CODE" = "307" -o "$CODE" = "403"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" -X POST "$BASE/api/upload")
assert "client blocked from upload API" test "$CODE" = "403"

# Staff MFA is required in production by default. For proof against `npm start`,
# run the server with REQUIRE_STAFF_MFA=0 (or enroll MFA before proof).
ADMIN_BODY=$(curl -s -c "$COOKIE_DIR/admin.jar" -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/login" \
  -H 'content-type: application/json' \
  -d '{"email":"regen@hathornadvisorygroup.com","password":"ledger2026"}')
echo "$ADMIN_BODY" > "$COOKIE_DIR/admin-login.json"
if echo "$ADMIN_BODY" | grep -q 'mfaSetupRequired'; then
  echo "  ✗ admin login blocked by MFA setup — restart server with REQUIRE_STAFF_MFA=0 for proof"
  FAIL=$((FAIL + 1))
elif echo "$ADMIN_BODY" | grep -q 'mfaRequired'; then
  echo "  ✗ admin login requires TOTP — use REQUIRE_STAFF_MFA=0 on a seeded proof host"
  FAIL=$((FAIL + 1))
else
  assert "admin login" grep -q '"ok":true' "$COOKIE_DIR/admin-login.json"
fi
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" "$BASE/today")
assert "admin reaches /today" test "$CODE" = "200"

# Password recovery path (always 200; does not reveal whether email exists)
RESP=$(curl -s -X POST "$BASE/api/auth/forgot" -H 'content-type: application/json' \
  -d '{"email":"regen@hathornadvisorygroup.com"}')
echo "$RESP" > "$COOKIE_DIR/forgot.json"
assert "forgot-password acknowledges" grep -q '"ok":true' "$COOKIE_DIR/forgot.json"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/approve" -H 'content-type: application/json' -d '{}')
assert "unauthed approve is 401" test "$CODE" = "401"
assert "bookkeeper login" login "books@hathornadvisorygroup.com" "$COOKIE_DIR/books.jar"

echo
echo "2. Seeded workflow subject"
CLIENT_ID=$(sqlite3 data/ledger.db "SELECT id FROM clients WHERE slug='northbridge'")
MAY_ID=$(sqlite3 data/ledger.db "SELECT id FROM periods WHERE client_id='$CLIENT_ID' AND year=2026 AND month=5")
assert "northbridge client exists" test -n "$CLIENT_ID"
assert "May 2026 period exists" test -n "$MAY_ID"

echo
echo "3. Commentary gate"
# May may already be published from a prior run — open amendment or reset to IN_REVIEW via revoke
MAY_STATUS=$(sqlite3 data/ledger.db "SELECT status FROM periods WHERE id='$MAY_ID'")
if [ "$MAY_STATUS" = "PUBLISHED" ]; then
  ACTIVE_REL=$(sqlite3 data/ledger.db "SELECT id FROM release_records WHERE period_id='$MAY_ID' AND status='ACTIVE' LIMIT 1")
  if [ -n "$ACTIVE_REL" ]; then
    curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/admin/unpublish" \
      -H 'content-type: application/json' \
      -d "{\"periodId\":\"$MAY_ID\",\"reason\":\"Workflow proof reset\"}" >/dev/null
  fi
fi
sqlite3 data/ledger.db "DELETE FROM story_notes WHERE period_id='$MAY_ID'"
sqlite3 data/ledger.db "INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort)
  VALUES (lower(hex(randomblob(12))),'$MAY_ID','WHAT_CHANGED','info','Draft — advisor to complete','A number, a cause, an action.',0)"
# Clear locks left from revoke edge cases so approve can evaluate draft block
sqlite3 data/ledger.db "DELETE FROM period_locks WHERE period_id='$MAY_ID'"
sqlite3 data/ledger.db "UPDATE periods SET status='IN_REVIEW', published_at=NULL WHERE id='$MAY_ID'"
sqlite3 data/ledger.db "UPDATE release_records SET status='REVOKED' WHERE period_id='$MAY_ID' AND status='ACTIVE'"

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/approve" \
  -H 'content-type: application/json' -d "{\"periodId\":\"$MAY_ID\"}")
echo "$RESP" > "$COOKIE_DIR/approve-draft.json"
assert "publish blocked on draft commentary" grep -qiE 'commentary|cannot be published|Draft|not enough' "$COOKIE_DIR/approve-draft.json"

echo
echo "4. Story → publish"
NOTE_ID=$(sqlite3 data/ledger.db "SELECT id FROM story_notes WHERE period_id='$MAY_ID' LIMIT 1")
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/notes" \
  -H 'content-type: application/json' \
  -d "{\"id\":\"$NOTE_ID\",\"tone\":\"warn\",\"heading\":\"CDS claims lag — timing\",\"body\":\"May attendant hours were worked but claims were submitted in June. Expect recovery next month; recruiting remains the operational action for the call.\"}")
echo "$RESP" > "$COOKIE_DIR/note.json"
assert "advisor can save commentary" grep -q '"ok":true' "$COOKIE_DIR/note.json"

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/approve" \
  -H 'content-type: application/json' -d "{\"periodId\":\"$MAY_ID\"}")
echo "$RESP" > "$COOKIE_DIR/approve.json"
assert "publish succeeds with real commentary" grep -q '"ok":true' "$COOKIE_DIR/approve.json"
VERSION=$(json_get version < "$COOKIE_DIR/approve.json")
assert "publish returns version" test -n "$VERSION"
STATUS=$(sqlite3 data/ledger.db "SELECT status FROM periods WHERE id='$MAY_ID'")
assert "period status is PUBLISHED" test "$STATUS" = "PUBLISHED"
RELEASES=$(sqlite3 data/ledger.db "SELECT COUNT(*) FROM release_records WHERE period_id='$MAY_ID' AND status='ACTIVE'")
assert "active release record exists" test "$RELEASES" = "1"
LOCKS=$(sqlite3 data/ledger.db "SELECT COUNT(*) FROM period_locks WHERE period_id='$MAY_ID'")
assert "period lock exists" test "$LOCKS" = "1"

echo
echo "5. Client portal"
HTML=$(curl -s -b "$COOKIE_DIR/client.jar" "$BASE/portal")
echo "$HTML" > "$COOKIE_DIR/portal.html"
assert "portal shows Northbridge" grep -qiE 'Northbridge|NORTHBRIDGE' "$COOKIE_DIR/portal.html"
assert "portal shows statement chrome" grep -qiE 'May|Monthly Statement|Prepared by Hathorn' "$COOKIE_DIR/portal.html"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" \
  "$BASE/portal?client=northbridge&month=$MAY_ID")
assert "staff preview with client+month" test "$CODE" = "200"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" \
  "$BASE/api/portal/pdf?periodId=$MAY_ID")
assert "client can download release PDF" test "$CODE" = "200"
curl -s -D "$COOKIE_DIR/pdf.hdr" -o /dev/null -b "$COOKIE_DIR/client.jar" \
  "$BASE/api/portal/pdf?periodId=$MAY_ID"
assert "PDF content-type" grep -qi 'application/pdf' "$COOKIE_DIR/pdf.hdr"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/portal/pdf?periodId=$MAY_ID")
assert "unauthed PDF is 401" test "$CODE" = "401"

echo
echo "6. Comments"
RESP=$(curl -s -b "$COOKIE_DIR/client.jar" -X POST "$BASE/api/comments" \
  -H 'content-type: application/json' \
  -d "{\"periodId\":\"$MAY_ID\",\"metricSlot\":\"REVENUE\",\"body\":\"Can we walk the CDS lag on the call?\"}")
echo "$RESP" > "$COOKIE_DIR/comment.json"
assert "client can comment on published month" grep -q '"id"' "$COOKIE_DIR/comment.json"

OTHER=$(sqlite3 data/ledger.db "SELECT id FROM periods WHERE client_id!=(SELECT id FROM clients WHERE slug='northbridge') AND status='PUBLISHED' LIMIT 1")
if [ -n "$OTHER" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" -X POST "$BASE/api/comments" \
    -H 'content-type: application/json' \
    -d "{\"periodId\":\"$OTHER\",\"metricSlot\":\"REVENUE\",\"body\":\"cross tenant\"}")
  assert "cross-tenant comment blocked" test "$CODE" = "403"
fi

echo
echo "7. Amendment"
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/approve" \
  -H 'content-type: application/json' \
  -d "{\"periodId\":\"$MAY_ID\",\"action\":\"amend\",\"reason\":\"Correct CDS recovery language for the call.\"}")
echo "$RESP" > "$COOKIE_DIR/amend.json"
assert "amendment opens" grep -q '"ok":true' "$COOKIE_DIR/amend.json"
STATUS=$(sqlite3 data/ledger.db "SELECT status FROM periods WHERE id='$MAY_ID'")
assert "amending period is IN_REVIEW" test "$STATUS" = "IN_REVIEW"
ACTIVE=$(sqlite3 data/ledger.db "SELECT COUNT(*) FROM release_records WHERE period_id='$MAY_ID' AND status='ACTIVE'")
assert "prior release still ACTIVE during amendment" test "$ACTIVE" = "1"

RESP=$(curl -s -b "$COOKIE_DIR/client.jar" -X POST "$BASE/api/comments" \
  -H 'content-type: application/json' \
  -d "{\"periodId\":\"$MAY_ID\",\"metricSlot\":\"CASH\",\"body\":\"Still seeing the May statement — thanks.\"}")
echo "$RESP" > "$COOKIE_DIR/comment2.json"
assert "client can comment while amendment open" grep -q '"id"' "$COOKIE_DIR/comment2.json"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/portal")
assert "client still sees portal during amendment" test "$CODE" = "200"

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/approve" \
  -H 'content-type: application/json' -d "{\"periodId\":\"$MAY_ID\"}")
echo "$RESP" > "$COOKIE_DIR/approve-v2.json"
assert "republish after amendment" grep -q '"ok":true' "$COOKIE_DIR/approve-v2.json"
V2=$(json_get version < "$COOKIE_DIR/approve-v2.json")
assert "version incremented" test "${V2:-0}" -ge 2
SUPERSEDED=$(sqlite3 data/ledger.db "SELECT COUNT(*) FROM release_records WHERE period_id='$MAY_ID' AND status='SUPERSEDED'")
assert "prior version superseded" test "$SUPERSEDED" -ge 1

echo
echo "8. Lock enforcement"
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/notes" \
  -H 'content-type: application/json' \
  -d "{\"id\":\"$NOTE_ID\",\"tone\":\"info\",\"heading\":\"x\",\"body\":\"should fail because locked and no amendment open\"}")
echo "$RESP" > "$COOKIE_DIR/locked-note.json"
assert "notes blocked when locked" grep -qiE 'locked|amendment|"ok":false' "$COOKIE_DIR/locked-note.json"

echo
echo "9. Upload → gate (June samples)"
JUNE=$(sqlite3 data/ledger.db "SELECT id FROM periods WHERE client_id='$CLIENT_ID' AND year=2026 AND month=6")
JUNE_STATUS=$(sqlite3 data/ledger.db "SELECT status FROM periods WHERE id='$JUNE'" 2>/dev/null || true)
if [ -z "$JUNE" ] || [ "$JUNE_STATUS" != "PUBLISHED" ]; then
  RESP=$(curl -s -b "$COOKIE_DIR/books.jar" -X POST "$BASE/api/upload" \
    -F "clientId=$CLIENT_ID" -F "year=2026" -F "month=6" \
    -F "pnl=@samples/pnl.csv" -F "payroll=@samples/payroll.csv" \
    -F "ar=@samples/ar.csv" -F "cash=@samples/cash.csv" \
    -F "balance=@samples/balance.csv")
  echo "$RESP" > "$COOKIE_DIR/upload.json"
  assert "upload returns gate result" grep -q '"pass"' "$COOKIE_DIR/upload.json"
  JUNE=$(sqlite3 data/ledger.db "SELECT id FROM periods WHERE client_id='$CLIENT_ID' AND year=2026 AND month=6")
  assert "June period created" test -n "$JUNE"
  if grep -q '"pass":true' "$COOKIE_DIR/upload.json"; then
    assert "June gate passes" grep -q '"pass":true' "$COOKIE_DIR/upload.json"
    JSTATUS=$(sqlite3 data/ledger.db "SELECT status FROM periods WHERE id='$JUNE'")
    assert "June promoted to IN_REVIEW" test "$JSTATUS" = "IN_REVIEW"
  else
    echo "  · June gate failed — see $COOKIE_DIR/upload.json"
    cat "$COOKIE_DIR/upload.json" | head -c 500; echo
    assert "June gate passes" false
  fi
else
  echo "  · June already published — skip upload"
fi

echo
echo "10. Planning / FP&A (staff only; native engine)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/planning")
assert "client blocked from /planning" test "$CODE" = "307" -o "$CODE" = "403"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" \
  -X POST "$BASE/api/planning" -H 'content-type: application/json' \
  -d "{\"clientId\":\"$CLIENT_ID\",\"scenario\":\"BASE\"}")
assert "client blocked from planning API" test "$CODE" = "403" -o "$CODE" = "401"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" \
  "$BASE/planning?client=$CLIENT_ID")
assert "admin reaches /planning" test "$CODE" = "200"

# Fingerprint accounting tables before a forecast run
FP_BEFORE=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID');
")

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/planning" \
  -H 'content-type: application/json' \
  -d "{\"clientId\":\"$CLIENT_ID\",\"scenario\":\"BASE\",\"assumptions\":{\"annualRevenueGrowthPct\":8,\"grossMarginPct\":35,\"annualOpexGrowthPct\":3,\"horizonMonths\":12}}")
echo "$RESP" > "$COOKIE_DIR/fpa-run.json"
assert "staff can run forecast" grep -q '"ok":true' "$COOKIE_DIR/fpa-run.json"
assert "forecast uses native engine" grep -q '"engine":"native"' "$COOKIE_DIR/fpa-run.json"
assert "forecast has 12 months" python3 -c "import json,sys; d=json.load(open('$COOKIE_DIR/fpa-run.json')); assert len(d['run']['results']['forecast'])==12"

FP_AFTER=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID');
")
assert "forecast does not mutate actuals/releases" test "$FP_BEFORE" = "$FP_AFTER"

RUNS=$(sqlite3 data/ledger.db "SELECT COUNT(*) FROM fpa_model_runs WHERE client_id='$CLIENT_ID'")
assert "model run persisted" test "${RUNS:-0}" -ge 1

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/planning" \
  -H 'content-type: application/json' \
  -d "{\"clientId\":\"$CLIENT_ID\",\"scenario\":\"BASE\",\"assumptions\":{\"annualRevenueGrowthPct\":999,\"grossMarginPct\":35,\"annualOpexGrowthPct\":3}}")
echo "$RESP" > "$COOKIE_DIR/fpa-bad.json"
assert "rejects invalid growth %" grep -qiE 'outside|error|"ok":false' "$COOKIE_DIR/fpa-bad.json"

RUN_ID=$(python3 -c "import json; print(json.load(open('$COOKIE_DIR/fpa-run.json'))['run']['id'])")
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/planning/analyze" \
  -H 'content-type: application/json' -d "{\"runId\":\"$RUN_ID\"}")
echo "$RESP" > "$COOKIE_DIR/fpa-analyze.json"
assert "staff can generate analysis" grep -q '"ok":true' "$COOKIE_DIR/fpa-analyze.json"
assert "analysis draft present" grep -qiE 'WHAT CHANGED|KEY DRIVER|assumption' "$COOKIE_DIR/fpa-analyze.json"

echo
echo "11. Document Intelligence (staff only; drafts never post)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/documents")
assert "client blocked from /documents" test "$CODE" = "307" -o "$CODE" = "403"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" \
  -X POST "$BASE/api/documents" -F "clientId=$CLIENT_ID" -F "file=@samples/documents/payroll-register.csv")
assert "client blocked from documents API" test "$CODE" = "403" -o "$CODE" = "401"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" \
  "$BASE/documents?client=$CLIENT_ID")
assert "admin reaches /documents" test "$CODE" = "200"

# Fingerprint before document upload/parse
DOC_FP_BEFORE=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM payroll_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID');
")

APR_PERIOD=$(sqlite3 data/ledger.db "SELECT id FROM periods WHERE client_id='$CLIENT_ID' AND year=2026 AND month=4 LIMIT 1")
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/documents" \
  -F "clientId=$CLIENT_ID" \
  -F "documentType=PAYROLL_REGISTER" \
  -F "periodId=$APR_PERIOD" \
  -F "file=@samples/documents/payroll-register.csv")
echo "$RESP" > "$COOKIE_DIR/doc-upload.json"
assert "staff can upload payroll register" grep -q '"ok":true' "$COOKIE_DIR/doc-upload.json"
DOC_ID=$(python3 -c "import json; print(json.load(open('$COOKIE_DIR/doc-upload.json'))['document']['id'])")
assert "document id returned" test -n "$DOC_ID"
assert "extraction produced draft" python3 -c "import json; d=json.load(open('$COOKIE_DIR/doc-upload.json')); assert d.get('extraction') and d['extraction']['status']=='OK'"

DOC_FP_AFTER=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM payroll_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID');
")
assert "document parse does not mutate actuals/releases" test "$DOC_FP_BEFORE" = "$DOC_FP_AFTER"

# Reject executable (magic + extension)
printf 'MZ\x90\x00evil' > "$COOKIE_DIR/evil.exe"
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/documents" \
  -F "clientId=$CLIENT_ID" \
  -F "file=@$COOKIE_DIR/evil.exe")
echo "$RESP" > "$COOKIE_DIR/doc-evil.json"
assert "rejects disallowed file type" grep -qiE 'not allowed|type|error|"ok":false' "$COOKIE_DIR/doc-evil.json"

# Reprocess creates second extraction
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/documents/$DOC_ID" \
  -H 'content-type: application/json' -d '{"action":"reprocess"}')
echo "$RESP" > "$COOKIE_DIR/doc-reprocess.json"
assert "reprocess ok" grep -q '"ok":true' "$COOKIE_DIR/doc-reprocess.json"
EXT_COUNT=$(sqlite3 data/ledger.db "SELECT COUNT(*) FROM document_extractions WHERE document_id='$DOC_ID'")
assert "reprocess appends extraction history" test "${EXT_COUNT:-0}" -ge 2

# Approve preserves raw
RAW_BEFORE=$(sqlite3 data/ledger.db "SELECT length(raw_result_json) FROM document_extractions WHERE document_id='$DOC_ID' ORDER BY created_at DESC LIMIT 1")
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/documents/$DOC_ID" \
  -H 'content-type: application/json' -d '{"action":"approve"}')
echo "$RESP" > "$COOKIE_DIR/doc-approve.json"
assert "approve extraction" grep -q '"ok":true' "$COOKIE_DIR/doc-approve.json"
STATUS=$(sqlite3 data/ledger.db "SELECT status FROM source_documents WHERE id='$DOC_ID'")
assert "document status APPROVED" test "$STATUS" = "APPROVED"
RAW_AFTER=$(sqlite3 data/ledger.db "SELECT length(raw_result_json) FROM document_extractions WHERE document_id='$DOC_ID' ORDER BY created_at DESC LIMIT 1")
assert "approve preserves raw extraction" test "$RAW_BEFORE" = "$RAW_AFTER"

# Download does not leak path
RESP=$(curl -s -D "$COOKIE_DIR/doc-dl.hdr" -o "$COOKIE_DIR/doc-dl.bin" -b "$COOKIE_DIR/admin.jar" \
  "$BASE/api/documents/$DOC_ID?download=1")
CODE=$(awk 'NR==1{print $2}' "$COOKIE_DIR/doc-dl.hdr")
assert "staff can download original" test "$CODE" = "200"
if grep -qiE '^X-File-Path:|/workspace/data/documents' "$COOKIE_DIR/doc-dl.hdr"; then
  assert "download has no server path header" false
else
  assert "download has no server path header" true
fi

echo
echo "12. Tax Intelligence (staff only; no accounting mutation)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/tax")
assert "client blocked from /tax" test "$CODE" = "307" -o "$CODE" = "403"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" \
  -X POST "$BASE/api/tax" -H 'content-type: application/json' \
  -d "{\"clientId\":\"$CLIENT_ID\",\"title\":\"x\",\"taxYear\":2025}")
assert "client blocked from tax API" test "$CODE" = "403" -o "$CODE" = "401"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" \
  "$BASE/tax?client=$CLIENT_ID")
assert "admin reaches /tax" test "$CODE" = "200"

TAX_FP_BEFORE=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM fpa_model_runs WHERE client_id='$CLIENT_ID');
")

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax" \
  -H 'content-type: application/json' \
  -d "{\"clientId\":\"$CLIENT_ID\",\"title\":\"§179 equipment pilot\",\"description\":\"Phase 3 proof\",\"taxYear\":2025,\"entityType\":\"S_CORP\"}")
echo "$RESP" > "$COOKIE_DIR/tax-issue.json"
assert "staff can create tax issue" grep -q '"ok":true' "$COOKIE_DIR/tax-issue.json"
TAX_ID=$(python3 -c "import json; print(json.load(open('$COOKIE_DIR/tax-issue.json'))['issue']['id'])")

# Missing facts path
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax/$TAX_ID" \
  -H 'content-type: application/json' \
  -d '{"action":"run_rule","ruleKey":"sec179_expense_limit"}')
echo "$RESP" > "$COOKIE_DIR/tax-rule-missing.json"
assert "rule needs information without facts" grep -q 'NEEDS_INFORMATION' "$COOKIE_DIR/tax-rule-missing.json"

for pair in "equipment_cost:150000:currency" "placed_in_service:true:boolean" "business_use_pct:100:percent"; do
  KEY=$(echo "$pair" | cut -d: -f1)
  VAL=$(echo "$pair" | cut -d: -f2)
  TYP=$(echo "$pair" | cut -d: -f3)
  curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax/$TAX_ID" \
    -H 'content-type: application/json' \
    -d "{\"action\":\"add_fact\",\"factKey\":\"$KEY\",\"factValue\":\"$VAL\",\"factType\":\"$TYP\"}" >/dev/null
done

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax/$TAX_ID" \
  -H 'content-type: application/json' \
  -d '{"action":"run_rule","ruleKey":"sec179_expense_limit"}')
echo "$RESP" > "$COOKIE_DIR/tax-rule-ok.json"
assert "§179 rule eligible" grep -q '"status":"ELIGIBLE"' "$COOKIE_DIR/tax-rule-ok.json"
assert "§179 cites IRC" grep -q 'IRC' "$COOKIE_DIR/tax-rule-ok.json"

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax/$TAX_ID" \
  -H 'content-type: application/json' \
  -d '{"action":"create_scenario","name":"Lower use","facts":{"business_use_pct":"40"}}')
echo "$RESP" > "$COOKIE_DIR/tax-scenario.json"
assert "scenario created" grep -q '"ok":true' "$COOKIE_DIR/tax-scenario.json"
SCEN_ID=$(python3 -c "import json; print(json.load(open('$COOKIE_DIR/tax-scenario.json'))['scenario']['id'])")

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax/$TAX_ID" \
  -H 'content-type: application/json' \
  -d "{\"action\":\"run_scenario\",\"scenarioId\":\"$SCEN_ID\",\"ruleKey\":\"sec179_expense_limit\"}")
echo "$RESP" > "$COOKIE_DIR/tax-scenario-run.json"
assert "scenario not eligible at 40% use" grep -q 'NOT_ELIGIBLE' "$COOKIE_DIR/tax-scenario-run.json"

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax/$TAX_ID" \
  -H 'content-type: application/json' -d '{"action":"analyze"}')
echo "$RESP" > "$COOKIE_DIR/tax-analyze.json"
assert "analysis generated" grep -q '"ok":true' "$COOKIE_DIR/tax-analyze.json"
assert "analysis requires professional review" grep -q 'requiresProfessionalReview' "$COOKIE_DIR/tax-analyze.json"

TAX_FP_AFTER=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM fpa_model_runs WHERE client_id='$CLIENT_ID');
")
assert "tax workflow does not mutate actuals/releases/fpa" test "$TAX_FP_BEFORE" = "$TAX_FP_AFTER"

# Cross-client: create issue on another client id should 400/404 if forged — try wrong issue
OTHER=$(sqlite3 data/ledger.db "SELECT id FROM clients WHERE id!='$CLIENT_ID' LIMIT 1")
if [ -n "$OTHER" ]; then
  RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/tax" \
    -H 'content-type: application/json' \
    -d "{\"clientId\":\"$OTHER\",\"title\":\"Other client issue\",\"taxYear\":2025}")
  OTHER_ISSUE=$(python3 -c "import json; print(json.load(open('/dev/stdin'))['issue']['id'])" <<<"$RESP" 2>/dev/null || true)
  # Bookkeeper cannot access tax
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/books.jar" "$BASE/api/tax/$TAX_ID")
  assert "bookkeeper blocked from tax issue API" test "$CODE" = "403"
fi

echo "13. Accounting Guidance (staff only; source-backed; no book mutation)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" "$BASE/guidance")
assert "client blocked from /guidance" test "$CODE" = "307" -o "$CODE" = "403"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/client.jar" \
  -X POST "$BASE/api/research" -H 'content-type: application/json' \
  -d "{\"clientId\":\"$CLIENT_ID\",\"title\":\"x\",\"category\":\"LEASES\"}")
assert "client blocked from research API" test "$CODE" = "403" -o "$CODE" = "401"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/admin.jar" \
  "$BASE/guidance?client=$CLIENT_ID")
assert "admin reaches /guidance" test "$CODE" = "200"

ACCT_FP_BEFORE=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM fpa_model_runs WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM tax_issues WHERE client_id='$CLIENT_ID');
")

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/research" \
  -H 'content-type: application/json' \
  -d "{\"clientId\":\"$CLIENT_ID\",\"title\":\"Equipment lease classification\",\"description\":\"Phase 4 lease pilot\",\"category\":\"LEASES\",\"entityContext\":\"PRIVATE_COMPANY\",\"reportingPeriod\":\"2026-06\"}")
echo "$RESP" > "$COOKIE_DIR/research-issue.json"
assert "staff can create research issue" grep -q '"ok":true' "$COOKIE_DIR/research-issue.json"
RES_ID=$(python3 -c "import json; print(json.load(open('$COOKIE_DIR/research-issue.json'))['issue']['id'])")

# Partial facts → missing information path
for pair in "contract_term_months:36:number" "payment_structure:fixed:string" "renewal_option:true:boolean"; do
  KEY=$(echo "$pair" | cut -d: -f1)
  VAL=$(echo "$pair" | cut -d: -f2)
  TYP=$(echo "$pair" | cut -d: -f3)
  curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/research/$RES_ID" \
    -H 'content-type: application/json' \
    -d "{\"action\":\"add_fact\",\"factKey\":\"$KEY\",\"factValue\":\"$VAL\",\"factType\":\"$TYP\"}" >/dev/null
done

# Attach firm lease checklist from library
SRC=$(sqlite3 data/ledger.db "SELECT id FROM accounting_sources WHERE id='src-firm-lease-checklist'")
if [ -n "$SRC" ]; then
  curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/research/$RES_ID" \
    -H 'content-type: application/json' \
    -d "{\"action\":\"attach_source\",\"sourceId\":\"$SRC\"}" >/dev/null
fi

RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/research/$RES_ID" \
  -H 'content-type: application/json' -d '{"action":"run_research"}')
echo "$RESP" > "$COOKIE_DIR/research-run.json"
assert "research analysis generated" grep -q '"ok":true' "$COOKIE_DIR/research-run.json"
assert "research requires professional review" grep -q 'requiresProfessionalReview' "$COOKIE_DIR/research-run.json"
assert "research flags missing facts or needs info" grep -Eq 'NEEDS MORE INFORMATION|missingFacts|economic_life' "$COOKIE_DIR/research-run.json"
assert "research cites attached/firm source" grep -Eq 'src-firm-lease-checklist|Hathorn Firm Guidance|FIRM_POLICY' "$COOKIE_DIR/research-run.json"
# Must not invent ASC paragraph citations that were never supplied
assert "no fabricated ASC paragraph citation" ! grep -qE 'ASC 842-[0-9]+-[0-9]+-[0-9]+' "$COOKIE_DIR/research-run.json"

# UNKNOWN rights rejected
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/research/$RES_ID" \
  -H 'content-type: application/json' \
  -d '{"action":"add_source","title":"Mystery PDF","citation":"unknown","publisher":"x","sourceType":"OTHER_INTERPRETIVE","contentRights":"UNKNOWN","bodyText":"should not index"}')
echo "$RESP" > "$COOKIE_DIR/research-unknown.json"
assert "UNKNOWN rights rejected" grep -qiE 'UNKNOWN|error|rights' "$COOKIE_DIR/research-unknown.json"
assert "UNKNOWN rights not ok:true" ! grep -q '"ok":true' "$COOKIE_DIR/research-unknown.json"

# Contract fact source may be stored as USER_PROVIDED but is not GAAP authority
RESP=$(curl -s -b "$COOKIE_DIR/admin.jar" -X POST "$BASE/api/research/$RES_ID" \
  -H 'content-type: application/json' \
  -d '{"action":"add_source","title":"Lease contract","citation":"Client lease","publisher":"Client","sourceType":"CONTRACT","contentRights":"USER_PROVIDED","bodyText":"36 month equipment lease between parties."}')
echo "$RESP" > "$COOKIE_DIR/research-contract.json"
assert "contract source accepted as USER_PROVIDED" grep -q '"ok":true' "$COOKIE_DIR/research-contract.json"
assert "contract typed as CONTRACT" grep -q 'CONTRACT' "$COOKIE_DIR/research-contract.json"

ACCT_FP_AFTER=$(sqlite3 data/ledger.db "
  SELECT
    (SELECT COUNT(*) FROM periods WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id='$CLIENT_ID')) || '|' ||
    (SELECT COUNT(*) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COALESCE(SUM(length(snapshot)),0) FROM release_records WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM fpa_model_runs WHERE client_id='$CLIENT_ID') || '|' ||
    (SELECT COUNT(*) FROM tax_issues WHERE client_id='$CLIENT_ID');
")
assert "accounting guidance does not mutate actuals/releases/fpa/tax" test "$ACCT_FP_BEFORE" = "$ACCT_FP_AFTER"

# Bookkeeper cannot access guidance
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_DIR/books.jar" "$BASE/api/research/$RES_ID")
assert "bookkeeper blocked from research issue API" test "$CODE" = "403"

# Confirm no ASC Codification dump table / corpus
ASC_BODY=$(sqlite3 data/ledger.db "SELECT COUNT(*) FROM accounting_sources WHERE source_type='FASB_ASC' AND content_rights='PUBLIC' AND body_text IS NOT NULL AND length(body_text)>200")
assert "no PUBLIC FASB_ASC body corpus" test "$ASC_BODY" = "0"

echo
echo "Result: $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi

