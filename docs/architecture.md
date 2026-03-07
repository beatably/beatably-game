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
| `chartProvider.js` | Chart data provider: Billboard Hot 100 (remote GitHub JSON) + Swedish chart history (local JSON) |
| `discovery.js` | Local network device discovery (mDNS/Bonjour + SSDP) |

### Game State

- All game state lives in-memory (`lobbies`, `games` objects)
- Persisted to `cache/state.json` every 250ms (debounced) and on SIGINT/SIGTERM
- Restored from disk on server restart
- Production persistent disk: `/var/data/cache/` (Render); falls back to `backend/cache/`

### Song Database

- File: `cache/curated-songs.json`
- Songs are enriched with: Spotify preview URL, MusicBrainz year, genre, `isInternational` flag
- Smart migration between deployed DB and persistent disk (avoids overwriting newer data)
- Admin API for managing songs (requires `x-admin-secret` header)
- Swedish chart history: `backend/data/swedish-charts.json` (~4,400 tracks, 1977–present) committed to repo

**Song schema fields (selected):**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID (`cur_<timestamp>_<random>`) |
| `spotifyUri` | string | `spotify:track:…` |
| `title`, `artist` | string | Track metadata |
| `year` | number \| null | Release year |
| `genre`, `genreSecondary` | string | Primary/secondary genre |
| `genres` | string[] | `[genre, genreSecondary].filter(Boolean)` — max 2 |
| `difficultyLevel` | 1–5 | Used for Easy/Advanced pool selection |
| `popularity` | 0–100 | Spotify popularity score |
| `isBillboardChart` | boolean | Whether the song charted on Billboard Hot 100 |
| `chartInfo` | object | `{ rank, peakPos, weeksOnChart, chartDate }` |
| `verified` | boolean | Manually confirmed quality |
| `suspicionCleared` | boolean | Reviewed by admin as OK despite matching suspicious patterns (default `false`) |

**Difficulty / Easy mode filter** (`curatedDb.js`):

A song is included in the Easy pool if:
```js
(isBillboardChart === true && popularity >= 20) || (difficultyLevel <= 2 && popularity >= 70)
```
The `popularity >= 20` floor on chart songs prevents obscure covers, remixes, and low-quality recordings from appearing even if they carry the Billboard flag.

**Genre schema per song:**

| Field | Type | Description |
|---|---|---|
| `genre` | string | Primary genre (backward-compatible) |
| `genreSecondary` | string \| null | Secondary genre, only set when ≥25% of primary's MusicBrainz vote weight |
| `genres` | string[] | Derived array: `[genre, genreSecondary].filter(Boolean)` — always max 2 elements |

**Genre detection pipeline** (`geographyDetection.js`):
1. Query MusicBrainz for the artist's tags (top 20 by vote count)
2. Accumulate votes per canonical bucket (`pop`, `rock`, `hip-hop`, `electronic`, `indie`)
3. Bucket with highest total votes → `genre` (primary)
4. Second bucket qualifies as `genreSecondary` only if its votes ≥ 25% of primary's
5. Fallback to Spotify artist genres if MusicBrainz returns nothing (single genre, no secondary)

The `genres` array is what the game filter checks — filtering on "Rock" matches songs where `genres` includes `"rock"`, regardless of whether it's primary or secondary.

### Song Curation & Quality Control

The database was built from Billboard Hot 100 history + genre-based Spotify searches. Automated import can occasionally bring in false positives — covers, remixes, live versions, tribute bands, children's songs, or low-popularity recordings of legitimate chart hits.

**Suspicious song detection** — implemented in both the admin UI (`frontend/public/admin.html`) and the populate script (`backend/scripts/populate-initial-database.js`). A song is flagged as suspicious if its title, artist, or genre matches patterns for:
- Version variants: remix, cover, live, remaster, acoustic, instrumental, karaoke, medley, etc.
- Tribute/karaoke artists: "tribute band", "as made famous by", "in the style of", etc.
- Children's/novelty content: nursery rhyme, lullaby, white noise, baby songs, etc.
- Low-popularity chart songs: `isBillboardChart: true` but `popularity < 20`

**Admin workflow:**
1. In `admin.html`, activate the **⚠ Suspicious** filter chip to see all unreviewed flagged songs
2. Listen via the Spotify link or 30s preview, then either **Delete** (real bad apple) or click **OK** (false positive — sets `suspicionCleared: true`)
3. Cleared songs gain a subtle gray **✓** indicator and are excluded from the suspicious filter going forward; click ✓ to undo
4. After a bulk import, the populate script prints a list of suspicious songs imported so you know to run a review

**Curation scripts** (`backend/scripts/`):

| Script | Purpose |
|---|---|
| `audit-easy-mode.js` | Read-only audit: categorizes all Easy-eligible songs into suspect groups, outputs `cache/audit-easy-mode-results.json` |
| `clean-easy-mode.js` | Applies bulk cleanup: `--delete` removes songs, `--demote` sets `difficultyLevel=3` (removes from Easy without deleting), always backs up first |
| `bulk-clear-suspicion.js` | One-time: marks all currently-suspicious songs as `suspicionCleared=true` (use after an initial review pass) |

### Feature Flags (`config.js`)

| Flag | Env Var | Default |
|---|---|---|
| Chart mode (Billboard) | `CHART_MODE_ENABLE` | `false` |
| MusicBrainz enrichment | `MUSICBRAINZ_ENABLE` | `true` |
| Remaster filter | `REMASTER_FILTER_ENABLE` | `true` |
| Swedish chart data path | `SWEDISH_CHART_DATA_PATH` | `backend/data/swedish-charts.json` |
| Swedish Spotify playlist | `SWEDISH_SPOTIFY_PLAYLIST_ID` | `37i9dQZEVXbLoATJ81JYXz` (Sweden Top 50) |

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
- `POST /api/admin/import/preview` + `/commit` — Bulk import (Billboard, Swedish Charts, Svensktoppen)
- `POST /api/admin/enrich-batch` — Batch enrich missing fields; `force: true` re-enriches all songs (auto-backs up DB first)
- `GET /api/admin/backups` — List available database backups on persistent disk
- `POST /api/admin/restore-backup` — Restore DB from a named backup file
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
