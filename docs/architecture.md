# Beatably — Architecture

A multiplayer music timeline guessing game. Players take turns placing songs on a chronological timeline, competing to build the most accurate timeline.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, Tailwind CSS, react-dnd |
| Backend | Node.js + Express 5, Socket.io 4 |
| Real-time | Socket.io (WebSockets) |
| Music | Spotify Web Playback SDK + Spotify Web API |
| Hosting | Netlify (frontend), Render (backend) |

---

## Project Structure

```
/
├── frontend/          React SPA
├── backend/           Node.js API + game server
├── data/              Chart data samples
├── docs/              Documentation (you are here)
│   └── archive/       Historical notes and debug scripts
└── netlify.toml       Netlify build config
```

---

## Frontend

### Entry Point & Views

`App.jsx` is the master orchestrator (~2,800 lines). It manages socket connections, auth state, and renders one of three views:

| View | Component | Description |
|---|---|---|
| `landing` | `Landing.jsx` | Spotify OAuth login, create/join game |
| `waiting` | `WaitingRoom.jsx` | Pre-game lobby, player list, settings |
| `game` | (inline in App.jsx) | Active game: timeline, footer controls, header |

### Game Phases

Within the `game` view, state progresses through these phases:
- `setup` — Initial load
- `player-turn` — Active player places a card on the timeline
- `reveal` — Card placement is revealed and scored
- `game-over` — Final scores, winner display

### Key Components

| Component | Purpose |
|---|---|
| `App.jsx` | Socket management, auth flow, view routing, all game logic handlers |
| `GameFooter.jsx` | Playback controls, song info display, challenge/credit UI (~1,730 lines) |
| `CurvedTimeline.jsx` | Timeline visualization with drag-and-drop card placement (~1,200 lines) |
| `GameSettings.jsx` | Settings panel: difficulty, year range, genres, device selection |
| `SpotifyPlayer.jsx` | Spotify Web Playback SDK initialization and player events |
| `PlayerHeader.jsx` | Player name, score, turn indicator |
| `TimelineBoard.jsx` | Game board rendering |
| `DeviceSwitchModal.jsx` | Spotify Connect device switcher |
| `WinnerView.jsx` | End-of-game screen |
| `SongGuessModal.jsx` | Song title/artist guessing interface |
| `SessionRestore.jsx` | Re-join after page refresh |
| `SongDebugPanel.jsx` | Debug panel (Ctrl+D or bug icon); intentionally kept for development |

### Utilities (`src/utils/`)

| File | Purpose |
|---|---|
| `spotifyAuth.js` | Spotify token management, API requests, device management (664 lines) |
| `productionPlaybackFix.js` | "Nuclear reset" for stuck playback state |
| `deviceDiscovery.js` | Discover Spotify Connect devices via backend |
| `deviceAwarePlayback.js` | Device-specific playback handling |
| `soundUtils.js` | Web Audio API sound effects with HTML audio fallback |
| `sessionManager.js` | Persist/restore game session to localStorage |
| `viewportUtils.js` | Responsive viewport utilities |
| `debugLogger.js` | Intercept console logs and send to backend (enable via localStorage flag) |
| `castUtils.js` | Chromecast/AirPlay casting utilities |

### Audio Modes

**Preview Mode** (default — no Spotify account needed)
- Plays 30-second Spotify preview URLs
- Uses a `<video>` element for AirPlay compatibility on iOS/Safari
- Managed by `PreviewModeContext.jsx`

**Full Play Mode** (requires Spotify Premium)
- Uses the Spotify Web Playback SDK
- Initialized in `SpotifyPlayer.jsx`
- Full track playback via device transfer

### State Management

- React state in `App.jsx` (no Redux/Zustand)
- `PreviewModeContext` — audio mode shared across components
- `sessionManager` — localStorage persistence for reconnection

### Dependencies

```json
react, react-dom              19.x  — Core
socket.io-client              4.8   — Real-time
react-dnd, react-dnd-html5-backend  16  — Drag and drop
canvas-confetti               1.9   — Winner celebration
@radix-ui/react-label, /slot  —     — Accessible UI primitives
class-variance-authority       —     — Button variant composition
clsx, tailwind-merge           —     — Class utilities
tailwindcss-animate            —     — Animations
```

### Known Dead Code / Cleanup Candidates

- **`src/lib/spotify/PlayerSync.ts`** — "Spotify Sync v2" gated behind `VITE_SPOTIFY_SYNC_V2=true`, which is never set. This entire module (~17KB) is currently inactive. Knip confirms its types are unused.
- **`src/components/ui/switch.tsx`** — Installed from Shadcn but never used.
- **`@radix-ui/react-slider`, `@radix-ui/react-switch`, `lucide-react`** — npm packages installed but unused (knip confirmed).

---

## Backend

### Structure

| File | Purpose |
|---|---|
| `index.js` | Main server: all HTTP routes, Socket.io events, game state (~5,300 lines) |
| `config.js` | Feature flags, thresholds, provider URLs |
| `curatedDb.js` | File-backed song database (JSON on disk) |
| `analytics.js` | Session and error analytics |
| `songEnrichment.js` | Pipeline: MusicBrainz metadata + preview URLs + geography |
| `geographyDetection.js` | Artist origin detection (MusicBrainz + Spotify genre hints) |
| `musicbrainz.js` | MusicBrainz API integration with rate limiting + local cache |
| `chartProvider.js` | Billboard Hot 100 fetcher (remote GitHub JSON or local fallback) |
| `discovery.js` | Local network device discovery (mDNS/Bonjour + SSDP) |

### Game State

- All game state lives in-memory (`lobbies`, `games` objects)
- Persisted to `cache/state.json` every 250ms (debounced) and on SIGINT/SIGTERM
- Restored from disk on server restart
- Production persistent disk: `/var/data/cache/` (Render); falls back to `backend/cache/`

### Song Database

- File: `cache/curated-songs.json`
- Songs are enriched with: Spotify preview URL, MusicBrainz year, genre tags, `isInternational` flag
- Smart migration between deployed DB and persistent disk (avoids overwriting newer data)
- Admin API for managing songs (requires `x-admin-secret` header)

### Feature Flags (`config.js`)

| Flag | Env Var | Default |
|---|---|---|
| Chart mode (Billboard) | `CHART_MODE_ENABLE` | `false` |
| MusicBrainz enrichment | `MUSICBRAINZ_ENABLE` | `true` |
| Remaster filter | `REMASTER_FILTER_ENABLE` | `true` |

### HTTP API Routes

**Auth**
- `GET /login` — Spotify OAuth redirect
- `GET /callback` — OAuth callback, returns token to frontend

**Songs / Game**
- `POST /api/curated/select` — Select songs for a session
- `POST /api/fetch-songs` — Fetch songs with filters (year, genre, difficulty)

**Devices**
- `GET /api/local-devices` — Discover Spotify Connect devices on LAN
- `GET /api/local-devices/stream` — SSE stream for device updates
- `POST /api/wake-device` — Wake a Spotify device

**Admin** (require `x-admin-secret` header)
- `GET/POST/PUT/DELETE /api/admin/curated-songs` — Database CRUD
- `POST /api/admin/curated-songs/enrich/:id` — Enrich one song
- `GET /api/admin/analytics` — Analytics overview
- `POST /api/admin/import/preview` + `/commit` — Bulk import
- `GET /api/admin/usage-stats`, `/game-sessions`, `/error-logs`

**Debug**
- `GET /api/debug/songs`, `/games`, `/games/:code/songs`
- `POST/GET/DELETE /api/debug/frontend-logs`
- `GET /api/feature-flags`

---

## Socket.io Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `create_session` | `{roomCode, playerName, isCreator}` | Register a new persistent session |
| `reconnect_session` | `{sessionId, roomCode, playerName}` | Rejoin after disconnect/refresh |
| `create_lobby` | `{name, code, settings, sessionId}` | Create a new game lobby |
| `join_lobby` | `{name, code}` | Join an existing lobby |
| `leave_lobby` | `{code}` | Leave the lobby |
| `set_ready` | `{code, isReady}` | Toggle ready state in lobby |
| `kick_player` | `{code, playerId}` | Host removes a player |
| `update_settings` | `{code, settings}` | Update lobby settings |
| `start_game` | `{code, realSongs}` | Host starts the game |
| `place_card` | `{code, index}` | Active player places their song card |
| `continue_game` | `{code}` | Host advances to the next turn |
| `use_token` | `{code, action, targetPlayerId}` | Spend a credit (new song, etc.) |
| `guess_song` | `{code, title, artist}` | Submit a song title/artist guess |
| `skip_song_guess` | `{code}` | Skip song guessing phase |
| `initiate_challenge` | `{code}` | Challenger initiates a challenge |
| `skip_challenge` | `{code}` | Challenger skips |
| `challenge_place_card` | `{code, index}` | Challenger places their card |
| `continue_after_challenge` | `{code}` | Advance after challenge resolves |
| `update_challenger_id` | `{code, oldChallengerId, newChallengerId}` | Fix challenger ID after reconnect |
| `progress_update` | `{code, progress, duration, isPlaying}` | Sync playback position to server |
| `request_new_song` | `{code, playerName}` | Non-host requests a song change |
| `use_beatably_card` | `{code, cardId, targetPlayerId}` | Use a special Beatably power card |

### Server → Client

| Event | Description |
|---|---|
| `lobby_update` | Full lobby state (player list, settings, ready states) |
| `game_started` | Game begins; includes initial game state per player |
| `game_update` | Updated game state for this player |
| `new_song_loaded` | A new song is ready for the current turn |
| `stop_music` | Stop playback (with reason: `continue_to_next_turn`, `new_song`) |
| `song_guess_result` | Result of a title/artist guess attempt |
| `credit_spent_for_new_song` | A credit was spent to get a new song |
| `player_left_game` | A player disconnected mid-game |
| `host_left` | The host disconnected |
| `kicked` | This player was kicked by the host |
| `new_song_request` | Forwarded to host when another player requests a new song |

---

## Environments

| | Development | Production |
|---|---|---|
| Frontend | `http://localhost:5173` | `https://beatably.app` |
| Backend | `http://127.0.0.1:3001` | `https://beatably-backend.onrender.com` |
| State dir | `backend/cache/` | `/var/data/cache/` (Render persistent disk) |
