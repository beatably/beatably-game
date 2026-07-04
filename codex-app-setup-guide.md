# Codex App Setup Guide

This guide explains how Codex App on macOS can help test Beatably, how the
local setup works for this project, and what repository changes were made to
support autonomous multiplayer testing.

## What Codex App adds

Codex App on Mac gives you two capabilities that matter for this project:

1. A local coding agent that can inspect the repo, run commands, edit files,
   and review logs while staying inside your local machine.
2. Computer Use, which can visually operate desktop apps by clicking, typing,
   and reading what is on screen.

That second capability is the important one for GUI testing. It makes it
possible to ask Codex to:

- interact with browser windows,
- drive the iOS Simulator,
- create and join multiplayer rooms visually,
- retry a flow after making a code change.

For Beatably, that is especially useful because multiplayer bugs often only
appear when two separate clients are connected to the same room.

## How the setup works in this repo

There are two practical testing paths.

There is also one important workflow recommendation from OpenAI's docs: keep
common commands inside the Codex app's **Local environments** actions so Codex
can run them in the integrated terminal instead of forcing you to bounce
between the thread and a separate terminal tab.

### 1. Browser-first multiplayer testing

This is the most reliable path today.

Beatably already includes an `e2e/` harness that runs two isolated browser
players against the local backend and frontend. That means Codex App can test
real multiplayer behavior without needing Spotify login or production services.

Flow:

1. Start the local backend on `http://127.0.0.1:3001`.
2. Start the frontend on `http://127.0.0.1:5173`.
3. Open two separate browser sessions.
4. Create a room in one session and join it from the other.
5. Let Codex verify the flow visually or inspect logs if something breaks.

Why this path is strong:

- It uses the real local app.
- It already has two-player and reconnect-oriented tooling.
- It separates multiplayer/game-state bugs from iOS-specific UI bugs.

### Codex app local actions

This repo now includes action wrappers in [.codex/README.md](/Users/tim/Game/.codex/README.md:1)
so the Codex app can expose stable top-bar actions for:

- starting the local stack,
- running iOS unit tests,
- running iOS UI tests,
- opening the dual-simulator flow.

Those wrappers live here:

- [.codex/actions/start-stack.sh](/Users/tim/Game/.codex/actions/start-stack.sh:1)
- [.codex/actions/run-ios-unit-tests.sh](/Users/tim/Game/.codex/actions/run-ios-unit-tests.sh:1)
- [.codex/actions/run-ios-ui-tests.sh](/Users/tim/Game/.codex/actions/run-ios-ui-tests.sh:1)
- [.codex/actions/open-dual-sim.sh](/Users/tim/Game/.codex/actions/open-dual-sim.sh:1)
- [.codex/setup/setup-worktree.sh](/Users/tim/Game/.codex/setup/setup-worktree.sh:1)

### 2. Dual iOS Simulator testing

This is the native-app path.

The iOS app in `ios/` is configured to talk to the local backend in debug mode:

- debug backend URL: `http://127.0.0.1:3001`
- production backend URL: Render deployment

That means two simulator instances can join the same locally hosted room just
like two browsers can.

Flow:

1. Start the local backend.
2. Build the app for iOS Simulator.
3. Launch the app in two separate simulators.
4. Ask Codex App to use Computer Use to drive both windows.
5. Create/join a room and verify gameplay across both clients.

This path is best when:

- the issue only appears in the SwiftUI app,
- you want visual confidence in the native flow,
- you want Codex to inspect actual simulator behavior instead of browser-only behavior.

## What I changed in the repo

I added the following support for Codex App based multiplayer testing.

### 1. Persistent local stack runner

File: [e2e/dev-stack.sh](/Users/tim/Game/e2e/dev-stack.sh:1)

What it does:

- starts the backend on port `3001`,
- starts the frontend on port `5173`,
- seeds an isolated cache for safe local runs,
- keeps both processes alive for longer interactive Codex App sessions,
- prints the active URLs and log file locations.

Why it helps:

`e2e/run.sh` is great for one-shot automated flows, but Codex App often needs a
stable stack that stays up across multiple prompts while it explores, tests,
fixes, and retests.

### 2. Dual simulator launcher

File: [ios/scripts/dual-sim-run.sh](/Users/tim/Game/ios/scripts/dual-sim-run.sh:1)

What it does:

- selects two available iPhone simulators,
- boots both,
- opens separate Simulator app instances,
- builds the iOS app once,
- installs and launches the app on both simulators,
- captures initial screenshots.

Why it helps:

This turns a multi-step manual simulator setup into one repeatable command that
Codex App can work from.

### 3. Simulator XCTest runner

File: [ios/scripts/test-sim.sh](/Users/tim/Game/ios/scripts/test-sim.sh:1)

What it does:

- runs the `BeatableTests` XCTest target on an iPhone simulator,
- keeps Xcode caches, module cache output, package checkouts, and test result
  bundles inside `ios/build/`,
- makes simulator-backed test runs easier to repeat from Codex or Terminal.

Why it helps:

This gives the native app a command-driven regression path in addition to the
visual Computer Use path.

### 4. Codex multiplayer testing doc

File: [docs/codex-multiplayer-testing.md](/Users/tim/Game/docs/codex-multiplayer-testing.md:1)

What it contains:

- browser-first guidance,
- dual-simulator guidance,
- prompt examples for Codex App,
- recommendations on when to choose browser vs simulator.

### 5. Documentation links

Files:

- [README.md](/Users/tim/Game/README.md:60)
- [e2e/README.md](/Users/tim/Game/e2e/README.md:17)
- [.codex/README.md](/Users/tim/Game/.codex/README.md:1)

What changed:

- added a link from the root README to the Codex multiplayer testing doc,
- documented `e2e/dev-stack.sh` in the E2E README,
- added Codex app local-environment action wrappers under `.codex/`.

## How to use this in Codex App on Mac

### Browser workflow

Start the local stack from the Codex app `Stack` action or with:

```bash
e2e/dev-stack.sh
```

Then in Codex App, use a prompt like:

```text
Use two browser windows to test Beatably multiplayer locally at http://127.0.0.1:5173.
Create a room as player Alice, join it as player Bob, start a game, and tell me
where the flow breaks if it does.
```

### iOS simulator workflow

Start the stack, then open the two simulators from the Codex app `Dual Sim`
action or with:

```bash
e2e/dev-stack.sh
cd ios
./scripts/dual-sim-run.sh
```

Then in Codex App, use a prompt like:

```text
Use Computer Use to test Beatably across the two open iOS Simulator windows.
Create a room in one app, join it from the other, start a game, and verify that
both players reach the active game screen. If something fails, inspect logs and
make the smallest fix needed.
```

### Xcode test workflow

When you want a repeatable native regression pass instead of a fully visual
multiplayer session, run the Codex app `iOS Unit` action or:

```bash
cd ios
./scripts/test-sim.sh
```

This uses the existing `BeatableTests` target and stores the `.xcresult` bundle
under `ios/build/TestResults/`.

For simulator UI automation instead of logic-only tests, start the backend and
run the Codex app `iOS UI` action or:

```bash
cd ios
SCHEME=BeatablyUI ./scripts/test-sim.sh
```

That scheme launches the app and exercises the native create/join entry flow
through `BeatableUITests`.

## Current caveat on this machine

Xcode is installed, but during CLI verification the local simulator service was
not healthy. `simctl` reported a CoreSimulator connection failure. So the repo
setup is ready, but the Mac may still need a local simulator restart or Xcode
reopen before the dual-simulator path works reliably.

## Recommended usage pattern

- Use browser-first testing for faster and more deterministic multiplayer regression work.
- Use the dual-simulator path for native-only issues and visual validation.
- Use the Codex app's Local environments actions for common commands so Codex
  and the integrated terminal stay on the same surface.
- Use Computer Use when Codex needs to visually drive Simulator or another GUI app.
- Use the CLI or IDE extension when you only need command-driven build, test,
  log, or code-change loops.
