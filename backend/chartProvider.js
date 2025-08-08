/**
 * Chart Provider:
 * - Fetches Billboard Hot 100 JSON from remote GitHub (default)
 * - Provides local curated fallback sample for offline/dev use
 * - Filters by difficulty using rank ceilings (easy<=20, normal<=50, hard<=100)
 * - Resolves unique track entries: { title, artist, year, rank, source }
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config } = require('./config');

// IMPORTANT: The upstream JSON uses { date, data } with entries under "data".
// Each entry has keys: song, artist, this_week, last_week, peak_position, weeks_on_chart.
// Our parser reads data (not songs/chart/entries) but keeps fallbacks for other mirrors.

// DEBUG helper
function dbg(...args) {
  console.log('[ChartProvider]', ...args);
}

/*
Known shapes (based on community mirrors):
- recent.json:
  {
    "date":"YYYY-MM-DD",
    "songs":[
      { "rank":1, "song":"Title", "artist":"Artist", "last_week":2, "peak_pos":1, "weeks_on_chart":10 }
    ]
  }
  or it may use "entries" or "chart" as the array key.

- date/YYYY-MM-DD.json: same shape as recent.json (often "songs" or "entries" or "chart").

- all.json:
  [
    { "date":"YYYY-MM-DD", "songs":[ ... ] }, // often "songs"
    { "date":"YYYY-MM-DD", "chart":[ ... ] }, // sometimes "chart"
    { "date":"YYYY-MM-DD", "entries":[ ... ] }
  ]
We normalize across: songs | chart | entries
*/
/**
 Expected remote formats observed:
 - recent.json: { "date": "YYYY-MM-DD", "entries": [ { rank, title, artist, ... } ] }  // some mirrors
                  or { "date": "YYYY-MM-DD", "chart": [ { ... } ] }                    // original
 - date/YYYY-MM-DD.json: { "date": "YYYY-MM-DD", "chart": [ ... ] }
 - all.json: [ { "date": "YYYY-MM-DD", "chart": [ ... ] }, ... ]
 We'll normalize both "entries" and "chart".
 */

async function fetchRemoteJson(url, timeoutMs = config.chart.timeoutMs) {
  try {
    const res = await axios.get(url, { timeout: timeoutMs, headers: { 'Accept': 'application/json' } });
    const bytes = (JSON.stringify(res.data)?.length || 0);
    dbg('Fetched remote', url, 'status', res.status, 'bytes ~', bytes);
    // Log top-level keys to help diagnose unexpected shapes
    try {
      const keys = res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? Object.keys(res.data) : (Array.isArray(res.data) ? ['[array]', `len=${res.data.length}`] : []);
      dbg('Top-level keys:', keys);
    } catch {}
    return res.data;
  } catch (e) {
    console.warn('[ChartProvider] Remote fetch failed:', url, e.message);
    return null;
  }
}

function loadLocalSample() {
  try {
    // Use the configured absolute/relative path as-is
    const p = config.chart.localSamplePath;
    dbg('Attempting to load local sample from', p);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const data = JSON.parse(raw);
      dbg('Loaded local sample items:', Array.isArray(data) ? data.length : 0);
      // Normalize to our internal format if the file is a simple array of {artist,title,year,rank}
      if (Array.isArray(data) && data.length && data[0].artist && data[0].title) {
        return data.map((row) => ({
          title: row.title,
          artist: row.artist,
          year: Number.isFinite(row.year) ? row.year : null,
          rank: Number.isFinite(row.rank) ? row.rank : null,
          source: 'billboard',
          chartDate: row.chartDate || null,
          peakPos: row.peakPos ?? row.rank ?? null,
          weeksOnChart: row.weeksOnChart ?? null,
          lastWeek: row.lastWeek ?? null,
        }));
      }
      return data;
    }
    console.warn('[ChartProvider] Local sample not found at', p);
  } catch (e) {
    console.warn('[ChartProvider] Failed to load local sample:', e.message);
  }
  return [];
}

/**
 * Normalize a chart entry to our internal track format.
 * Upstream keys (confirmed via diagnostics): song, artist, this_week, last_week, peak_position, weeks_on_chart
 */
function normalizeEntry(entry, chartDate) {
  const coerceNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const title =
    entry.title /* alt mirrors */ ??
    entry.song /* confirmed */ ??
    entry.name ??
    '';

  let artist =
    entry.artist /* confirmed (string) */ ??
    entry.artist_name ??
    entry.artists ??
    '';
  if (artist && typeof artist === 'object') {
    artist = artist.name || artist.title || '';
  }

  // Prefer current rank as this_week, then rank/position
  const rank =
    coerceNum(entry.this_week) /* confirmed */ ??
    coerceNum(entry.rank) ??
    coerceNum(entry.position) ??
    coerceNum(entry.current_rank);

  const peakPos =
    coerceNum(entry.peak_position) /* confirmed */ ??
    coerceNum(entry.peak_pos) ??
    coerceNum(entry.peak);

  const weeksOnChart =
    coerceNum(entry.weeks_on_chart) /* confirmed */ ??
    coerceNum(entry.weeks);

  const lastWeek =
    coerceNum(entry.last_week) /* confirmed */ ??
    coerceNum(entry.prev_rank);

  const year = chartDate ? Number(String(chartDate).slice(0, 4)) : null;

  return {
    title,
    artist,
    year: Number.isFinite(year) ? year : null,
    rank,
    peakPos,
    weeksOnChart,
    lastWeek,
    source: 'billboard',
    chartDate: chartDate || null,
  };
}

/**
 * Deduplicate entries by normalized artist+title, prefer best rank (lowest).
 */
function dedupeByBestRank(entries) {
  const norm = (s) => String(s || '').toLowerCase().trim()
    .replace(/\([^)]*\)/g, '')
    .replace(/\s*[-–—]\s*.*$/, '')
    .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const map = new Map();
  for (const e of entries) {
    const key = `${norm(e.artist)}|${norm(e.title)}`;
    const prev = map.get(key);
    // Prefer better peak position; tie-breaker by current rank
    const ePeak = Number.isFinite(e.peakPos) ? e.peakPos : 9999;
    const pPeak = Number.isFinite(prev?.peakPos) ? prev.peakPos : 9999;
    const eRank = Number.isFinite(e.rank) ? e.rank : 9999;
    const pRank = Number.isFinite(prev?.rank) ? prev.rank : 9999;
    if (!prev || ePeak < pPeak || (ePeak === pPeak && eRank < pRank)) {
      map.set(key, e);
    }
  }
  return Array.from(map.values());
}

/**
 * Apply difficulty rank ceilings.
 */
function filterByDifficulty(entries, difficulty) {
  const limits = config.thresholds.chart;
  let maxRank = limits.normal;
  if (difficulty === 'easy') maxRank = limits.easy;
  else if (difficulty === 'hard') maxRank = limits.hard;

  // Use peakPos when available, otherwise fall back to current rank
  return entries.filter((e) => {
    const metric = Number.isFinite(e.peakPos) ? e.peakPos : e.rank;
    return Number.isFinite(metric) && metric <= maxRank;
  });
}

/**
 * Fetch recent chart by default, with optional full archive support.
 * mode: 'recent' | 'all' | 'date'
 * date: 'YYYY-MM-DD' (required for mode 'date')
 */
async function getChartEntries({ mode = 'recent', date, difficulty = 'normal', yearMin, yearMax } = {}) {
  let entries = [];

  function getArray(obj) {
    if (!obj) return [];
    // Confirmed upstream structure: { date, data } and in all.json: [ { date, data }, ... ]
    if (Array.isArray(obj.data)) return obj.data; // primary
    if (Array.isArray(obj.songs)) return obj.songs;
    if (Array.isArray(obj.chart)) return obj.chart;
    if (Array.isArray(obj.entries)) return obj.entries;
    // Sometimes wrapped differently
    if (obj.data) {
      if (Array.isArray(obj.data.songs)) return obj.data.songs;
      if (Array.isArray(obj.data.chart)) return obj.data.chart;
      if (Array.isArray(obj.data.entries)) return obj.data.entries;
    }
    return [];
  }

  async function fetchAllAndNormalize() {
    const all = await fetchRemoteJson(config.chart.remoteAllUrl);
    const out = [];
    if (Array.isArray(all)) {
      for (const day of all) {
        const arr = getArray(day);
        if (day && Array.isArray(arr)) {
          for (const row of arr) {
            out.push(normalizeEntry(row, day.date));
          }
        }
      }
    }
    dbg('Normalized ALL entries:', out.length);
    return out;
  }

  dbg('getChartEntries args:', { mode, difficulty, yearMin, yearMax });

  // If year range is specified, skip recent and go straight to all.json with filtering
  if (Number.isFinite(yearMin) && Number.isFinite(yearMax)) {
    dbg('Year range specified; skipping recent mode and fetching ALL with year filter');
    const allEntries = await fetchAllAndNormalize();
    const before = allEntries.length;
    entries = allEntries.filter((e) => Number.isFinite(e.year) && e.year >= yearMin && e.year <= yearMax);
    dbg('ALL entries after year filter:', entries.length, 'before:', before);
  } else if (mode === 'recent') {
    const recent = await fetchRemoteJson(config.chart.remoteRecentUrl);
    const recentArr = getArray(recent);
    if (recent && Array.isArray(recentArr)) {
      entries = recentArr.map((row) => normalizeEntry(row, recent.date));
      dbg('Recent entries normalized:', entries.length, 'recent date:', recent.date);
    } else {
      dbg('Recent fetch returned no recognized array key (expected data). keys=', recent && Object.keys(recent || {}));
      // Extra fallback: if recent is an array of entries directly (not wrapped)
      if (Array.isArray(recent)) {
        entries = recent.map((row) => normalizeEntry(row, null));
        dbg('Recent entries normalized from top-level array:', entries.length);
      }
    }
    // Apply optional year filter
    if (entries.length && Number.isFinite(yearMin) && Number.isFinite(yearMax)) {
      const before = entries.length;
      entries = entries.filter((e) => Number.isFinite(e.year) && e.year >= yearMin && e.year <= yearMax);
      dbg('Recent entries after year filter:', entries.length, 'before:', before);
    }
    // If empty after filter, fallback to 'all'
    if (entries.length === 0) {
      dbg('Falling back to ALL archive because recent yielded 0 after filter');
      const allEntries = await fetchAllAndNormalize();
      if (Number.isFinite(yearMin) && Number.isFinite(yearMax)) {
        const before = allEntries.length;
        entries = allEntries.filter((e) => Number.isFinite(e.year) && e.year >= yearMin && e.year <= yearMax);
        dbg('ALL entries after year filter:', entries.length, 'before:', before);
      } else {
        entries = allEntries;
      }
    }
  } else if (mode === 'date' && date) {
    const url = `${config.chart.remoteByDatePrefix}${date}.json`;
    const chart = await fetchRemoteJson(url);
    const arr = getArray(chart);
    if (chart && Array.isArray(arr)) {
      entries = arr.map((row) => normalizeEntry(row, chart.date));
      dbg('Date mode entries:', entries.length, 'for date:', chart.date);
    } else {
      dbg('Date mode: no recognized array key for', date, 'keys=', chart && Object.keys(chart || {}));
    }
  } else if (mode === 'all') {
    entries = await fetchAllAndNormalize();
    // Additional fallback: if top-level all.json already is a flat array of entries (not by date)
    if (!entries.length) {
      const raw = await fetchRemoteJson(config.chart.remoteAllUrl);
      if (Array.isArray(raw)) {
        // If array elements look like entries (have title/artist), normalize directly
        const guess = raw.slice(0, 3);
        const looksLikeEntries = guess.some(g => g && (g.title || g.song) && (g.artist || g.artist_name || g.artists));
        if (looksLikeEntries) {
          entries = raw.map((row) => normalizeEntry(row, null));
          dbg('ALL: normalized from flat array of entries:', entries.length);
        } else {
          // New handling: array items likely objects { date, data }, so iterate
          const out = [];
          for (const day of raw) {
            const arr = getArray(day);
            if (day && Array.isArray(arr)) {
              for (const row of arr) out.push(normalizeEntry(row, day.date));
            }
          }
          entries = out;
          dbg('ALL: normalized from {date,data} array, entries:', entries.length);
        }
      }
    }
    if (Number.isFinite(yearMin) && Number.isFinite(yearMax)) {
      const before = entries.length;
      entries = entries.filter((e) => Number.isFinite(e.year) && e.year >= yearMin && e.year <= yearMax);
      dbg('ALL entries after year filter:', entries.length, 'before:', before);
    }
  }

  // If remote failed or empty, use local sample (already normalized in loadLocalSample)
  if (!entries || entries.length === 0) {
    const local = loadLocalSample();
    if (Array.isArray(local) && local.length) {
      dbg('Using local sample fallback entries:', local.length);
      entries = local;
      if (Number.isFinite(yearMin) && Number.isFinite(yearMax)) {
        const before = entries.length;
        entries = entries.filter((e) => Number.isFinite(e.year) && e.year >= yearMin && e.year <= yearMax);
        dbg('Local sample after year filter:', entries.length, 'before:', before);
      }
    } else {
      dbg('Local sample unavailable or empty');
    }
  }

  // Deduplicate and apply difficulty
  const deduped = dedupeByBestRank(entries);
  const filtered = filterByDifficulty(deduped, difficulty);
  dbg('Counts: raw', entries.length, 'deduped', deduped.length, 'after difficulty', filtered.length);

  // Sort by peakPos/rank asc (best first), fallback by title
  filtered.sort((a, b) => {
    const aMetric = Number.isFinite(a.peakPos) ? a.peakPos : (Number.isFinite(a.rank) ? a.rank : 9999);
    const bMetric = Number.isFinite(b.peakPos) ? b.peakPos : (Number.isFinite(b.rank) ? b.rank : 9999);
    if (aMetric !== bMetric) return aMetric - bMetric;
    return String(a.title).localeCompare(String(b.title));
  });

  return filtered;
}

module.exports = {
  getChartEntries,
};
