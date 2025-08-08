# Feature Integration Plan: Popularity-Based Difficulty + Reliable Year Metadata

This plan outlines incremental steps to:
1) Improve year accuracy (avoid remastered-year issues) by enriching Spotify data with MusicBrainz and Billboard.
2) Make the game more accessible with a settings checkbox for "Chart Hits" and a difficulty selector (Easy/Normal/Hard) defined by popularity thresholds.

We will implement in small, testable increments.

---

## Goals

- Year accuracy: Prefer the original release year over remaster/reissue years.
- Accessibility: Allow a simpler, more mainstream playlist using chart hits.
- Difficulty: Control difficulty by popularity thresholds (easy = most popular only).
- Maintain genre support as today for non-chart mode; for chart mode, consider genre fallback/heuristics.

---

## Settings Additions (Frontend)

- Chart Hits Mode: simple checkbox in settings.
- Difficulty: Easy, Normal, Hard (radio or dropdown).
- Popularity thresholds stored centrally (config), tweakable without code churn.

Proposed default thresholds (tunable):
- Easy: Spotify popularity ≥ 75 (or in chart mode, Billboard rank top 20) 
- Normal: Spotify popularity ≥ 50 (or chart rank top 50)
- Hard: No popularity floor (or chart rank top 100, but also allow non-chart items when not in chart mode)

Notes:
- Spotify&#39;s popularity score (0-100) can be used when not using Billboard.
- For Billboard mode, use rank bounds or a derived score.

---

## Data Sources Overview

### 1) Spotify (existing)
- Pros: We already use it; has popularity; fast.
- Cons: Year may reflect remaster or compilation; title may include "Remastered".

### 2) MusicBrainz (free)
- Purpose: Resolve original release year; disambiguate remasters.
- API: MusicBrainz Web Service (WS2) is free, no auth required, rate limited (usually 1 req/sec without token; 5 req/sec with token and proper headers).
- Strategy: Given artist + track (and optionally duration/album), search recordings or releases to find the earliest original release date.

Useful endpoints (examples):
- GET /ws/2/recording?query=artist:"Artist Name"%20AND%20recording:"Track Name"&fmt=json
- GET /ws/2/release?query=artist:"Artist Name"%20AND%20release:"Album/Single"&fmt=json
- Disambiguation with ISRC (if available from Spotify), and by recording length within a tolerance.

Caching:
- Strongly recommended. Cache by (normalized artist, title) → earliest original year.

### 3) Billboard (legality and access)
- Official Billboard API access is restricted/commercial. Free, official API is not publicly offered.
- Options:
  - Use third-party datasets or mirrors (must verify license before inclusion).
  - Use open-source community scrapers or libraries (risk of ToS changes or scraping policy issues; avoid committing scraped data if license unclear).
  - Use public domain or permissive datasets that approximate "chart hits" (e.g., Wikipedia "Billboard Hot 100 number-one singles" pages, but verify licensing and attribution requirements).
- Recommendation:
  - Phase 1: Billboard mode prototype using a small, vetted sample dataset that we can legally include (e.g., a curated JSON list of top hits per decade with source attribution).
  - Phase 2: If we want breadth, explore a legally compatible provider or obtain permission.
  - Keep the integration behind a feature flag so we can swap the source later.

---

## Year Accuracy Strategy

1) Title-based filter on initial Spotify fetch:
   - Exclude titles containing common remaster markers, case-insensitive:
     - "remaster", "remastered", "reissue", "deluxe", "anniversary", "mono", "stereo version", "expanded", "202? remaster", "200? remaster", "digitally remastered".
   - Also scan album name for the same markers.
   - If a track is filtered solely by markers but we want the original, try to find an alternate Spotify version of the same recording (same artist and near-identical title without bracketed suffixes), or fall back to MusicBrainz lookup.

2) MusicBrainz enrichment on "suspicious" tracks:
   - Suspicious heuristics:
     - Title/album contains remaster markers
     - The release date is far newer than the artist&#39;s known active era
     - The track name includes a bracketed year suffix (e.g., "Song Title - 2015 Remaster")
   - Workflow:
     - Query MusicBrainz recordings/releases by artist + track (and optionally ISRC, duration).
     - Compute earliest original release year across linked releases.
     - If earliest year differs from Spotify year by threshold (e.g., >= 2 years or includes a 2000s remaster for a 1970s track), substitute earliest year.
   - Cache results to reduce API load.

3) Edge cases:
   - Live versions: Keep or exclude based on a setting in the future; for now, exclude if "live" in title unless explicitly allowed.
   - Alternate mixes/edits: If easy mode, prefer canonical single edit if available.
   - Compilations: If Spotify album is a compilation, prioritize MusicBrainz original single/album year.

---

## Billboard/Chart Hits Strategy

- Chart Hits Mode (checkbox):
  - If enabled, playlist building favors highly popular, widely recognized singles.
  - Data input:
    - Phase 1: Local, curated JSON for a limited decade range (e.g., 80s–00s). Each item: { artist, title, year, source, rank (optional), notes }.
    - Phase 2: Swap or augment with a legally compatible broader dataset or service.
  - Flow:
    - Use chart dataset as the authoritative list of tracks.
    - Resolve each to Spotify URI via search (artist + title, optional year).
    - Use MusicBrainz only when needed to confirm year or disambiguate conflicting versions.

- Genre interaction:
  - Non-chart mode: keep current genre selection.
  - Chart mode: genre selection may be limited. Options:
    - Ignore genre filter (documented in UI).
    - Or infer genre via Spotify audio features/artist genres when available, and filter softly.

---

## Difficulty via Popularity Thresholds

- Difficulty is set by popularity thresholds, not mechanics:
  - Easy: Strictly high popularity (or top ranks in chart mode).
  - Normal: Mid-to-high popularity.
  - Hard: Include everything (or low popularity included), still filtered for quality.
- Central config example (tweak without changing code broadly):
  - thresholds = {
      nonChart: { easy: 75, normal: 50, hard: 0 }, // Spotify popularity
      chart: { easy: 20, normal: 50, hard: 100 } // maximum rank limit; easy uses top 20, normal top 50, hard top 100
    }
- Make thresholds stored in a config file and allow environment overrides for playtesting.

---

## Implementation Roadmap (Small Increments)

Phase 0: Planning and scaffolding
- Add config placeholders for:
  - Chart Hits mode flag
  - Difficulty level and thresholds
  - Feature flag for Billboard/Chart dataset usage
  - MusicBrainz enable flag + rate limit and cache options
- Create types/interfaces for track metadata across sources.

Phase 1: Remaster filtering (Spotify only)
- Implement title/album marker filters.
- Add "live" exclusion by default.
- Add metric/telemetry to count how many tracks are excluded and fallback behavior.

Phase 2: MusicBrainz integration (minimal)
- Implement lookup module:
  - Given artist, title, duration, optional ISRC → earliest original year.
- Caching layer (in-memory + optional persistent cache).
- Replace suspicious Spotify year with MusicBrainz original year.
- Feature flag to enable/disable.

Phase 3: Popularity-based difficulty (non-chart mode)
- Add settings UI:
  - Checkbox: Chart Hits
  - Difficulty: Easy/Normal/Hard
- Use Spotify popularity to filter by difficulty thresholds.

Phase 4: Chart Hits mode (local curated dataset)
- Add a small, vetted, legally includable dataset (JSON) for a few decades to start.
- Resolve entries to Spotify URIs.
- Use difficulty to subset by rank/popularity field in the dataset.
- Document in UI that genre filters may be limited in Chart mode.

Phase 5: Refinements
- Better matching and dedup strategies when multiple Spotify versions exist.
- Add tests for title normalization and MusicBrainz reconciliation.
- Add admin/test UI for threshold tuning and result inspection.

---

## Technical Details and Notes

- Normalization:
  - Lowercase, strip punctuation, remove bracketed suffixes like "- 2014 Remaster", "(Remastered)" for matching.
  - Trim "feat." sections when searching cross-source, but keep for final display.
- Matching order of preference:
  1. Exact match on artist + title (normalized) with year proximity.
  2. Duration tolerance window (±3 seconds).
  3. ISRC if obtainable.
- MusicBrainz rate limiting:
  - Follow etiquette: set User-Agent with app name/version/contact.
  - Respect 1 rps without token; consider using a small queue and caching to batch lookups.
- Data storage:
  - Cache file path suggestion: backend/cache/musicbrainz-recordings.json (gitignored).
  - Curated chart dataset path: data/chart-hits-sample.json (committed if license permits).
- Telemetry/Debug:
  - Expose a debug panel (already have SongDebugPanel.jsx) to show:
    - Original Spotify year vs adjusted year
    - Applied filters (e.g., "remaster excluded")
    - Data source decisions (Spotify-only vs MusicBrainz vs Chart dataset)

---

## Research Checklist

MusicBrainz:
- API docs: https://musicbrainz.org/doc/Development/XML_Web_Service/Version_2
- Test queries for a few problematic tracks and capture earliest year.
- Decide fields to store in cache: recording MBID, earliest year, confidence score.

Billboard:
- Confirm no official free API for broad usage.
- Identify legally usable datasets:
  - Option A: Curate a small, hand-compiled list with citations.
  - Option B: Use community lists with compatible licenses (verify).
- Start with a minimal dataset to validate flow.

Licensing:
- Do not commit scraped Billboard data without a clear license.
- Attribute sources appropriately in README if needed.

---

## Deliverables

- Settings UI changes (checkbox + difficulty selector).
- Configurable popularity thresholds per mode.
- Remaster filter + MusicBrainz reconciliation.
- Optional chart-hits dataset with safe licensing.
- Caching and debug outputs for verification.

---

## Open Questions (to revisit later)

- How strictly do we want to enforce genre in Chart mode?
- Should we let users opt-in to include live/alternate versions?
- Do we want to display the data source badge (Spotify-only, MB-enriched, Chart) on cards?
