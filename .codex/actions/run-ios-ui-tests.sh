#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/ios"
exec env SCHEME=BeatablyUI DEVICE_NAME="${DEVICE_NAME:-iPhone 16}" ./scripts/test-sim.sh
