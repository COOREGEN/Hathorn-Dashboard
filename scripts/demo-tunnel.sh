#!/usr/bin/env bash
# demo-tunnel.sh — keeps a public demo link alive in front of a local server.
#
#   nohup bash scripts/demo-tunnel.sh > /tmp/demo-tunnel.log 2>&1 &
#   cat /tmp/demo-url.txt        # the address to hand out
#
# Cloudflare quick tunnels drop their control stream after a while and the
# process stays alive while serving nothing, which reads to whoever you sent the
# link as "your product is broken". This watches the public address rather than
# the process, and rebuilds the tunnel when the address stops answering.
#
# It cannot give a permanent address — a quick tunnel gets a new name each time
# it is rebuilt. That is what a real deployment is for. This is for handing a
# link to someone for an afternoon.

set -uo pipefail
PORT="${PORT:-3000}"
URL_FILE="${URL_FILE:-/tmp/demo-url.txt}"
CHECK_PATH="${CHECK_PATH:-/api/health/live}"
INTERVAL="${INTERVAL:-20}"
STRIKES="${STRIKES:-3}"

log() { echo "$(date -u +%FT%TZ) $*"; }

start_tunnel() {
  pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null
  sleep 2
  : > /tmp/demo-tunnel-raw.log
  nohup npx --yes cloudflared tunnel --url "http://127.0.0.1:$PORT" \
    > /tmp/demo-tunnel-raw.log 2>&1 &
  # The address appears a few seconds after boot.
  for _ in $(seq 1 40); do
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/demo-tunnel-raw.log | head -1)
    [ -n "${URL:-}" ] && break
    sleep 2
  done
  if [ -z "${URL:-}" ]; then log "no address issued; will retry"; return 1; fi
  echo "$URL" > "$URL_FILE"
  log "tunnel up: $URL"
  return 0
}

# The local app has to be up first, or the tunnel serves 502s.
for _ in $(seq 1 30); do
  curl -sf -o /dev/null --max-time 5 "http://127.0.0.1:$PORT$CHECK_PATH" && break
  log "waiting for the app on :$PORT"
  sleep 3
done

start_tunnel || true
miss=0
while true; do
  sleep "$INTERVAL"
  URL=$(cat "$URL_FILE" 2>/dev/null || echo "")
  if [ -z "$URL" ]; then start_tunnel || true; continue; fi
  if curl -sf -o /dev/null --max-time 15 "$URL$CHECK_PATH"; then
    miss=0
  else
    miss=$((miss + 1))
    log "public address failed ($miss/$STRIKES): $URL"
    if [ "$miss" -ge "$STRIKES" ]; then
      log "rebuilding the tunnel"
      start_tunnel && miss=0
    fi
  fi
done
