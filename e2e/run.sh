#!/usr/bin/env bash
# Orchestrates a full local two-player e2e run:
#   - boots the backend (isolated cache) and the Vite frontend
#   - waits for both to be ready
#   - runs the Playwright flow
#   - tears everything down
#
# Usage:  e2e/run.sh [flow.mjs]      (default: reconnect-songguess.mjs)
#         E2E_HEADED=1 e2e/run.sh    (show the browser windows)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E="$ROOT/e2e"
FLOW="${1:-reconnect-songguess.mjs}"
mkdir -p "$E2E/logs"

# Isolated backend cache seeded with the curated song DB, so we never touch the
# dev/prod cache or state.
TMPCACHE="$E2E/.cache"
rm -rf "$TMPCACHE"; mkdir -p "$TMPCACHE"
[ -f "$ROOT/backend/cache/curated-songs.json" ] && cp "$ROOT/backend/cache/curated-songs.json" "$TMPCACHE/"

echo "[run] starting backend on :3001"
( cd "$ROOT/backend" && NODE_ENV=development PORT=3001 BEATABLY_CACHE_DIR="$TMPCACHE" node index.js ) \
  > "$E2E/logs/backend.log" 2>&1 &
BACKEND_PID=$!

echo "[run] starting frontend (vite) on :5173"
( cd "$ROOT/frontend" && npm run dev ) > "$E2E/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!

cleanup() {
  echo "[run] cleaning up"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  pkill -P "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

wait_for() { # url, name
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "$1"; then echo "[run] $2 ready"; return 0; fi
    sleep 1
  done
  echo "[run] ERROR: $2 not ready ($1)"; return 1
}

wait_for "http://127.0.0.1:3001/" "backend" || exit 1
wait_for "http://127.0.0.1:5173/" "frontend" || exit 1

echo "[run] running flow: $FLOW"
( cd "$E2E" && node "$FLOW" )
RC=$?
echo "[run] flow exit code: $RC"
exit $RC
