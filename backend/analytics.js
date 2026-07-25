/**
 * Analytics Database (file-backed)
 * - Tracks game sessions, rounds, and errors for usage analytics
 * - Uses persistent disk storage like curatedDb.js
 */

const fs = require('fs');
const path = require('path');

// Use persistent disk in production if available, otherwise fall back to deployed cache
function getCacheDir() {
  if (process.env.NODE_ENV === 'production') {
    const persistentPath = '/var/data/cache';
    const deployedPath = path.join(__dirname, 'cache');
    
    // Check if persistent disk is available
    if (fs.existsSync(persistentPath)) {
      console.log('[Analytics] Using persistent disk cache directory:', persistentPath);
      return persistentPath;
    }
    
    // Fall back to deployed cache directory
    console.log('[Analytics] Using deployed cache directory:', deployedPath);
    return deployedPath;
  }
  
  // Development: use local cache
  const localPath = path.join(__dirname, 'cache');
  console.log('[Analytics] Using local cache directory:', localPath);
  return localPath;
}

const CACHE_DIR = getCacheDir();
const SESSIONS_FILE = path.join(CACHE_DIR, 'analytics-sessions.json');
const ERRORS_FILE = path.join(CACHE_DIR, 'analytics-errors.json');
const PAGEVIEWS_FILE = path.join(CACHE_DIR, 'analytics-pageviews.json');

// In-memory caches
let _sessions = [];
let _errors = [];
let _pageviews = [];
let _sessionsLoaded = false;
let _errorsLoaded = false;
let _pageviewsLoaded = false;

// Configuration
const MAX_SESSIONS = 10000; // Keep last 10k sessions
const MAX_ERRORS = 5000; // Keep last 5k errors
const MAX_PAGEVIEWS = 50000; // Keep last 50k pageviews

// Ensure cache dir exists
function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn('[Analytics] Failed to ensure cache dir:', e && e.message);
  }
}

// Load sessions from disk
function loadSessions() {
  if (_sessionsLoaded) return;
  
  ensureCacheDir();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
      _sessions = JSON.parse(raw);
      if (!Array.isArray(_sessions)) _sessions = [];
      console.log('[Analytics] Loaded', _sessions.length, 'game sessions from disk');
    } else {
      _sessions = [];
      saveSessions();
    }
    _sessionsLoaded = true;
  } catch (e) {
    console.warn('[Analytics] Failed to load sessions:', e && e.message);
    _sessions = [];
    _sessionsLoaded = true;
  }
}

// Save sessions to disk
function saveSessions() {
  ensureCacheDir();
  try {
    // Trim to max size before saving
    if (_sessions.length > MAX_SESSIONS) {
      _sessions = _sessions.slice(-MAX_SESSIONS);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(_sessions, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn('[Analytics] Failed to save sessions:', e && e.message);
    return false;
  }
}

// Load errors from disk
function loadErrors() {
  if (_errorsLoaded) return;
  
  ensureCacheDir();
  try {
    if (fs.existsSync(ERRORS_FILE)) {
      const raw = fs.readFileSync(ERRORS_FILE, 'utf8');
      _errors = JSON.parse(raw);
      if (!Array.isArray(_errors)) _errors = [];
      console.log('[Analytics] Loaded', _errors.length, 'error logs from disk');
    } else {
      _errors = [];
      saveErrors();
    }
    _errorsLoaded = true;
  } catch (e) {
    console.warn('[Analytics] Failed to load errors:', e && e.message);
    _errors = [];
    _errorsLoaded = true;
  }
}

// Save errors to disk
function saveErrors() {
  ensureCacheDir();
  try {
    // Trim to max size before saving
    if (_errors.length > MAX_ERRORS) {
      _errors = _errors.slice(-MAX_ERRORS);
    }
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(_errors, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn('[Analytics] Failed to save errors:', e && e.message);
    return false;
  }
}

// Load pageviews from disk
function loadPageviews() {
  if (_pageviewsLoaded) return;

  ensureCacheDir();
  try {
    if (fs.existsSync(PAGEVIEWS_FILE)) {
      const raw = fs.readFileSync(PAGEVIEWS_FILE, 'utf8');
      _pageviews = JSON.parse(raw);
      if (!Array.isArray(_pageviews)) _pageviews = [];
      console.log('[Analytics] Loaded', _pageviews.length, 'pageviews from disk');
    } else {
      _pageviews = [];
      savePageviews();
    }
    _pageviewsLoaded = true;
  } catch (e) {
    console.warn('[Analytics] Failed to load pageviews:', e && e.message);
    _pageviews = [];
    _pageviewsLoaded = true;
  }
}

// Save pageviews to disk
function savePageviews() {
  ensureCacheDir();
  try {
    // Trim to max size before saving
    if (_pageviews.length > MAX_PAGEVIEWS) {
      _pageviews = _pageviews.slice(-MAX_PAGEVIEWS);
    }
    fs.writeFileSync(PAGEVIEWS_FILE, JSON.stringify(_pageviews), 'utf8');
    return true;
  } catch (e) {
    console.warn('[Analytics] Failed to save pageviews:', e && e.message);
    return false;
  }
}

// Throttled save: pageviews can spike, so coalesce writes rather than writing
// synchronously on every hit (mirrors the "async persist" pattern elsewhere).
let _pvSaveTimer = null;
function schedulePageviewsSave() {
  if (_pvSaveTimer) return;
  _pvSaveTimer = setTimeout(() => {
    _pvSaveTimer = null;
    savePageviews();
  }, 3000);
  if (_pvSaveTimer.unref) _pvSaveTimer.unref();
}

/**
 * Record the start of a game session
 */
function recordSessionStart({ roomCode, playerCount, playerNames, difficulty, musicMode, winCondition }) {
  loadSessions();
  
  const session = {
    id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    roomCode: roomCode || null,
    startTime: new Date().toISOString(),
    endTime: null,
    duration: null,
    playerCount: Number(playerCount) || 0,
    playerNames: Array.isArray(playerNames) ? playerNames : [],
    totalRounds: 0,
    winCondition: Number(winCondition) || 10,
    winnerName: null,
    difficulty: difficulty || 'normal',
    musicMode: musicMode || 'unknown',
    completedNormally: false,
  };
  
  _sessions.push(session);
  saveSessions();
  
  console.log('[Analytics] Recorded session start:', session.id, 'Room:', roomCode);
  return session;
}

/**
 * Record a round played in a session
 */
function recordRound(roomCode) {
  loadSessions();
  
  // Find most recent session for this room
  const session = _sessions.slice().reverse().find(s => s.roomCode === roomCode && !s.endTime);
  if (session) {
    session.totalRounds = (session.totalRounds || 0) + 1;
    saveSessions();
  }
}

/**
 * Record the end of a game session
 */
function recordSessionEnd({ roomCode, winnerName, completedNormally = true }) {
  loadSessions();
  
  // Find most recent session for this room
  const session = _sessions.slice().reverse().find(s => s.roomCode === roomCode && !s.endTime);
  if (session) {
    session.endTime = new Date().toISOString();
    session.duration = Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000);
    session.winnerName = winnerName || null;
    session.completedNormally = completedNormally;
    saveSessions();
    
    console.log('[Analytics] Recorded session end:', session.id, 'Duration:', session.duration, 's');
    return session;
  }
  
  return null;
}

/**
 * Log an error event
 */
function logError({ sessionId, roomCode, errorType, message, playerName, context }) {
  loadErrors();
  
  const error = {
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    sessionId: sessionId || null,
    roomCode: roomCode || null,
    errorType: errorType || 'unknown',
    message: message || '',
    playerName: playerName || null,
    context: context || null,
  };
  
  _errors.push(error);
  saveErrors();
  
  console.log('[Analytics] Logged error:', error.errorType, '-', error.message);
  return error;
}

/**
 * Get aggregated usage statistics
 */
function getStats({ dateFrom, dateTo } = {}) {
  loadSessions();
  loadErrors();
  
  // Filter by date range if provided
  let sessions = _sessions;
  if (dateFrom || dateTo) {
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() : Date.now();
    sessions = sessions.filter(s => {
      const sessionTime = new Date(s.startTime).getTime();
      return sessionTime >= fromTime && sessionTime <= toTime;
    });
  }
  
  // Calculate aggregated stats
  const completedSessions = sessions.filter(s => s.endTime);
  const totalGames = sessions.length;
  const completedGames = completedSessions.length;
  
  // Unique players (by name)
  const allPlayerNames = sessions.flatMap(s => s.playerNames || []);
  const uniquePlayers = new Set(allPlayerNames);
  
  // Average duration (only completed games)
  const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const avgDuration = completedGames > 0 ? Math.round(totalDuration / completedGames) : 0;
  
  // Total rounds
  const totalRounds = sessions.reduce((sum, s) => sum + (s.totalRounds || 0), 0);
  const avgRounds = totalGames > 0 ? Math.round(totalRounds / totalGames) : 0;
  
  // Player count distribution
  const playerCountDist = {};
  sessions.forEach(s => {
    const count = s.playerCount || 0;
    playerCountDist[count] = (playerCountDist[count] || 0) + 1;
  });
  
  // Difficulty distribution
  const difficultyDist = {};
  sessions.forEach(s => {
    const diff = s.difficulty || 'unknown';
    difficultyDist[diff] = (difficultyDist[diff] || 0) + 1;
  });
  
  // Music mode distribution
  const musicModeDist = {};
  sessions.forEach(s => {
    const mode = s.musicMode || 'unknown';
    musicModeDist[mode] = (musicModeDist[mode] || 0) + 1;
  });
  
  // Completion rate
  const completionRate = totalGames > 0 ? Math.round((completedGames / totalGames) * 100) : 0;

  // Win condition distribution
  const winConditionDist = {};
  sessions.forEach(s => {
    const wc = s.winCondition || 10;
    winConditionDist[wc] = (winConditionDist[wc] || 0) + 1;
  });

  // Games over time (by day)
  const gamesOverTime = {};
  sessions.forEach(s => {
    const date = s.startTime.split('T')[0]; // YYYY-MM-DD
    gamesOverTime[date] = (gamesOverTime[date] || 0) + 1;
  });
  
  // Error statistics (respect the same date range as sessions)
  let errors = _errors;
  if (dateFrom || dateTo) {
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() : Date.now();
    errors = errors.filter(e => {
      const errorTime = new Date(e.timestamp).getTime();
      return errorTime >= fromTime && errorTime <= toTime;
    });
  }
  const totalErrors = errors.length;
  const errorTypesDist = {};
  errors.forEach(e => {
    const type = e.errorType || 'unknown';
    errorTypesDist[type] = (errorTypesDist[type] || 0) + 1;
  });
  
  return {
    overview: {
      totalGames,
      completedGames,
      uniquePlayers: uniquePlayers.size,
      totalRounds,
      avgRounds,
      avgDuration,
      completionRate,
      totalErrors,
    },
    distributions: {
      playerCount: playerCountDist,
      difficulty: difficultyDist,
      musicMode: musicModeDist,
      errorTypes: errorTypesDist,
      winCondition: winConditionDist,
    },
    timeSeries: {
      gamesOverTime: Object.entries(gamesOverTime).sort(),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get paginated list of game sessions
 */
function getSessions({ limit = 50, offset = 0, dateFrom, dateTo } = {}) {
  loadSessions();
  
  let sessions = _sessions.slice().reverse(); // Most recent first
  
  // Filter by date range if provided
  if (dateFrom || dateTo) {
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() : Date.now();
    sessions = sessions.filter(s => {
      const sessionTime = new Date(s.startTime).getTime();
      return sessionTime >= fromTime && sessionTime <= toTime;
    });
  }
  
  const total = sessions.length;
  const items = sessions.slice(offset, offset + limit);
  
  return { items, total, limit, offset };
}

/**
 * Get paginated list of error logs
 */
function getErrors({ limit = 100, offset = 0, errorType, dateFrom, dateTo } = {}) {
  loadErrors();
  
  let errors = _errors.slice().reverse(); // Most recent first
  
  // Filter by error type if provided
  if (errorType) {
    errors = errors.filter(e => e.errorType === errorType);
  }
  
  // Filter by date range if provided
  if (dateFrom || dateTo) {
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() : Date.now();
    errors = errors.filter(e => {
      const errorTime = new Date(e.timestamp).getTime();
      return errorTime >= fromTime && errorTime <= toTime;
    });
  }
  
  const total = errors.length;
  const items = errors.slice(offset, offset + limit);
  
  return { items, total, limit, offset };
}

/**
 * Clear old analytics data
 */
function clearOldData({ olderThanDays = 90 } = {}) {
  loadSessions();
  loadErrors();
  loadPageviews();

  const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

  const sessionsBefore = _sessions.length;
  _sessions = _sessions.filter(s => new Date(s.startTime).getTime() >= cutoffTime);
  const sessionsRemoved = sessionsBefore - _sessions.length;

  const errorsBefore = _errors.length;
  _errors = _errors.filter(e => new Date(e.timestamp).getTime() >= cutoffTime);
  const errorsRemoved = errorsBefore - _errors.length;

  const pageviewsBefore = _pageviews.length;
  _pageviews = _pageviews.filter(v => new Date(v.t).getTime() >= cutoffTime);
  const pageviewsRemoved = pageviewsBefore - _pageviews.length;

  saveSessions();
  saveErrors();
  savePageviews();

  console.log('[Analytics] Cleared old data:', sessionsRemoved, 'sessions,', errorsRemoved, 'errors,', pageviewsRemoved, 'pageviews');
  return { sessionsRemoved, errorsRemoved, pageviewsRemoved };
}

// --- Website visit tracking ---

const BOT_UA_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|headless|lighthouse|pingdom|uptimerobot|preview/i;

// Reduce a referrer URL to its bare hostname for grouping (or 'direct' when empty).
function referrerDomain(referrer) {
  if (!referrer || typeof referrer !== 'string') return 'direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host || 'direct';
  } catch (e) {
    return 'direct';
  }
}

/**
 * Record a website pageview. `site` ('landing' | 'game') is sent explicitly by
 * the client so the funnel is reliable even in dev (both entry points share an
 * origin locally). Obvious bots are dropped rather than stored.
 */
function recordPageview({ site, path: pagePath, referrer, visitorId, utmSource, utmMedium, utmCampaign, userAgent } = {}) {
  if (userAgent && BOT_UA_RE.test(userAgent)) return null;

  loadPageviews();

  const pv = {
    t: new Date().toISOString(),
    site: site === 'game' ? 'game' : site === 'landing' ? 'landing' : 'unknown',
    path: (pagePath || '/').slice(0, 200),
    ref: referrerDomain(referrer),
    utmSource: utmSource ? String(utmSource).slice(0, 80) : null,
    utmMedium: utmMedium ? String(utmMedium).slice(0, 80) : null,
    utmCampaign: utmCampaign ? String(utmCampaign).slice(0, 80) : null,
    vid: visitorId ? String(visitorId).slice(0, 64) : null,
  };

  _pageviews.push(pv);
  schedulePageviewsSave();
  return pv;
}

function topEntries(map, limit = 15) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Aggregated website-visit statistics for the admin dashboard.
 */
function getPageviewStats({ dateFrom, dateTo } = {}) {
  loadPageviews();

  let views = _pageviews;
  if (dateFrom || dateTo) {
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() : Date.now();
    views = views.filter(v => {
      const t = new Date(v.t).getTime();
      return t >= fromTime && t <= toTime;
    });
  }

  const uniques = new Set();
  const landingUniques = new Set();
  const gameUniques = new Set();
  let landingViews = 0;
  let gameViews = 0;
  const viewsOverTime = {};
  const referrers = {};
  const utmSources = {};
  const utmCampaigns = {};
  const pages = {};

  views.forEach(v => {
    if (v.vid) uniques.add(v.vid);
    if (v.site === 'landing') {
      landingViews++;
      if (v.vid) landingUniques.add(v.vid);
    } else if (v.site === 'game') {
      gameViews++;
      if (v.vid) gameUniques.add(v.vid);
    }
    const day = v.t.split('T')[0];
    viewsOverTime[day] = (viewsOverTime[day] || 0) + 1;
    referrers[v.ref] = (referrers[v.ref] || 0) + 1;
    if (v.utmSource) utmSources[v.utmSource] = (utmSources[v.utmSource] || 0) + 1;
    if (v.utmCampaign) utmCampaigns[v.utmCampaign] = (utmCampaigns[v.utmCampaign] || 0) + 1;
    const pageKey = `${v.site}${v.path}`;
    pages[pageKey] = (pages[pageKey] || 0) + 1;
  });

  return {
    overview: {
      totalViews: views.length,
      uniqueVisitors: uniques.size,
      landingViews,
      landingUniques: landingUniques.size,
      gameViews,
      gameUniques: gameUniques.size,
    },
    timeSeries: {
      viewsOverTime: Object.entries(viewsOverTime).sort(),
    },
    referrers: topEntries(referrers),
    utmSources: topEntries(utmSources),
    utmCampaigns: topEntries(utmCampaigns),
    topPages: topEntries(pages),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  recordSessionStart,
  recordRound,
  recordSessionEnd,
  logError,
  getStats,
  getSessions,
  getErrors,
  clearOldData,
  recordPageview,
  getPageviewStats,
};
