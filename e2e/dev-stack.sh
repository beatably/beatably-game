#!/usr/bin/env bash
# Starts the local multiplayer stack and keeps it running for manual testing or
# Codex App Computer Use sessions.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E="$ROOT/e2e"
LOGS="$E2E/logs"
TMPCACHE="$E2E/.cache"

mkdir -p "$LOGS"
rm -rf "$TMPCACHE"
mkdir -p "$TMPCACHE"

if [ -f "$ROOT/backend/cache/curated-songs.json" ]; then
  cp "$ROOT/backend/cache/curated-songs.json" "$TMPCACHE/"
fi

echo "[dev-stack] starting backend on http://127.0.0.1:3001"
BACKEND_PID=""
FRONTEND_PID=""

if curl -sf -o /dev/null "http://127.0.0.1:3001/"; then
  echo "[dev-stack] backend already running; reusing it"
else
  ( cd "$ROOT/backend" && NODE_ENV=development PORT=3001 BEATABLY_CACHE_DIR="$TMPCACHE" node index.js ) \
    > "$LOGS/backend.log" 2>&1 &
  BACKEND_PID=$!
fi

echo "[dev-stack] starting frontend on http://127.0.0.1:5173"
if curl -sf -o /dev/null "http://127.0.0.1:5173/"; then
  echo "[dev-stack] frontend already running; reusing it"
else
  ( cd "$ROOT/frontend" && npm run dev -- --host 127.0.0.1 --port 5173 ) \
    > "$LOGS/frontend.log" 2>&1 &
  FRONTEND_PID=$!
fi

cleanup() {
  echo ""
  echo "[dev-stack] stopping services"
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    pkill -P "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

wait_for() {
  local url="$1"
  local name="$2"
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "$url"; then
      echo "[dev-stack] $name ready"
      return 0
    fi
    sleep 1
  done
  echo "[dev-stack] ERROR: $name not ready ($url)"
  return 1
}

wait_for "http://127.0.0.1:3001/" "backend"
wait_for "http://127.0.0.1:5173/" "frontend"

cat <<EOF
[dev-stack] multiplayer stack is ready

Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:3001
Logs:     $LOGS/backend.log
          $LOGS/frontend.log

Keep this shell open while Codex App tests the game.
Press Ctrl-C here when you want to stop the stack.
EOF

wait
