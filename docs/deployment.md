# Beatably — Deployment

## Infrastructure

| Service | Provider | URL |
|---|---|---|
| Frontend | Netlify | https://beatably.app (primary), https://www.beatably.app |
| Backend | Render | https://beatably-backend.onrender.com |
| Code | GitHub | (your repo) |

---

## Local Development

**Requirements:** Node 18+, a Spotify Developer app

```bash
# Backend
cd backend && npm install && npm start     # runs on :3001

# Frontend (separate terminal)
cd frontend && npm install && npm run dev  # runs on :5173
```

Create `backend/.env`:
```env
NODE_ENV=development
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
ADMIN_PASSWORD=anything
```

In your Spotify Developer Dashboard, add `http://127.0.0.1:5173/callback` as a Redirect URI.

---

## Spotify Developer App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create or edit your app
3. Add Redirect URIs:
   - `http://127.0.0.1:5173/callback` (local dev)
   - `https://beatably-backend.onrender.com/callback` (production)
4. Note your Client ID and Client Secret

---

## Deploying to Production

### Backend (Render)

**Build Command:** `cd backend && npm install`
**Start Command:** `cd backend && npm start`

**Required environment variables on Render:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SPOTIFY_CLIENT_ID` | From Spotify dashboard |
| `SPOTIFY_CLIENT_SECRET` | From Spotify dashboard |
| `SPOTIFY_REDIRECT_URI` | `https://beatably-backend.onrender.com/callback` |
| `FRONTEND_URI` | `https://beatably.app` |
| `ADMIN_PASSWORD` | Your chosen admin password |

**Persistent Disk (important):** Render should have a persistent disk mounted at `/var/data`. The backend uses `/var/data/cache/` to store the song database and game state across deploys. Without it, the database resets on every deploy.

### Frontend (Netlify)

Build is configured in `netlify.toml`. Netlify reads this automatically — no manual build settings needed.

Netlify has no required environment variables for the frontend. The backend URL is hardcoded in [`frontend/src/config.js`](../frontend/src/config.js).

**CORS:** The backend already allows:
- `https://beatably.app`
- `https://www.beatably.app`
- `https://beatably-frontend.netlify.app`
- Whatever `FRONTEND_URI` is set to

If you change the Netlify domain, update `FRONTEND_URI` in Render's environment variables.

---

## Admin Panel

Available at `/admin` on the deployed frontend (routes to `public/admin.html` via Netlify redirect).

All admin API calls require an `x-admin-secret` header matching the `ADMIN_PASSWORD` env var.

---

## After Deploying

To verify the deployment is healthy:

```bash
# Backend responding
curl https://beatably-backend.onrender.com/

# Feature flags
curl https://beatably-backend.onrender.com/api/feature-flags

# CORS check
curl -H "Origin: https://beatably.app" \
     -X OPTIONS \
     https://beatably-backend.onrender.com/api/feature-flags -v
```

---

## Song Database

The song database lives at `/var/data/cache/curated-songs.json` in production.

On each deploy, the backend compares the bundled `backend/cache/curated-songs.json` against the persistent disk version. If the disk version is meaningfully newer, it keeps the disk version. If the bundled version has significantly more songs, it migrates.

To manage songs, use the admin API or the admin panel at `/admin`.

---

## Genre Re-enrichment

Songs store a primary `genre` and optional `genreSecondary` derived from vote-weighted MusicBrainz tag analysis. If you need to re-run genre detection across the entire database (e.g. after updating the genre mapping rules):

**1. Deploy the updated code first** (git push → Render auto-deploys)

**2. Trigger re-enrichment on production** (auto-backs up the DB before starting):
```bash
curl -X POST https://beatably-backend.onrender.com/api/admin/enrich-batch \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PASSWORD" \
  -d '{"fields": ["genre"], "force": true}'
```

Returns: `{ ok, total, backupFile }` — runs async in background at ~1 req/sec (MusicBrainz rate limit).

**3. Monitor progress:**
```bash
curl https://beatably-backend.onrender.com/api/admin/import/progress \
  -H "x-admin-secret: $ADMIN_PASSWORD"
```

Returns: `{ active, done, total }` — `active` becomes `null` when finished.

**4. Roll back if needed:**
```bash
# List available backups
curl https://beatably-backend.onrender.com/api/admin/backups \
  -H "x-admin-secret: $ADMIN_PASSWORD"

# Restore a specific backup
curl -X POST https://beatably-backend.onrender.com/api/admin/restore-backup \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PASSWORD" \
  -d '{"filename": "curated-songs.backup-2026-03-05T22-13-04.186Z.json"}'
```
