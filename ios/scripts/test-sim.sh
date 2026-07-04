#!/usr/bin/env bash
# Run Beatably's iOS XCTest target on a simulator while keeping all derived data,
# caches, and result bundles inside ios/build so the workflow is reproducible.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEME="${SCHEME:-Beatably}"
PROJECT="${PROJECT:-$ROOT_DIR/Beatably.xcodeproj}"
DERIVED_DATA="${DERIVED_DATA:-$ROOT_DIR/build}"
LOCAL_HOME="$DERIVED_DATA/home"
TMP_DIR="$DERIVED_DATA/tmp"
MODULE_CACHE="$DERIVED_DATA/ModuleCache.noindex"
SDK_STAT_CACHE="$DERIVED_DATA/SDKStatCaches.noindex"
SOURCE_PACKAGES_DIR="${SOURCE_PACKAGES_DIR:-$DERIVED_DATA/SourcePackages}"
DEVICE_NAME="${DEVICE_NAME:-${1:-}}"
TEST_ONLY="${TEST_ONLY:-}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RESULT_BUNDLE="$DERIVED_DATA/TestResults/Beatably-$TIMESTAMP.xcresult"
SIMULATOR_BOOT_RETRIES="${SIMULATOR_BOOT_RETRIES:-5}"
SIMULATOR_BOOT_DELAY="${SIMULATOR_BOOT_DELAY:-2}"
DEFAULT_DEVICE_NAME="${DEFAULT_DEVICE_NAME:-iPhone 16}"

mkdir -p \
  "$LOCAL_HOME/Library/Caches" \
  "$LOCAL_HOME/.cache" \
  "$TMP_DIR" \
  "$MODULE_CACHE" \
  "$SDK_STAT_CACHE" \
  "$SOURCE_PACKAGES_DIR" \
  "$(dirname "$RESULT_BUNDLE")"

pick_device() {
  xcrun simctl list devices available --json | python3 - "$DEVICE_NAME" <<'PY'
import json
import sys

want = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(2)

booted = None
fallback = None
for runtime, devices in data.get("devices", {}).items():
    if "iOS" not in runtime:
        continue
    for device in devices:
        if "iPhone" not in device.get("name", ""):
            continue
        if want and device["name"] == want:
            print(f'{device["name"]}\t{device["udid"]}')
            sys.exit(0)
        if device.get("state") == "Booted" and booted is None:
            booted = device
        if fallback is None:
            fallback = device

choice = booted or fallback
if not choice:
    sys.exit(1)
print(f'{choice["name"]}\t{choice["udid"]}')
PY
}

ensure_simulator_service() {
  local attempt=1
  while [ "$attempt" -le "$SIMULATOR_BOOT_RETRIES" ]; do
    if DEVICE_INFO="$(pick_device 2>/dev/null)"; then
      printf '%s\n' "$DEVICE_INFO"
      return 0
    fi

    # Opening Simulator often revives CoreSimulatorService after Xcode updates
    # or after the service has gone idle.
    open -a Simulator >/dev/null 2>&1 || true
    sleep "$SIMULATOR_BOOT_DELAY"
    attempt=$((attempt + 1))
  done
  return 1
}

DESTINATION=""
if DEVICE_INFO="$(ensure_simulator_service)"; then
  DEVICE_LABEL="${DEVICE_INFO%%$'\t'*}"
  DEVICE_UDID="${DEVICE_INFO#*$'\t'}"
  DESTINATION="platform=iOS Simulator,id=$DEVICE_UDID"

  echo "▶ Using simulator: $DEVICE_LABEL ($DEVICE_UDID)"
  xcrun simctl boot "$DEVICE_UDID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$DEVICE_UDID" -b
else
  DEVICE_LABEL="${DEVICE_NAME:-$DEFAULT_DEVICE_NAME}"
  DESTINATION="platform=iOS Simulator,name=$DEVICE_LABEL"
  echo "▶ simctl is unavailable; falling back to Xcode destination by name: $DEVICE_LABEL"
  open -a Simulator >/dev/null 2>&1 || true
fi

XCODE_ARGS=(
  test
  -project "$PROJECT"
  -scheme "$SCHEME"
  -destination "$DESTINATION"
  -derivedDataPath "$DERIVED_DATA"
  -clonedSourcePackagesDirPath "$SOURCE_PACKAGES_DIR"
  -resultBundlePath "$RESULT_BUNDLE"
  CODE_SIGN_IDENTITY=""
  CODE_SIGNING_REQUIRED=NO
  ONLY_ACTIVE_ARCH=YES
)

if [ -n "$TEST_ONLY" ]; then
  XCODE_ARGS+=(-only-testing:"$TEST_ONLY")
fi

echo "▶ Running XCTest"
HOME="$LOCAL_HOME" \
CFFIXED_USER_HOME="$LOCAL_HOME" \
TMPDIR="$TMP_DIR/" \
CLANG_MODULE_CACHE_PATH="$MODULE_CACHE" \
SWIFT_MODULECACHE_PATH="$MODULE_CACHE" \
SDK_STAT_CACHE_DIR="$SDK_STAT_CACHE" \
xcodebuild "${XCODE_ARGS[@]}"

echo
echo "▶ Test run finished"
echo "Result bundle: $RESULT_BUNDLE"
