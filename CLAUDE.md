# Beatably — Claude Code Guide

Beatably is a multiplayer music timeline game. Players place songs in chronological order; first to reach the target count wins. React SPA frontend (Netlify) + Node.js/Socket.io backend (Render). Live at https://beatably.app. Native **iOS app** (Swift/SwiftUI, xcodegen) under `ios/` — submitted to the App Store July 2026 (see [ios/APPSTORE_LISTING.md](ios/APPSTORE_LISTING.md)).

> **Biggest recent change:** Spotify's developer policy bans games, so the Spotify **Full Play** (Premium web playback) mode was removed and consumer previews/album art were migrated to **Apple Music** (MusicKit). Spotify now only powers admin-side song sourcing. See "Audio migration" below.

---

## Local Development

```bash
# Backend (port 3001) — run first
cd backend && npm install && npm start

# Frontend (port 5173) — separate terminal
cd frontend && npm install && npm run dev
```

Create `backend/.env` before starting:
```
NODE_ENV=development
SPOTIFY_CLIENT_ID=your_id           # admin-side song sourcing only (search); no user OAuth
SPOTIFY_CLIENT_SECRET=your_secret
FRONTEND_URI=http://127.0.0.1:5173
ADMIN_PASSWORD=anything
# Apple Music (MusicKit) — powers consumer preview URLs + album art (see appleMusic.js)
APPLE_MUSIC_TEAM_ID=your_team_id
APPLE_MUSIC_KEY_ID=your_musickit_key_id
APPLE_MUSIC_PRIVATE_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
```

**Audio migration (July 2026):** Spotify's developer policy prohibits games, so consumer-facing
30s previews + album art now come from **Apple Music** (`applePreviewUrl`/`appleAlbumArt` per song,
via the admin enrichment endpoint). Spotify is **admin-side only** (song search/curation via client
credentials — no user OAuth, no Full Play/Web Playback SDK; all of that was removed).

---

## Key Files

| File | Role |
|---|---|
| `frontend/src/App.jsx` | Master orchestrator (~2,800 lines): all socket events, auth flow, view routing, game logic handlers |
| `frontend/src/GameFooter.jsx` | Playback controls, song info, credits, phase sections (challenge UI lives in `ChallengeSheet.jsx`) |
| `frontend/src/components/timeline/` | Timeline (iOS-parity rebuild, July 2026): layout engine, album-art nodes, spring placement animation, tap-based placement |
| `frontend/src/components/design/` | Shared design primitives: SpaceBackground, BottomCard, CoinView, CoinFlightLayer, EventNotificationCard |
| `backend/index.js` | All HTTP routes + Socket.io game logic (~5,300 lines) |
| `backend/curatedDb.js` | File-backed song database (reads/writes `cache/curated-songs.json`); serves `applePreviewUrl`/`appleAlbumArt`/`apple_music_url` when present |
| `backend/appleMusic.js` | Apple Music (MusicKit) client — ES256 dev token + ISRC catalog lookup, for `POST /api/admin/enrich-apple-music` |
| `backend/config.js` | Feature flags: `CHART_MODE_ENABLE`, `MUSICBRAINZ_ENABLE`, `REMASTER_FILTER_ENABLE` |
| `frontend/src/config.js` | API URL: dev → `:3001`, prod → `beatably-backend.onrender.com` |
| `frontend/src/contexts/PreviewModeContext.jsx` | Preview playback context (30s Apple Music clips — the only audio mode) |

---

## Architecture Highlights

- **Real-time**: Socket.io WebSockets; game state persisted to `cache/state.json` every 250ms
- **Production disk**: Render persistent disk mounts at `/var/data/cache/` (not `cache/`)
- **Game modes** (`settings.gameMode`): `multiplayer` (default) and `solo` (single-player survival streak — web + iOS, added July 2026 / v1.1). Solo: server builds a fixed easy→hard deck (`sortForProgression` in `backend/index.js`), run ends on first miss, score = correct placements, recorded to a global leaderboard (`backend/soloScores.js`). See memory `solo_mode.md`.
- **Game phases**: `setup → player-turn → song-guess → challenge-window → challenge → challenge-resolved → reveal → game-over`
- **Audio**: 30s Apple Music preview clips only (Full Play/Spotify Premium removed July 2026); Spotify is admin-side sourcing only
- **Song DB genres**: includes `'soundtrack'` (TV/movie themes) — gameplay integration not yet wired up

---

## Gotchas

- **Timeline is tap-based** (`components/timeline/Timeline.jsx`); `react-dnd` and the old `CurvedTimeline.jsx` were removed in the July 2026 web↔iOS parity pass. The iOS app (`ios/Beatably/Components/TimelineView.swift`) is the visual source of truth.
- **Full Play removed (July 2026)**: the Spotify Premium web-playback subsystem (Web Playback SDK, `/me/player` control, device discovery, OAuth `/login`+`/callback`) was deleted. Preview playback is the only audio mode; `PreviewModeContext.isPreviewMode` is always true. Don't reintroduce Spotify user-auth.
- **QR / link join (v1.1)**: lobbies show a QR code for `<origin>/join/<CODE>` (web: `qrcode.react` in `WaitingRoom.jsx`; iOS: `QRCodeView.swift` → `play.beatably.app/join/<code>`). Web `App.jsx` parses `/join/CODE` and `?join=CODE` on load into `pendingJoinCode`, suppresses auto-rejoin, and cleans the URL. The `/*`→`index.html` SPA fallback in `netlify.toml` serves this — but join links **must** use `play.beatably.app`, since the apex `beatably.app/*` rule 301s everything to the marketing home.
- **Solo entry is landing-only**: solo is created from the landing screen (`handleCreateSolo` / iOS `createSolo`) which auto-starts and skips the waiting room. The old WaitingRoom solo toggle was removed; backend `join_lobby`/`update_settings` solo guards remain as defense.
- **Mobile-Safari rendering**: don't use CSS `filter: blur()` on SVG children or inside `contain: paint` — WebKit drops it. Use SVG `feGaussianBlur` / radial-gradient glows (see `TimelinePath.jsx`, `SpaceBackground.jsx`). Verify with Playwright webkit.
- **Unused packages**: `@radix-ui/react-slider`, `@radix-ui/react-switch`, `lucide-react`

---

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — socket events, API routes, full component breakdown
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Netlify + Render setup, env vars
- [song-database-guide.md](song-database-guide.md) — curated song DB workflow
- [beatably-design-system.md](beatably-design-system.md) — UI/UX conventions
