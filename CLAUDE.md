# Beatably — Claude Code Guide

Beatably is a multiplayer music timeline game. Players place songs in chronological order; first to reach the target count wins. React SPA frontend (Netlify) + Node.js/Socket.io backend (Render). Live at https://beatably.app.

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
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
FRONTEND_URI=http://127.0.0.1:5173
ADMIN_PASSWORD=anything
```

Use `127.0.0.1` not `localhost` — Spotify OAuth requires the exact registered URI.

---

## Key Files

| File | Role |
|---|---|
| `frontend/src/App.jsx` | Master orchestrator (~2,800 lines): all socket events, auth flow, view routing, game logic handlers |
| `frontend/src/GameFooter.jsx` | Playback controls, song info, credits, challenge UI (~1,730 lines) |
| `frontend/src/CurvedTimeline.jsx` | Timeline visualization, tap-based card placement (~1,200 lines) |
| `backend/index.js` | All HTTP routes + Socket.io game logic (~5,300 lines) |
| `backend/curatedDb.js` | File-backed song database (reads/writes `cache/curated-songs.json`) |
| `backend/config.js` | Feature flags: `CHART_MODE_ENABLE`, `MUSICBRAINZ_ENABLE`, `REMASTER_FILTER_ENABLE` |
| `frontend/src/config.js` | API URL: dev → `:3001`, prod → `beatably-backend.onrender.com` |
| `frontend/src/contexts/PreviewModeContext.jsx` | Preview playback context (30s Apple Music clips — the only audio mode) |

---

## Architecture Highlights

- **Real-time**: Socket.io WebSockets; game state persisted to `cache/state.json` every 250ms
- **Production disk**: Render persistent disk mounts at `/var/data/cache/` (not `cache/`)
- **Game phases**: `setup → player-turn → song-guess → challenge-window → challenge → challenge-resolved → reveal → game-over`
- **Audio**: 30s Apple Music preview clips only (Full Play/Spotify Premium removed July 2026); Spotify is admin-side sourcing only
- **Song DB genres**: includes `'soundtrack'` (TV/movie themes) — gameplay integration not yet wired up

---

## Gotchas

- **CurvedTimeline is tap-based**, not drag-and-drop — despite `react-dnd` being in the dependencies
- **Dead code**: `frontend/src/lib/spotify/PlayerSync.ts` — gated behind `VITE_SPOTIFY_SYNC_V2=true` which is never set; ignore it
- **Unused packages**: `@radix-ui/react-slider`, `@radix-ui/react-switch`, `lucide-react`

---

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — socket events, API routes, full component breakdown
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Netlify + Render setup, env vars
- [song-database-guide.md](song-database-guide.md) — curated song DB workflow
- [beatably-design-system.md](beatably-design-system.md) — UI/UX conventions
