# Codex Multiplayer Testing

This project can be tested with Codex App on macOS in two ways:

1. **Browser-first** for the most repeatable local multiplayer runs.
2. **Dual iOS simulators** when you want Codex Computer Use to verify native UI flows visually.

The browser path is currently the stronger automation path in this repo because
the `e2e/` harness already drives two independent players and captures logs and
screenshots. The simulator path is useful for native UX checks and manual
multiplayer validation with Codex Computer Use.

## Codex app local actions

For the Codex app workflow OpenAI documents, point the project's **Local
environments** setup and actions at the repo-owned wrapper scripts in
[.codex/README.md](/Users/tim/Game/.codex/README.md:1).

Recommended mappings:

- setup script: `.codex/setup/setup-worktree.sh`
- `Stack`: `.codex/actions/start-stack.sh`
- `iOS Unit`: `.codex/actions/run-ios-unit-tests.sh`
- `iOS UI`: `.codex/actions/run-ios-ui-tests.sh`
- `Dual Sim`: `.codex/actions/open-dual-sim.sh`

These actions run in the Codex app's integrated terminal, which is the cleanest
way to avoid splitting terminal work between Codex shell tools and a separate,
unattached terminal tab.

## Browser path

Start the local stack and leave it running:

```bash
e2e/dev-stack.sh
```

Then in Codex App on your Mac:

1. Open this repo as a local project.
2. Open `http://127.0.0.1:5173` in the in-app browser or Chrome.
3. Ask Codex to test with two separate browser sessions.

Suggested prompt:

```text
Use two browser windows to test Beatably multiplayer locally at http://127.0.0.1:5173.
Create a room as player Alice, join it as player Bob, start a game, play through at
least one turn, and tell me exactly where the flow breaks if it does.
```

Notes:

- If the task needs logged-in browser state, use Chrome plus Computer Use.
- If the task is just local web verification, prefer the in-app browser first.
- The existing `e2e/` harness covers real multiplayer flows such as reconnect and challenge behavior.

## Dual iOS simulator path

From `ios/`, build once and open two simulator instances:

```bash
cd ios
./scripts/dual-sim-run.sh
```

This script:

- picks two available iPhone simulators,
- boots them,
- opens two Simulator app instances,
- builds the app once for iOS Simulator,
- installs and launches the app on both devices,
- saves one screenshot per simulator.

The iOS app uses `http://127.0.0.1:3001` in debug mode, so it talks to the same
local backend as the web app.

Suggested Codex App prompt:

```text
Use Computer Use to test Beatably across the two open iOS Simulator windows.
Create a room in one app, join it from the other, start a game, and verify that
both players reach the active game screen. If something fails, inspect the local
logs and make the smallest fix needed.
```

## Xcode automated tests on Simulator

Beatably also has an iOS XCTest target: `BeatableTests`.

From `ios/`, run:

```bash
./scripts/test-sim.sh
```

What this does:

- chooses a booted iPhone simulator if one exists, otherwise the first available one,
- boots it if needed,
- runs `xcodebuild test` against the `Beatably` scheme,
- keeps DerivedData, SwiftPM caches, module caches, and `.xcresult` bundles inside `ios/build/`.

Useful variants:

```bash
DEVICE_NAME="iPhone 16 Pro" ./scripts/test-sim.sh
TEST_ONLY="BeatableTests/TimelineFilterTests" ./scripts/test-sim.sh
SCHEME=BeatablyUI ./scripts/test-sim.sh
```

If you want the same run from Xcode:

1. Open [ios/Beatably.xcodeproj](/Users/tim/Game/ios/Beatably.xcodeproj).
2. Select the `Beatably` scheme.
3. Pick an iPhone simulator.
4. Run Product > Test.

That path uses the same `BeatableTests` target, while the script is better for
repeatable local automation and Codex-driven retest loops.

The `BeatablyUI` scheme runs native simulator UI tests in `BeatableUITests`.
Those tests expect the local backend to be running on `http://127.0.0.1:3001`,
because the app waits for a real socket connection before enabling the create
and join buttons.

## When to choose which

- Choose **browser** when you want the fastest and most deterministic multiplayer regression checks.
- Choose **dual simulators** when the bug is native-only or when you need visual confidence in the SwiftUI app.
- Use both when you want to separate backend/game-state bugs from native UI bugs.

## Known local prerequisites

- Xcode and iOS Simulator must be installed and healthy.
- The frontend should be available on `http://127.0.0.1:5173`.
- The backend should be available on `http://127.0.0.1:3001`.
- Codex App on macOS needs Computer Use enabled for simulator-driven testing.
- If `simctl` reports a CoreSimulator connection failure, reopen Xcode and the
  Simulator app before retrying either `dual-sim-run.sh` or `test-sim.sh`.
