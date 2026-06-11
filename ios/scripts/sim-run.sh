#!/bin/bash
# Build, install, and screenshot the Beatably app in the iOS simulator.
# Run from ios/: ./scripts/sim-run.sh
set -e

SCHEME="Beatably"
PROJECT="Beatably.xcodeproj"
BUNDLE_ID="app.beatably.ios"
DERIVED_DATA="$(pwd)/build"
SCREENSHOT="$(pwd)/screenshot.png"
LAUNCH_WAIT="${1:-4}"   # seconds to wait after launch (default 4)

# Pick the booted sim, or the first available iPhone 17 Pro
SIM_UDID=$(xcrun simctl list devices available --json | python3 -c "
import json, sys
data = json.load(sys.stdin)
booted = None; fallback = None
for runtime, devices in data['devices'].items():
    if 'iOS' not in runtime: continue
    for d in devices:
        if d['state'] == 'Booted' and booted is None:
            booted = d['udid']
        if 'iPhone' in d['name'] and fallback is None:
            fallback = d['udid']
print(booted or fallback)
")

if [ -z "$SIM_UDID" ]; then
    echo "No simulator found." && exit 1
fi

echo "▶ Simulator: $(xcrun simctl list devices | grep "$SIM_UDID" | sed 's/ *(.*//'| xargs) ($SIM_UDID)"

# Boot if needed
xcrun simctl boot "$SIM_UDID" 2>/dev/null && echo "  Booted simulator." || echo "  Simulator already running."

# Build
echo "▶ Building..."
xcodebuild build \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=$SIM_UDID" \
    -derivedDataPath "$DERIVED_DATA" \
    -quiet \
    CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO ONLY_ACTIVE_ARCH=YES \
    2>&1 | grep -E "^(error:|warning: |Build (succeeded|FAILED)|.*\.swift:\d)" || true

echo "▶ Build succeeded."

# Find .app
APP_PATH=$(find "$DERIVED_DATA" -name "Beatably.app" -path "*/Debug-iphonesimulator/*" 2>/dev/null | head -1)
if [ -z "$APP_PATH" ]; then
    echo "Could not find Beatably.app in $DERIVED_DATA" && exit 1
fi

# Install and launch
echo "▶ Installing..."
xcrun simctl install "$SIM_UDID" "$APP_PATH"

echo "▶ Launching (waiting ${LAUNCH_WAIT}s for UI to settle)..."
xcrun simctl launch "$SIM_UDID" "$BUNDLE_ID" > /dev/null
sleep "$LAUNCH_WAIT"

# Screenshot
xcrun simctl io "$SIM_UDID" screenshot "$SCREENSHOT"
echo "▶ Screenshot: $SCREENSHOT"

# Recent logs from the app process
echo ""
echo "── Recent console output ──────────────────────────────"
xcrun simctl spawn "$SIM_UDID" log show \
    --last 10s \
    --predicate 'process == "Beatably"' \
    --style compact 2>/dev/null \
    | grep -v "^Filtering" | tail -30
echo "───────────────────────────────────────────────────────"
