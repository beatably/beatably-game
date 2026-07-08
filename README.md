# Beatably

A multiplayer music timeline game. Players take turns placing songs in chronological order on a shared timeline. Songs play as 30-second **Apple Music** previews; a native **iOS app** is on the App Store.

**Live:** https://beatably.app

---

## How to Play

1. **Create a room** — one player creates a lobby and shares the room code
2. **Join** — other players join with the code (no account required)
3. **Listen** — a song plays; tap your timeline to place it in the correct chronological position
4. **Guess** — after placing, guess the artist/title to earn a credit; spend credits to skip hard songs
5. **Challenge** — spend a credit to challenge another player's placement and steal their song if you're right
6. **Win** — first to reach the target number of correctly placed songs wins (8, 10, or 12)

**Settings:** Choose Easy (chart hits) or Advanced (full catalogue + genre filters). Pick International, Swedish-only, or a mix. Set the decade range.

---

## Local Development

**Requirements:** Node 18+, Spotify Developer credentials (admin-side song sourcing), Apple Music (MusicKit) key (consumer previews/art)

```bash
# Backend (port 3001)
cd backend && npm install && npm start

# Frontend (port 5173, separate terminal)
cd frontend && npm install && npm run dev
```

Create `backend/.env`:
```env
NODE_ENV=development
SPOTIFY_CLIENT_ID=your_id            # admin song search only — no user OAuth
SPOTIFY_CLIENT_SECRET=your_secret
FRONTEND_URI=http://127.0.0.1:5173
ADMIN_PASSWORD=anything
APPLE_MUSIC_TEAM_ID=your_team_id
APPLE_MUSIC_KEY_ID=your_musickit_key_id
APPLE_MUSIC_PRIVATE_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
```

Visit `http://127.0.0.1:5173`

---

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS, react-dnd, socket.io-client
- **Backend:** Node.js, Express 5, Socket.io 4
- **Music:** Apple Music (MusicKit) 30s previews + art for players; Spotify Web API for admin-side song sourcing only (Full Play / Spotify user playback removed July 2026)
- **iOS:** Swift/SwiftUI native app (`ios/`, xcodegen), on the App Store
- **Hosting:** Netlify (frontend) + Render (backend)

---

## Docs

- [Architecture](docs/architecture.md) — how the system works, socket events, components
- [Codex App Setup Guide](codex-app-setup-guide.md) — how Codex App, Computer Use, and multiplayer testing work in this repo
- [.codex/README.md](.codex/README.md) — shared Codex app local-environment action scripts for this repo
- [Deployment](docs/deployment.md) — hosting setup, environment variables
- [Codex Multiplayer Testing](docs/codex-multiplayer-testing.md) — using Codex App on macOS with browser sessions or dual iOS simulators
- [Song Database Guide](song-database-guide.md) — managing the curated song database
- [Design System](beatably-design-system.md) — UI/UX conventions
- [Feature Plan](feature-plan.md) — upcoming features
