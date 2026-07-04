#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[codex-setup] installing backend dependencies"
(cd "$ROOT/backend" && npm install)

echo "[codex-setup] installing frontend dependencies"
(cd "$ROOT/frontend" && npm install)

echo "[codex-setup] resolving iOS packages"
(cd "$ROOT/ios" && xcodebuild -resolvePackageDependencies -project Beatably.xcodeproj -scheme Beatably -clonedSourcePackagesDirPath "$ROOT/ios/build/SourcePackages" -derivedDataPath "$ROOT/ios/build")

echo "[codex-setup] ready"
