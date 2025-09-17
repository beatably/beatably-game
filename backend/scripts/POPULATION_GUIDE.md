# Beatably Database Population Guide

This document explains the one-time population job, how it works, how to run it, resume it, and how to validate results without relying on long interactive commands from chat.

## What the script does

Script: `backend/scripts/populate-initial-database.js`

Phases:
1) Billboard Historical Import (comprehensive)
   - Pulls and normalizes Billboard Hot 100 historical entries (1960–2024 by default)
   - Dedupes and applies a difficulty ceiling (up to rank 100 by default)
   - Resolves each entry to a Spotify track via the API
   - Stores title, artist, year, spotifyUri, popularity, albumArt, previewUrl, chartInfo (rank/peak/weeks/date), etc.

2) Genre Supplementation
   - Performs systematic Spotify searches by decades and genres (pop, rock, hip-hop, electronic, indie by default)
   - Fills in gaps Billboard may underrepresent
   - Dedupes and calculates difficulty from popularity

Writes to: `backend/cache/curated-songs.json` (file-backed DB used by the game)

Backups: A timestamped backup is saved to `backend/cache/backups/` before any write.

Remaster/live filtering: Enabled by default, favoring original versions.

MusicBrainz enrichment: Optionally adjusts years for suspicious cases (controlled by feature flags in `backend/config.js`).

## Important environment variables

Set in `backend/.env`:
- `SPOTIFY_CLIENT_ID` (required)
- `SPOTIFY_CLIENT_SECRET` (required)
- `SPOTIFY_MIN_GAP_MS` (optional, default 650; lower values risk 429 throttling)

Feature flags in `backend/config.js`:
- `featureFlags.enableRemasterFilter` (default true)
- `featureFlags.enableMusicBrainz` (default true)

## Typical one-time run (example; do not paste here if a long job is already running)

```
cd backend
node scripts/populate-initial-database.js \
  --billboard --search \
  --billboardLimit=5000 \
  --searchLimit=2000 \
  --yearMin=1960 --yearMax=2024 \
  --markets=US \
  --difficulty=hard
```

Notes:
- The job is long-running due to Spotify rate limits and retry/backoff (can be 60–120+ minutes).
- The script is idempotent with basic dedupe by spotifyUri: safe to re-run with the same options.

## Running in smaller batches

You can split work into smaller chunks, e.g., by lowering caps or running separate waves:

- Billboard-only first:
  ```
  node scripts/populate-initial-database.js --billboard --billboardLimit=3000 --yearMin=1960 --yearMax=2024 --markets=US
  ```

- Genre supplement later:
  ```
  node scripts/populate-initial-database.js --search --searchLimit=1500 --yearMin=1960 --yearMax=2024 --markets=US --genres=pop,rock,hip-hop,electronic,indie
  ```

- Adjust years or genres as needed.

## Resuming or re-running

- If the job is interrupted, simply re-run with the same flags.
- The script dedupes by Spotify URI at write time, so duplicates won’t stack up.
- A backup of the DB is taken before each non-dry run to `backend/cache/backups/`.

## Dry run (preview only, no writes)

```
node scripts/populate-initial-database.js --billboard --search --billboardLimit=50 --searchLimit=50 --dryRun
```

This exercises the flow and prints a summary without saving any items.

## Expected outputs and progress

Console log messages include:
- Chart fetching diagnostics
- `[Billboard] Processed: ... Saved: ... Updated: ... Skipped: ... Collected: ...`
- `[Supplement] Processed: ... Saved: ... Updated: ... Skipped: ... Collected: ...`
- Final JSON report summarizing counts and final DB size

## Validation (minimal, light interactions)

After a run completes, you can quickly validate:

- Inspect the curated DB file: `backend/cache/curated-songs.json`
- Spot-check album art and previewUrl fields on some entries
- Optional (if backend is running with ADMIN_PASSWORD set):
  - `GET /api/admin/curated-songs?limit=20` with header `x-admin-secret: <ADMIN_PASSWORD>`
  - This should return items with titles, artists, years, and albumArt when available

Gameplay integration:
- The game uses `/api/curated/select` to build decks from the curated DB.
- Once the curated DB has sufficient volume (thousands), the game should consistently find enough songs.

## Tuning considerations

- Rate limits: `SPOTIFY_MIN_GAP_MS` default (650ms) is conservative. Lowering may speed up but increases the risk of HTTP 429 responses (the script retries/backoffs automatically).
- Caps:
  - `--billboardLimit`: how many Billboard-resolved tracks to save
  - `--searchLimit`: how many genre supplement tracks to save
- Years/Markets/Genres: adjust `--yearMin/--yearMax`, `--markets`, and `--genres` to emphasize particular decades or categories.

## Rollback

- If needed, restore from a backup in `backend/cache/backups/` by copying a file back to `backend/cache/curated-songs.json`.
- Always keep a backup before large re-runs (the script does this automatically when not in `--dryRun` mode).

## Examples (don’t run if a big job is already in progress)

- Billboard-focused only:
  ```
  node scripts/populate-initial-database.js --billboard --billboardLimit=5000 --yearMin=1960 --yearMax=2024 --markets=US
  ```

- Genre-focused only (pop/rock/hip-hop/electronic/indie):
  ```
  node scripts/populate-initial-database.js --search --searchLimit=2000 --yearMin=1960 --yearMax=2024 --markets=US --genres=pop,rock,hip-hop,electronic,indie
  ```

- Lower throttle (advanced; risk of 429):
  ```
  SPOTIFY_MIN_GAP_MS=450 node scripts/populate-initial-database.js --billboard --billboardLimit=3000
  ```

## FAQ

- Q: Can I stop the job?
  - A: Yes. Re-run later with the same args; dedupe will avoid duplicates.

- Q: Should we store album art URLs?
  - A: Yes. The added size is small and it materially improves admin UX and gameplay.

- Q: What if some albums have remastered/live versions?
  - A: Remaster/live filtering is enabled by default; MusicBrainz enrichment can adjust suspicious years.

- Q: How many Billboard songs are there?
  - A: Normalized and deduped to ~30k unique entries across 1960–2024 from the public mirror. We cap the import for practicality.

## Current status

- The long-running one-time population job can be left running in the background.
- Avoid launching new long jobs concurrently. Run again only after the current job finishes or if you need to resume after interruption.
