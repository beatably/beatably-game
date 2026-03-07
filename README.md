# Beatably

A multiplayer music timeline game. Players take turns placing songs in chronological order on a shared timeline. Real-time Spotify integration for music playback.

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

**Requirements:** Node 18+, Spotify Developer credentials

```bash
# Backend (port 3001)
cd backend && npm install && npm start

# Frontend (port 5173, separate terminal)
cd frontend && npm install && npm run dev
```

Create `backend/.env`:
```env
NODE_ENV=development
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
FRONTEND_URI=http://127.0.0.1:5173
ADMIN_PASSWORD=anything
```

Add `http://127.0.0.1:5173/callback` as a Redirect URI in your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).

Visit `http://127.0.0.1:5173`

---

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS, react-dnd, socket.io-client
- **Backend:** Node.js, Express 5, Socket.io 4
- **Music:** Spotify Web Playback SDK + Web API
- **Hosting:** Netlify (frontend) + Render (backend)

---

## Docs

- [Architecture](docs/architecture.md) — how the system works, socket events, components
- [Deployment](docs/deployment.md) — hosting setup, environment variables
- [Song Database Guide](song-database-guide.md) — managing the curated song database
- [Design System](beatably-design-system.md) — UI/UX conventions
- [Feature Plan](feature-plan.md) — upcoming features
