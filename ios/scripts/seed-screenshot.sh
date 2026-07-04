#!/usr/bin/env bash
# Build once, then launch the app on a simulator with each UITEST_SEED_STATE
# scenario and capture a screenshot per scenario into ios/screenshots/seed/.
# Renders hard-to-reach timeline states (challenge-resolved, reveal) deterministically
# without orchestrating a live multiplayer game.
#
# Usage: ./scripts/seed-screenshot.sh [scenario ...]
#   No args = all scenarios. UDID overridable via SIM_UDID.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="app.beatably.ios"
DERIVED_DATA="$ROOT_DIR/build"   # gitignored (see root .gitignore: ios/build/)
OUT_DIR="$ROOT_DIR/screenshots/seed"
UDID="${SIM_UDID:-$(xcrun simctl list devices booted --json | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];print(next((x["udid"] for r in d.values() for x in r if "iPhone" in x["name"]), ""))')}"

SCENARIOS=("$@")
if [ "${#SCENARIOS[@]}" -eq 0 ]; then
  SCENARIOS=(challenge-resolved-won challenge-resolved-defended challenge-resolved-both-wrong reveal-correct reveal-incorrect)
fi

[ -n "$UDID" ] || { echo "No booted iPhone simulator found (set SIM_UDID)." >&2; exit 1; }
mkdir -p "$OUT_DIR"

echo "▶ Building (udid: $UDID)"
xcodebuild build -project "$ROOT_DIR/Beatably.xcodeproj" -scheme Beatably \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO ONLY_ACTIVE_ARCH=YES -quiet

APP_PATH="$(find "$DERIVED_DATA" -name 'Beatably.app' -path '*Debug-iphonesimulator*' | head -1)"
[ -n "$APP_PATH" ] || { echo "Beatably.app not found in $DERIVED_DATA" >&2; exit 1; }
xcrun simctl install "$UDID" "$APP_PATH"

for s in "${SCENARIOS[@]}"; do
  echo "▶ $s"
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" UITEST_RESET_STATE UITEST_SEED_STATE "$s" >/dev/null
  python3 -c "import time; time.sleep(3)"
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/$s.png" >/dev/null 2>&1
  echo "  saved $OUT_DIR/$s.png"
done

echo "▶ Done. Screenshots in $OUT_DIR"
