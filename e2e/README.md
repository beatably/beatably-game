# Beatably E2E harness

Drives two browser players (Playwright, Chromium) against a **local** backend +
frontend to exercise real multiplayer flows that unit tests can't — reconnection,
turn handoff, challenges — with full log + screenshot capture.

Everything runs locally with **no Spotify**: game start pulls songs from the
local curated DB (`/api/curated/select`) and preview mode is the default.

## One-time setup
```bash
cd e2e
npm run setup      # installs playwright + downloads chromium
```

## Run
```bash
e2e/run.sh                     # boots backend + frontend, runs the flow, tears down
E2E_HEADED=1 e2e/run.sh        # show the browser windows
e2e/dev-stack.sh               # boots backend + frontend and keeps them running
```
Outputs (gitignored):
- `e2e/logs/backend.log`, `frontend.log`, `playerA.log`, `playerB*.log`
- `e2e/screenshots/*.png` — one per step

## Flows
- `reconnect-songguess.mjs` — A creates, B joins, A starts; B (active first,
  since the host plays last) places a card, then "kills Safari and restarts"
  mid-song-guess and rejoins. Asserts the placement highlight and the Skip
  button survive the reconnect.

## How it works
Create / join / start / rejoin go through the **real UI** (they drive React
state). Game progression that would otherwise need fragile SVG-timeline taps is
driven via a **dev-only** hook, `window.__beatably` (socket + room state), which
`import.meta.env.DEV` strips from production builds. Verification is always
against the real rendered UI + `window.lastGameUpdate`.

`dev-stack.sh` is the better entry point when you want Codex App on macOS to
drive the game with the in-app browser, Chrome, or Computer Use while keeping
the local stack alive between prompts.
