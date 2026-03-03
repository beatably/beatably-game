# Market Classification Solution

## Problem Summary

Songs in the database were incorrectly tagged with markets based on where they were **available for streaming** rather than where they had **commercial success**. For example, Ebba Grön (a local Swedish punk band) was tagged with both "SE" and "US" markets simply because:

1. The song was imported via Spotify search with `market="US"` parameter
2. The script assumed "available in US" = "had success in US"
3. Later, origin reclassification added "SE" but preserved the incorrect "US" tag

**Result**: Local Swedish songs appeared to have international success when they didn't.

## Root Cause

In `populate-initial-database.js`:
```javascript
// WRONG: Uses search market parameter as geography
geography: market  // Just because we searched with market="US"
```

The Spotify API `market` parameter controls which tracks are **available to stream**, not which markets the song was **successful in**.

## Solution

### New Data Structure

**Simplified from:**
- `geography` (origin)
- `markets` array (confusing mix of origin + availability + success)

**To:**
- `geography` (origin) - Artist's home country
- `isInternational` (boolean) - True if song had international recognition

### Classification Rules

```javascript
isInternational = true IF:
  1. isBillboardChart === true (proven US success), OR
  2. Artist in curated international artists list, OR
  3. Track charted in 3+ countries (future enhancement)

Otherwise:
  isInternational = false (local success only)
```

### Gameplay Mapping

Three game modes now supported:

1. **"SE only" mode**: `WHERE geography = "SE"`
   - Local Swedish + International Swedish songs

2. **"International + SE" mode**: `WHERE isInternational = true OR geography = "SE"`
   - All international hits + all Swedish songs

3. **"International only" mode**: `WHERE isInternational = true`
   - Only internationally recognized songs

## Migration Results

**Processed**: 3,692 songs
- **International songs**: 1,616 (43.8%)
  - Billboard chart: 1,580
  - Curated artist list: 36
- **Local-only songs**: 2,076 (56.2%)

**Data Fixes**:
- Origin corrections: 5 (removed incorrect SE tags)
- Markets arrays removed: 3,692 (eliminated confusion)

## International Swedish Artists (17)

1. Roxette (Billboard)
2. Ace of Base (Billboard)
3. Neneh Cherry (Billboard)
4. Avicii
5. Swedish House Mafia
6. ABBA
7. Dr. Alban
8. Rednex
9. A Touch Of Class
10. Alesso
11. Peter Bjorn and John
12. Robyn
13. The Cardigans
14. Europe
15. The Hives
16. José González
17. Sabaton

## Test Case Verification

**Ebba Grön - "Ung & kåt"**

**Before:**
- geography: "US" (WRONG - from search parameter)
- markets: ["US", "SE"] (confusing)
- Appeared in US market games incorrectly

**After:**
- geography: "SE" (correct origin)
- isInternational: false (correct - local only)
- markets: undefined (removed)
- Only appears in Swedish-focused games

## Scripts Created

1. **`analyze-swedish-artists.js`**
   - Analyzes Swedish artists in database
   - Shows Billboard presence, popularity, song count
   - Helps curate international artists list

2. **`add-international-flag.js`**
   - Adds `isInternational` boolean field
   - Fixes incorrect origin tags
   - Removes confusing `markets` arrays
   - Creates backup before migration

## Next Steps

1. ✓ Migration complete and verified
2. Update backend filtering to use `isInternational`
3. Update frontend game settings UI for 3 modes
4. (Future) Add MusicBrainz chart data for 3+ country rule
5. (Future) Expand to more local markets (NO, DK, FI)

## Key Insight

**"Available for streaming in US" ≠ "Had commercial success in US"**

Spotify makes most tracks available globally, but that doesn't mean they were successful everywhere. We need actual chart data or curated lists to determine true international success.
