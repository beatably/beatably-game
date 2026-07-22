/**
 * Solo high-score board (file-backed, global)
 * - Records best solo-streak scores across all players.
 * - Uses persistent disk storage like curatedDb.js / analytics.js, but honors
 *   BEATABLY_CACHE_DIR so tests can isolate state (mirrors index.js getStateDir).
 */

const fs = require('fs');
const path = require('path');

function getCacheDir() {
  // Explicit override (used by tests to isolate state from the dev cache).
  if (process.env.BEATABLY_CACHE_DIR) {
    return process.env.BEATABLY_CACHE_DIR;
  }
  if (process.env.NODE_ENV === 'production') {
    const persistentPath = '/var/data/cache';
    const deployedPath = path.join(__dirname, 'cache');
    if (fs.existsSync(persistentPath)) return persistentPath;
    return deployedPath;
  }
  return path.join(__dirname, 'cache');
}

const SCORES_FILE = () => path.join(getCacheDir(), 'solo-highscores.json');

// Rules version: bump if solo scoring rules change so future boards can segment.
const RULES_VERSION = 1;
const MAX_SCORES = 100;

let _scores = null; // in-memory cache; null until first load

function ensureCacheDir() {
  const dir = getCacheDir();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn('[SoloScores] Failed to ensure cache dir:', e && e.message);
  }
}

function load() {
  if (_scores !== null) return _scores;
  try {
    const file = SCORES_FILE();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      _scores = Array.isArray(parsed) ? parsed : [];
    } else {
      _scores = [];
    }
  } catch (e) {
    console.warn('[SoloScores] Failed to load:', e && e.message);
    _scores = [];
  }
  return _scores;
}

function save() {
  ensureCacheDir();
  try {
    const file = SCORES_FILE();
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_scores, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    console.warn('[SoloScores] Failed to save:', e && e.message);
    return false;
  }
}

// Sort: highest score first; ties broken by earlier date (first to reach it wins).
function sortScores(list) {
  return list.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.date) - new Date(b.date);
  });
}

/**
 * Record a completed solo run.
 * @returns {{ entry, rank, top10 }} rank is 1-based within the full sorted list
 *   (computed before trimming, so a score that falls off the board still gets a rank).
 */
function recordScore({ name, score, roomCode }) {
  load();
  const entry = {
    id: `solo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'Player').slice(0, 40),
    score: Math.max(0, Number(score) || 0),
    date: new Date().toISOString(),
    roomCode: roomCode || null,
    v: RULES_VERSION,
  };

  const sorted = sortScores([..._scores, entry]);
  const rank = sorted.findIndex((s) => s.id === entry.id) + 1;

  _scores = sorted.slice(0, MAX_SCORES);
  save();

  return { entry, rank, top10: toPublic(sorted.slice(0, 10)) };
}

function toPublic(list) {
  return list.map((s) => ({ name: s.name, score: s.score, date: s.date }));
}

function getTop(n = 10) {
  load();
  return toPublic(sortScores(_scores).slice(0, n));
}

function getAll() {
  load();
  return sortScores(_scores);
}

function clear() {
  _scores = [];
  save();
}

module.exports = {
  recordScore,
  getTop,
  getAll,
  clear,
  RULES_VERSION,
};
