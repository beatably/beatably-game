#!/usr/bin/env bash
# Launch an auto-placing seed scenario and burst-capture screenshots across the
# placement animation window (~1.8s..2.6s after launch) so the node slide + gap-grow
# + bounce can be inspected frame-by-frame.
#
# Usage: ./scripts/capture-anim.sh <anim-move-left|anim-move-right>
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="app.beatably.ios"
DERIVED_DATA="$ROOT_DIR/build"
SCENARIO="${1:-anim-move-left}"
OUT_DIR="$ROOT_DIR/screenshots/anim/$SCENARIO"
UDID="${SIM_UDID:-$(xcrun simctl list devices booted --json | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];print(next((x["udid"] for r in d.values() for x in r if "iPhone" in x["name"]), ""))')}"

[ -n "$UDID" ] || { echo "No booted iPhone simulator (set SIM_UDID)." >&2; exit 1; }
rm -rf "$OUT_DIR"; mkdir -p "$OUT_DIR"

APP_PATH="$(find "$DERIVED_DATA" -name 'Beatably.app' -path '*Debug-iphonesimulator*' | head -1)"
[ -n "$APP_PATH" ] || { echo "Beatably.app not found — build first." >&2; exit 1; }
xcrun simctl install "$UDID" "$APP_PATH"

echo "▶ $SCENARIO (udid: $UDID)"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$UDID" "$BUNDLE_ID" UITEST_RESET_STATE UITEST_SEED_STATE "$SCENARIO" >/dev/null

# Placement fires at ~1.8s; animation runs ~0.8s. Burst from ~1.7s onward.
python3 -c "import time; time.sleep(1.7)"
for i in $(seq -w 1 12); do
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/frame_$i.png" >/dev/null 2>&1 &
  python3 -c "import time; time.sleep(0.13)"
done
wait
echo "▶ Captured frames in $OUT_DIR"
ls "$OUT_DIR"
