/**
 * Centralized backend configuration and feature flags.
 * Reads from process.env with sensible defaults for local dev.
 */
const fs = require('fs');
const path = require('path');

// Only load .env in development
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '.env') });
  } catch {}
}

const bool = (v, def = false) => {
  if (v === undefined || v === null) return def;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase().trim();
  return ['1', 'true', 'yes', 'on'].includes(s);
};

const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const config = {
  featureFlags: {
    enableChartMode: bool(process.env.CHART_MODE_ENABLE, false),
    enableMusicBrainz: bool(process.env.MUSICBRAINZ_ENABLE, true),
    enableRemasterFilter: bool(process.env.REMASTER_FILTER_ENABLE, true),
  },

  difficulty: (process.env.DIFFICULTY || 'normal').toLowerCase(), // easy|normal|hard

  thresholds: {
    nonChart: {
      easy: num(process.env.NON_CHART_EASY, 75),
      normal: num(process.env.NON_CHART_NORMAL, 50),
      hard: num(process.env.NON_CHART_HARD, 0),
    },
    chart: {
      easy: num(process.env.CHART_EASY_MAX_RANK, 20),   // rank <= 20
      normal: num(process.env.CHART_NORMAL_MAX_RANK, 50),
      hard: num(process.env.CHART_HARD_MAX_RANK, 100),
    },
  },

  musicbrainz: {
    rateLimitRPS: num(process.env.MUSICBRAINZ_RPS, 1),
    userAgent:
      process.env.MB_USER_AGENT ||
      'BeatablyGame/1.0.0 (https://github.com/beatably/beatably-game; contact@example.com)',
    cachePath:
      process.env.MB_CACHE_PATH ||
      path.resolve(__dirname, 'cache', 'musicbrainz-recordings.json'),
    minConfidence: num(process.env.MB_MIN_CONFIDENCE, 0.6),
    yearDiffThreshold: num(process.env.MB_YEAR_DIFF_THRESHOLD, 2),
  },

  chart: {
    remoteAllUrl:
      process.env.CHART_REMOTE_ALL_URL ||
      'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/all.json',
    remoteRecentUrl:
      process.env.CHART_REMOTE_RECENT_URL ||
      'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/recent.json',
    remoteByDatePrefix:
      process.env.CHART_REMOTE_DATE_PREFIX ||
      'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/date/', // + YYYY-MM-DD.json
    localSamplePath:
      process.env.CHART_LOCAL_SAMPLE_PATH ||
      path.resolve(process.cwd(), 'data', 'chart-hits-sample.json'),
    timeoutMs: num(process.env.CHART_FETCH_TIMEOUT_MS, 12000),
  },
};

function ensureCacheDir() {
  const p = path.dirname(config.musicbrainz.cachePath);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

module.exports = {
  config,
  ensureCacheDir,
};
