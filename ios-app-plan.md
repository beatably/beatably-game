# Beatably iOS App — Build Plan

Native iOS app (Swift / SwiftUI) that connects to the existing Beatably backend as a third frontend alongside the web app and admin panel. Lives in `ios/` at the repo root.

---

## Guiding decisions

- **Language:** Swift + SwiftUI only. No React Native.
- **Only third-party dependency (v1):** `socket.io-client-swift` via Swift Package Manager. Everything else is Apple frameworks.
- **Audio (v1):** Preview Mode only — AVPlayer streams the 30s Spotify preview URLs. No Spotify SDK, no login required.
- **Architecture:** One `GameViewModel` (`@Observable` class) holds all socket event handling and game state — mirrors the role of `App.jsx` in the web frontend. Views are thin renderers.
- **Backend:** Unchanged. The iOS app is just another socket client.
- **Navigation:** SwiftUI `NavigationStack` — three root views: Landing → Lobby → Game.

---

## Repo structure (target)

```
/
├── backend/                          (unchanged)
├── frontend/                         (unchanged web app)
└── ios/
    ├── Beatably.xcodeproj
    └── Beatably/
        ├── BeatableApp.swift         entry point, NavigationStack root
        ├── Config.swift              backend URL: dev (127.0.0.1:3001) vs prod
        ├── GameViewModel.swift       all socket logic + game state (~App.jsx equivalent)
        ├── AudioPlayer.swift         AVPlayer singleton, preview URL playback
        ├── Views/
        │   ├── LandingView.swift     name entry
        │   ├── LobbyView.swift       create/join + settings + waiting room
        │   └── GameView.swift        active game screen
        └── Components/
            ├── SongCard.swift        song card display + year reveal
            ├── TimelineView.swift    horizontal scrolling timeline, tap-to-place
            ├── AudioControls.swift   play/pause, progress bar
            └── ChallengeOverlay.swift  challenge flow UI
```

---

## Phases

### Phase 1 — Scaffold
**Goal:** App boots, connects to backend socket, logs incoming events to Xcode console.

- Create `ios/` directory in repo root, Xcode project inside
- Add `socket.io-client-swift` via Swift Package Manager
- `Config.swift` — `backendURL` switches on `DEBUG` flag
- Bare `GameViewModel` that opens a socket connection on init
- Verify: run backend locally, launch iOS simulator, see socket events logged

**Done when:** simulator connects to `127.0.0.1:3001` and you can see socket events in the console.

---

### Phase 2 — Landing + Lobby
**Goal:** A player can enter their name, create or join a game, configure settings, and wait for the host to start.

- `LandingView` — name text field, "Create game" / "Join game" buttons
- `LobbyView` — room code display, player list, settings (win target, market, decades), host "Start" button
- `GameViewModel` handles: `join-room`, `room-update`, `player-joined`, `game-starting` events
- Join by code flow (type a room code)

**Blueprint:** Lobby and waiting-room logic in `App.jsx` (search for `join-room`, `room-update`, `waiting` view).

**Done when:** two simulator instances can join the same room and the host can start a game.

---

### Phase 3 — Core gameplay
**Goal:** A full game can be played end-to-end (no audio yet, no challenge yet).

- `GameView` layout — current song card at top, timeline at bottom, turn indicator
- `TimelineView` — horizontal scroll of placed cards; tap a gap to place the current card
- `SongCard` — shows artist/title during placement, reveals year on resolve
- `GameViewModel` handles all game-phase events:
  - `player-turn`, `song-revealed`, `placement-result`, `reveal`, `game-over`
  - Correct/wrong placement visual feedback
  - Turn transitions

**Blueprint:** Game phase handling in `App.jsx`; `CurvedTimeline.jsx` for placement logic (note: tap-based, not drag-and-drop).

**Done when:** a full game plays through to game-over with correct score tracking.

---

### Phase 4 — Audio
**Goal:** Songs play their 30s preview while the active player's turn is happening.

- `AudioPlayer.swift` — singleton wrapping AVPlayer
  - `play(url: String)`, `pause()`, `seek(to: Double)`
  - Publishes `currentTime` and `duration` for progress UI
- `AudioControls` component — play/pause button, progress bar
- Background audio mode enabled (AVAudioSession)
- Auto-play when a new turn starts; pause on turn end

**Done when:** preview audio plays on turn start, persists when phone locks, stops on turn end.

---

### Phase 5 — Credits + Challenge
**Goal:** Credits are earned and spent; challenge flow works end-to-end.

- Credits counter visible during game
- "Skip" button (costs 1 credit)
- "Challenge" button visible during `challenge-window` phase
- `ChallengeOverlay` — shows challenger placing on active player's timeline
- `GameViewModel` handles: `challenge-window`, `challenge-started`, `challenge-resolved`
- Resolution animation — card goes to winner's timeline

**Blueprint:** Challenge handling in `App.jsx`; `GameFooter.jsx` for credits UI.

**Done when:** a challenge can be initiated and resolved with correct card routing.

---

### Phase 6 — Polish + App Store prep
**Goal:** App is ready for TestFlight.

- App icon (all required sizes)
- Launch screen
- Privacy manifest (`PrivacyInfo.xcprivacy`) — required by Apple for all App Store submissions
- Handle edge cases: disconnection banner, reconnect logic, host leaves game
- Basic error states (room not found, server unreachable)
- Archive + upload via Xcode Organizer or `xcodebuild`

**Done when:** TestFlight build is live and playable by external testers.

---

## How to start a session

Tell Claude:
> "We're building the Beatably iOS app. See `ios-app-plan.md` for the full plan. We're on Phase X — [describe where you left off or what's next]."

Then point at the relevant web frontend file as the blueprint. Example:
> "The challenge flow in the web app is in `App.jsx` around the `challenge-window` handling — use that as the blueprint for Phase 5."

---

## Later (post-v1)

- Spotify Full Play mode — requires Spotify iOS SDK and login flow
- Android — separate Kotlin / Jetpack Compose project (same decision rationale applies)
- Push notifications for "it's your turn"
- Haptic feedback on card placement
