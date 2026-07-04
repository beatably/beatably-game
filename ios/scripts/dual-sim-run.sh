#!/usr/bin/env bash
# Builds Beatably once, then installs and launches it on two simulators so
# Codex App Computer Use can drive a multiplayer flow visually.
set -euo pipefail

SCHEME="Beatably"
PROJECT="Beatably.xcodeproj"
BUNDLE_ID="app.beatably.ios"
DERIVED_DATA="$(pwd)/build-dual"
LAUNCH_WAIT="${LAUNCH_WAIT:-3}"
SCREENSHOT_DIR="$(pwd)/dual-sim-screenshots"
DEVICE_A_NAME="${DEVICE_A_NAME:-}"
DEVICE_B_NAME="${DEVICE_B_NAME:-}"

mkdir -p "$SCREENSHOT_DIR"

pick_devices() {
  local devices_json
  local simctl_error="$SCREENSHOT_DIR/simctl-list-devices.err"
  if ! devices_json="$(xcrun simctl list devices available --json 2>"$simctl_error")"; then
    echo "CoreSimulator is unavailable; could not list iPhone simulators." >&2
    echo "Details: $simctl_error" >&2
    return 1
  fi

  SIMCTL_DEVICES_JSON="$devices_json" python3 - "$DEVICE_A_NAME" "$DEVICE_B_NAME" <<'PY'
import json
import os
import sys

want_a = sys.argv[1]
want_b = sys.argv[2]
data = json.loads(os.environ["SIMCTL_DEVICES_JSON"])

iphones = []
for runtime, devices in data["devices"].items():
    if "iOS" not in runtime:
        continue
    for device in devices:
        if "iPhone" not in device["name"]:
            continue
        iphones.append((device["name"], device["udid"]))

def choose(name, taken):
    if name:
        for n, u in iphones:
            if n == name and u not in taken:
                return (n, u)
    for n, u in iphones:
        if u not in taken:
            return (n, u)
    return None

first = choose(want_a, set())
if not first:
    sys.exit("No available iPhone simulators found.")

second = choose(want_b, {first[1]})
if not second:
    sys.exit("Only one available iPhone simulator found.")

for name, udid in (first, second):
    print(f"{name}\t{udid}")
PY
}

DEVICES=()
while IFS= read -r line; do
  DEVICES+=("$line")
done < <(pick_devices)
if [ "${#DEVICES[@]}" -lt 2 ]; then
  echo "Failed to select two simulators." >&2
  exit 1
fi

DEVICE_A_LABEL="${DEVICES[0]%%$'\t'*}"
DEVICE_A_UDID="${DEVICES[0]#*$'\t'}"
DEVICE_B_LABEL="${DEVICES[1]%%$'\t'*}"
DEVICE_B_UDID="${DEVICES[1]#*$'\t'}"

boot_device() {
  local udid="$1"
  xcrun simctl boot "$udid" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$udid" -b
}

echo "▶ Booting simulators"
echo "  A: $DEVICE_A_LABEL ($DEVICE_A_UDID)"
echo "  B: $DEVICE_B_LABEL ($DEVICE_B_UDID)"
boot_device "$DEVICE_A_UDID"
boot_device "$DEVICE_B_UDID"

echo "▶ Opening Simulator windows"
open -na Simulator --args -CurrentDeviceUDID "$DEVICE_A_UDID"
sleep 1
open -na Simulator --args -CurrentDeviceUDID "$DEVICE_B_UDID"

echo "▶ Building $SCHEME"
xcodebuild build \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO ONLY_ACTIVE_ARCH=YES \
  -quiet

APP_PATH="$(find "$DERIVED_DATA" -name "Beatably.app" -path "*/Debug-iphonesimulator/*" | head -1)"
if [ -z "$APP_PATH" ]; then
  echo "Could not find Beatably.app in $DERIVED_DATA" >&2
  exit 1
fi

launch_on() {
  local label="$1"
  local udid="$2"
  echo "▶ Installing on $label"
  xcrun simctl install "$udid" "$APP_PATH"
  echo "▶ Launching on $label"
  xcrun simctl launch "$udid" "$BUNDLE_ID" >/dev/null
  sleep "$LAUNCH_WAIT"
  xcrun simctl io "$udid" screenshot "$SCREENSHOT_DIR/${label// /-}.png" >/dev/null
}

launch_on "$DEVICE_A_LABEL" "$DEVICE_A_UDID"
launch_on "$DEVICE_B_LABEL" "$DEVICE_B_UDID"

cat <<EOF
▶ Ready for multiplayer testing

Simulator A: $DEVICE_A_LABEL
Simulator B: $DEVICE_B_LABEL
App build:    $APP_PATH
Screenshots:  $SCREENSHOT_DIR

Next step in Codex App:
- Ask Codex to use Computer Use on Simulator A and Simulator B.
- Create a room on one simulator and join from the other.
EOF
