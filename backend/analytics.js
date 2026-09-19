/**
 * Analytics Database (file-backed)
 * - Tracks game sessions, rounds, and errors for usage analytics
 * - Uses persistent disk storage like curatedDb.js
 */

const fs = require('fs');
const path = require('path');
const { resolveCountry, detectDevice, detectBrowser, detectOS } = require('./visitorMeta');

// Use persistent disk in production if available, otherwise fall back to deployed cache
function getCacheDir() {
  // Explicit override (used by tests to isolate state from the dev cache).
  if (process.env.BEATABLY_CACHE_DIR) {
    console.log('[Analytics] Using BEATABLY_CACHE_DIR:', process.env.BEATABLY_CACHE_DIR);
    return process.env.BEATABLY_CACHE_DIR;
  }
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
const VISITORS_FILE = path.join(CACHE_DIR, 'analytics-visitors.json');

// In-memory caches
let _sessions = [];
let _errors = [];
let _pageviews = [];
let _sessionsLoaded = false;
let _errorsLoaded = false;
let _pageviewsLoaded = false;
// Visitor profiles keyed by visitor id. Unlike pageviews (which are trimmed to a
// rolling window) these survive, so "new vs returning" and retention stay correct
// after old raw hits are dropped.
let _visitors = {};
let _visitorsLoaded = false;

// Configuration
const MAX_SESSIONS = 10000; // Keep last 10k sessions
const MAX_ERRORS = 5000; // Keep last 5k errors
const MAX_PAGEVIEWS = 50000; // Keep last 50k pageviews
const MAX_VISITORS = 20000; // Keep the 20k most recently seen visitors
const MAX_VISITOR_DAYS = 35; // Active-day history per visitor (enough for D30 retention)

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

// --- Visitor profiles ---------------------------------------------------

function loadVisitors() {
  if (_visitorsLoaded) return;
  ensureCacheDir();
  try {
    if (fs.existsSync(VISITORS_FILE)) {
      const raw = fs.readFileSync(VISITORS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      _visitors = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
      console.log('[Analytics] Loaded', Object.keys(_visitors).length, 'visitor profiles from disk');
    } else {
      _visitors = {};
    }
  } catch (e) {
    console.warn('[Analytics] Failed to load visitors:', e && e.message);
    _visitors = {};
  }
  _visitorsLoaded = true;
}

function saveVisitors() {
  ensureCacheDir();
  try {
    const ids = Object.keys(_visitors);
    if (ids.length > MAX_VISITORS) {
      // Evict the least recently seen visitors first.
      ids.sort((a, b) => String(_visitors[b].last).localeCompare(String(_visitors[a].last)));
      const kept = {};
      ids.slice(0, MAX_VISITORS).forEach(id => { kept[id] = _visitors[id]; });
      _visitors = kept;
    }
    fs.writeFileSync(VISITORS_FILE, JSON.stringify(_visitors), 'utf8');
    return true;
  } catch (e) {
    console.warn('[Analytics] Failed to save visitors:', e && e.message);
    return false;
  }
}

let _visitorSaveTimer = null;
function scheduleVisitorsSave() {
  if (_visitorSaveTimer) return;
  _visitorSaveTimer = setTimeout(() => {
    _visitorSaveTimer = null;
    saveVisitors();
  }, 3000);
  if (_visitorSaveTimer.unref) _visitorSaveTimer.unref();
}

// Whole days since the epoch — a compact stand-in for a calendar date, so each
// visitor's active-day history stays small on disk.
function dayNumber(iso) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 86400000) : 0;
}
function dayNumberToISODate(n) {
  return new Date(n * 86400000).toISOString().split('T')[0];
}
// Monday-based week key, used for retention cohorts.
function weekKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().split('T')[0];
}

/**
 * Create or update the profile behind a visitor id.
 * Returns true when this is the first time we have ever seen the visitor, so
 * the raw hit can be stamped new-vs-returning at write time.
 */
function touchVisitor(vid, hit) {
  if (!vid) return false;
  loadVisitors();

  const now = hit.t;
  let v = _visitors[vid];
  const isNew = !v;

  if (isNew) {
    v = {
      first: now,
      last: now,
      views: 0,
      ctas: 0,
      games: 0,
      days: [],
      country: hit.country || 'unknown',
      device: hit.device || 'unknown',
      browser: hit.browser || 'unknown',
      os: hit.os || 'unknown',
      firstSite: hit.site || 'unknown',
      firstRef: hit.ref || 'direct',
      firstUtmSource: hit.utmSource || null,
      firstUtmCampaign: hit.utmCampaign || null,
      firstPath: hit.path || '/',
    };
    _visitors[vid] = v;
  }

  v.last = now;
  if (hit.kind === 'event') v.ctas = (v.ctas || 0) + 1;
  else v.views = (v.views || 0) + 1;

  // Later hits refine fields the first hit may have missed (e.g. timezone
  // arrives on the game app but not on an older cached landing bundle).
  if ((!v.country || v.country === 'unknown') && hit.country && hit.country !== 'unknown') v.country = hit.country;
  if ((!v.device || v.device === 'unknown') && hit.device && hit.device !== 'unknown') v.device = hit.device;
  if ((!v.browser || v.browser === 'unknown') && hit.browser && hit.browser !== 'unknown') v.browser = hit.browser;
  if ((!v.os || v.os === 'unknown') && hit.os && hit.os !== 'unknown') v.os = hit.os;

  const d = dayNumber(now);
  if (!v.days.includes(d)) {
    v.days.push(d);
    v.days.sort((a, b) => a - b);
    if (v.days.length > MAX_VISITOR_DAYS) v.days = v.days.slice(-MAX_VISITOR_DAYS);
  }

  scheduleVisitorsSave();
  return isNew;
}

/**
 * Mark that a visitor took part in a game. Called when a game starts so the
 * visitor dashboard can separate browsers from actual players.
 * The iOS app never sends a pageview, so a first game also creates the profile.
 */
function noteVisitorGame(vid, { client } = {}) {
  if (!vid) return;
  loadVisitors();
  const now = new Date().toISOString();
  let v = _visitors[vid];
  if (!v) {
    v = {
      first: now, last: now, views: 0, ctas: 0, games: 0, days: [],
      country: 'unknown',
      device: client === 'ios' ? 'mobile' : 'unknown',
      browser: client === 'ios' ? 'ios-app' : 'unknown',
      os: client === 'ios' ? 'ios' : 'unknown',
      firstSite: client === 'ios' ? 'ios-app' : 'game',
      firstRef: 'direct', firstUtmSource: null, firstUtmCampaign: null, firstPath: '/',
    };
    _visitors[vid] = v;
  }
  v.games = (v.games || 0) + 1;
  v.last = now;
  const d = dayNumber(now);
  if (!v.days.includes(d)) {
    v.days.push(d);
    v.days.sort((a, b) => a - b);
    if (v.days.length > MAX_VISITOR_DAYS) v.days = v.days.slice(-MAX_VISITOR_DAYS);
  }
  scheduleVisitorsSave();
}

const CLIENTS = ['ios', 'web'];

// Summarise the per-player clients of one game: 'ios', 'web', 'mixed' (both) or
// 'unknown' (nothing identifiable). Lets the dashboard chart games by platform.
function summarizeClientMix(playerClients) {
  const known = [...new Set(playerClients.filter(c => CLIENTS.includes(c)))];
  if (known.length === 0) return 'unknown';
  if (known.length === 1) return known[0];
  return 'mixed';
}

/**
 * Record the start of a game session
 */
function normalizeCampaign(campaign) {
  if (!campaign || typeof campaign !== 'object') return null;
  const clean = (value) => value ? String(value).slice(0, 80) : null;
  const normalized = {
    source: clean(campaign.source),
    medium: clean(campaign.medium),
    campaign: clean(campaign.campaign),
    content: clean(campaign.content),
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function recordSessionStart({ roomCode, playerCount, playerNames, playerClients, playerVisitorIds, difficulty, musicMode, winCondition, gameMode, campaign }) {
  loadSessions();

  // Per-player client ('ios' | 'web' | 'unknown'), index-aligned with playerNames
  const clients = (Array.isArray(playerClients) ? playerClients : [])
    .map(c => (CLIENTS.includes(c) ? c : 'unknown'));

  const session = {
    id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    roomCode: roomCode || null,
    startTime: new Date().toISOString(),
    endTime: null,
    duration: null,
    playerCount: Number(playerCount) || 0,
    playerNames: Array.isArray(playerNames) ? playerNames : [],
    playerClients: clients,
    clientMix: summarizeClientMix(clients),
    // Stable per-device ids, index-aligned with playerNames. Lets the dashboard
    // tell a genuinely new player from the same person starting another game.
    playerVisitorIds: (Array.isArray(playerVisitorIds) ? playerVisitorIds : []).map(v => (v ? String(v).slice(0, 64) : null)),
    countries: [],
    gameMode: gameMode || 'multiplayer',
    totalRounds: 0,
    winCondition: Number(winCondition) || 10,
    winnerName: null,
    difficulty: difficulty || 'normal',
    musicMode: musicMode || 'unknown',
    campaign: normalizeCampaign(campaign),
    completedNormally: false,
    endReason: null,
  };

  // Resolve each player's country from their visitor profile, and count the game
  // against that profile so repeat-player stats work.
  loadVisitors();
  session.countries = [...new Set(session.playerVisitorIds
    .map(vid => (vid && _visitors[vid]?.country) || 'unknown'))];
  session.playerVisitorIds.forEach((vid, i) => noteVisitorGame(vid, { client: clients[i] }));

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
function recordSessionEnd({ roomCode, winnerName, completedNormally = true, endReason }) {
  loadSessions();
  
  // Find most recent session for this room
  const session = _sessions.slice().reverse().find(s => s.roomCode === roomCode && !s.endTime);
  if (session) {
    session.endTime = new Date().toISOString();
    session.duration = Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000);
    session.winnerName = winnerName || null;
    session.completedNormally = completedNormally;
    session.endReason = endReason || (completedNormally ? 'win' : 'abandoned');
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

// --- Shared filtering ---------------------------------------------------

function inRange(iso, fromTime, toTime) {
  const t = new Date(iso).getTime();
  return t >= fromTime && t <= toTime;
}

function rangeBounds(dateFrom, dateTo) {
  return [
    dateFrom ? new Date(dateFrom).getTime() : 0,
    dateTo ? new Date(dateTo).getTime() : Date.now(),
  ];
}

/**
 * Apply the dashboard filters to the session list. Every filter is optional;
 * `search` matches room code, player name or winner.
 */
function filterSessions(sessions, { dateFrom, dateTo, gameMode, clientMix, client, difficulty, country, status, campaignSource, search } = {}) {
  const [fromTime, toTime] = rangeBounds(dateFrom, dateTo);
  const needle = search ? String(search).trim().toLowerCase() : '';

  return sessions.filter(sess => {
    if (!inRange(sess.startTime, fromTime, toTime)) return false;
    if (gameMode && (sess.gameMode || 'multiplayer') !== gameMode) return false;
    if (clientMix && (sess.clientMix || 'unknown') !== clientMix) return false;
    if (client && !(sess.playerClients || []).includes(client)) return false;
    if (difficulty && (sess.difficulty || 'unknown') !== difficulty) return false;
    if (country && !(sess.countries || []).includes(country)) return false;
    if (campaignSource) {
      const source = sess.campaign?.source || 'unattributed';
      if (source !== campaignSource) return false;
    }
    if (status) {
      const resolved = sessionStatus(sess);
      if (resolved !== status) return false;
    }
    if (needle) {
      const haystack = [
        sess.roomCode || '',
        sess.winnerName || '',
        ...(sess.playerNames || []),
      ].join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

// A game with no end time that has not been touched for 6h was almost certainly
// walked away from rather than still running.
const STALE_GAME_MS = 6 * 60 * 60 * 1000;

function sessionStatus(sess) {
  if (sess.endTime) return sess.completedNormally ? 'completed' : 'abandoned';
  if (Date.now() - new Date(sess.startTime).getTime() > STALE_GAME_MS) return 'abandoned';
  return 'in_progress';
}

function countBy(items, keyFn) {
  const out = {};
  items.forEach(item => {
    const key = keyFn(item);
    if (key === undefined || key === null) return;
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

/**
 * Get aggregated usage statistics
 */
function getStats(filters = {}) {
  loadSessions();
  loadErrors();

  const { dateFrom, dateTo } = filters;
  const sessions = filterSessions(_sessions, filters);

  // Calculate aggregated stats
  const completedSessions = sessions.filter(s => s.endTime);
  const totalGames = sessions.length;
  const completedGames = completedSessions.length;

  // Unique players (by name)
  const allPlayerNames = sessions.flatMap(s => s.playerNames || []);
  const uniquePlayers = new Set(allPlayerNames);

  // Unique devices that played, and how many of them played more than one game.
  const gamesPerVisitor = {};
  sessions.forEach(s => {
    (s.playerVisitorIds || []).forEach(vid => {
      if (!vid) return;
      gamesPerVisitor[vid] = (gamesPerVisitor[vid] || 0) + 1;
    });
  });
  const identifiedPlayers = Object.keys(gamesPerVisitor).length;
  const repeatPlayers = Object.values(gamesPerVisitor).filter(n => n > 1).length;
  const repeatPlayerRate = identifiedPlayers > 0
    ? Math.round((repeatPlayers / identifiedPlayers) * 100)
    : 0;

  // Average duration (only completed games)
  const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const avgDuration = completedGames > 0 ? Math.round(totalDuration / completedGames) : 0;
  const durations = completedSessions.map(s => s.duration || 0).sort((a, b) => a - b);
  const medianDuration = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : 0;

  // Total rounds
  const totalRounds = sessions.reduce((sum, s) => sum + (s.totalRounds || 0), 0);
  const avgRounds = totalGames > 0 ? Math.round(totalRounds / totalGames) : 0;

  const soloGames = sessions.filter(s => (s.gameMode || 'multiplayer') === 'solo').length;
  const multiplayerGames = totalGames - soloGames;
  const abandonedGames = sessions.filter(s => sessionStatus(s) === 'abandoned').length;
  const abandonRate = totalGames > 0 ? Math.round((abandonedGames / totalGames) * 100) : 0;

  const playerCountDist = countBy(sessions, s => s.playerCount || 0);
  const difficultyDist = countBy(sessions, s => s.difficulty || 'unknown');
  const musicModeDist = countBy(sessions, s => s.musicMode || 'unknown');
  const gameModeDist = countBy(sessions, s => s.gameMode || 'multiplayer');
  const clientMixDist = countBy(sessions, s => s.clientMix || 'unknown');
  const winConditionDist = countBy(sessions, s => s.winCondition || 10);
  const endReasonDist = countBy(sessions, s => sessionStatus(s));
  // Local-time buckets are not available (we store UTC only), but UTC hour is
  // still a usable signal for when people play.
  const hourOfDayDist = countBy(sessions, s => new Date(s.startTime).getUTCHours());
  const dayOfWeekDist = countBy(sessions, s => new Date(s.startTime).getUTCDay());

  const playerClientDist = {};
  const campaignSourceDist = {};
  const countryDist = {};
  sessions.forEach(s => {
    (s.playerClients || []).forEach(c => {
      const client = c || 'unknown';
      playerClientDist[client] = (playerClientDist[client] || 0) + 1;
    });
    const source = s.campaign?.source || 'unattributed';
    campaignSourceDist[source] = (campaignSourceDist[source] || 0) + 1;
    (s.countries && s.countries.length ? s.countries : ['unknown']).forEach(c => {
      countryDist[c] = (countryDist[c] || 0) + 1;
    });
  });

  // Completion rate
  const completionRate = totalGames > 0 ? Math.round((completedGames / totalGames) * 100) : 0;

  // Games over time (by day), split by mode so the chart can be stacked.
  const gamesOverTime = {};
  const soloOverTime = {};
  const multiOverTime = {};
  sessions.forEach(s => {
    const date = s.startTime.split('T')[0]; // YYYY-MM-DD
    gamesOverTime[date] = (gamesOverTime[date] || 0) + 1;
    if ((s.gameMode || 'multiplayer') === 'solo') soloOverTime[date] = (soloOverTime[date] || 0) + 1;
    else multiOverTime[date] = (multiOverTime[date] || 0) + 1;
  });

  // Error statistics (respect the same date range as sessions)
  const [fromTime, toTime] = rangeBounds(dateFrom, dateTo);
  const errors = _errors.filter(e => inRange(e.timestamp, fromTime, toTime));
  const totalErrors = errors.length;
  const errorTypesDist = countBy(errors, e => e.errorType || 'unknown');

  return {
    overview: {
      totalGames,
      completedGames,
      soloGames,
      multiplayerGames,
      abandonedGames,
      abandonRate,
      uniquePlayers: uniquePlayers.size,
      identifiedPlayers,
      repeatPlayers,
      repeatPlayerRate,
      totalRounds,
      avgRounds,
      avgDuration,
      medianDuration,
      completionRate,
      totalErrors,
    },
    distributions: {
      playerCount: playerCountDist,
      difficulty: difficultyDist,
      musicMode: musicModeDist,
      errorTypes: errorTypesDist,
      winCondition: winConditionDist,
      clientMix: clientMixDist,
      playerClient: playerClientDist,
      campaignSource: campaignSourceDist,
      gameMode: gameModeDist,
      country: countryDist,
      endReason: endReasonDist,
      hourOfDay: hourOfDayDist,
      dayOfWeek: dayOfWeekDist,
    },
    timeSeries: {
      gamesOverTime: Object.entries(gamesOverTime).sort(),
      soloOverTime: Object.entries(soloOverTime).sort(),
      multiplayerOverTime: Object.entries(multiOverTime).sort(),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get paginated list of game sessions
 */
function getSessions({ limit = 50, offset = 0, sort = 'recent', ...filters } = {}) {
  loadSessions();

  let sessions = filterSessions(_sessions, filters);

  if (sort === 'oldest') sessions = sessions.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
  else if (sort === 'longest') sessions = sessions.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0));
  else if (sort === 'rounds') sessions = sessions.slice().sort((a, b) => (b.totalRounds || 0) - (a.totalRounds || 0));
  else sessions = sessions.slice().sort((a, b) => b.startTime.localeCompare(a.startTime));

  const withStatus = sessions.map(s => ({ ...s, status: sessionStatus(s) }));
  const total = withStatus.length;
  const items = withStatus.slice(offset, offset + limit);

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
    const [fromTime, toTime] = rangeBounds(dateFrom, dateTo);
    errors = errors.filter(e => inRange(e.timestamp, fromTime, toTime));
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
  loadVisitors();

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

  loadVisitors();
  const visitorsBefore = Object.keys(_visitors).length;
  Object.keys(_visitors).forEach(id => {
    if (new Date(_visitors[id].last).getTime() < cutoffTime) delete _visitors[id];
  });
  const visitorsRemoved = visitorsBefore - Object.keys(_visitors).length;

  saveSessions();
  saveErrors();
  savePageviews();
  saveVisitors();

  console.log('[Analytics] Cleared old data:', sessionsRemoved, 'sessions,', errorsRemoved, 'errors,', pageviewsRemoved, 'pageviews,', visitorsRemoved, 'visitors');
  return { sessionsRemoved, errorsRemoved, pageviewsRemoved, visitorsRemoved };
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
function recordPageview({ site, path: pagePath, referrer, visitorId, utmSource, utmMedium, utmCampaign, utmContent, userAgent, timezone, headers } = {}) {
  if (userAgent && BOT_UA_RE.test(userAgent)) return null;

  loadPageviews();

  const pv = {
    t: new Date().toISOString(),
    kind: 'pageview',
    site: site === 'game' ? 'game' : site === 'landing' ? 'landing' : 'unknown',
    path: (pagePath || '/').slice(0, 200),
    ref: referrerDomain(referrer),
    utmSource: utmSource ? String(utmSource).slice(0, 80) : null,
    utmMedium: utmMedium ? String(utmMedium).slice(0, 80) : null,
    utmCampaign: utmCampaign ? String(utmCampaign).slice(0, 80) : null,
    utmContent: utmContent ? String(utmContent).slice(0, 80) : null,
    vid: visitorId ? String(visitorId).slice(0, 64) : null,
    country: resolveCountry({ headers: headers || {}, timezone }),
    device: detectDevice(userAgent),
    browser: detectBrowser(userAgent),
    os: detectOS(userAgent),
  };

  pv.isNew = touchVisitor(pv.vid, pv);

  _pageviews.push(pv);
  schedulePageviewsSave();
  return pv;
}

// Events the public /api/track endpoint will store. 'cta_click' is a marketing
// conversion; the rest are product-funnel steps that show where people drop out.
const TRACKED_EVENTS = [
  'cta_click',      // App Store / play-in-browser buttons
  'funnel',         // named step in the play funnel (target = step name)
  'audio_failure',  // a preview clip would not play (target = reason)
];

/**
 * Record a small allowlisted set of conversion events alongside pageviews.
 * Keeping the same visitor and campaign fields lets the admin dashboard show
 * which source produced an App Store or browser-play click without adding a
 * third-party analytics service.
 */
function recordEvent({ event, target, site, path: pagePath, referrer, visitorId, utmSource, utmMedium, utmCampaign, utmContent, userAgent, timezone, headers, meta } = {}) {
  if (userAgent && BOT_UA_RE.test(userAgent)) return null;
  if (!TRACKED_EVENTS.includes(event) || !target) return null;

  loadPageviews();

  const clean = (value, limit = 80) => value ? String(value).slice(0, limit) : null;
  const item = {
    t: new Date().toISOString(),
    kind: 'event',
    event,
    target: clean(target),
    site: site === 'game' ? 'game' : site === 'landing' ? 'landing' : 'unknown',
    path: clean(pagePath || '/', 200),
    ref: referrerDomain(referrer),
    utmSource: clean(utmSource),
    utmMedium: clean(utmMedium),
    utmCampaign: clean(utmCampaign),
    utmContent: clean(utmContent),
    vid: clean(visitorId, 64),
    country: resolveCountry({ headers: headers || {}, timezone }),
    device: detectDevice(userAgent),
    browser: detectBrowser(userAgent),
    os: detectOS(userAgent),
    meta: meta && typeof meta === 'object' ? meta : null,
  };

  item.isNew = touchVisitor(item.vid, item);

  _pageviews.push(item);
  schedulePageviewsSave();
  return item;
}

function topEntries(map, limit = 15) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Aggregated website-visit statistics for the admin dashboard.
 * Supports the same optional filters as the sessions view so acquisition data
 * can be sliced by country, device or campaign.
 */
function getPageviewStats({ dateFrom, dateTo, country, device, site, utmSource } = {}) {
  loadPageviews();

  const [fromTime, toTime] = rangeBounds(dateFrom, dateTo);
  let records = _pageviews.filter(v => inRange(v.t, fromTime, toTime));
  if (country) records = records.filter(v => (v.country || 'unknown') === country);
  if (device) records = records.filter(v => (v.device || 'unknown') === device);
  if (site) records = records.filter(v => v.site === site);
  if (utmSource) records = records.filter(v => (v.utmSource || 'unattributed') === utmSource);

  // Legacy entries do not have `kind`; they are all pageviews.
  const views = records.filter(v => !v.kind || v.kind === 'pageview');
  const events = records.filter(v => v.kind === 'event');
  const ctaEvents = events.filter(v => v.event === 'cta_click' && v.target);
  const funnelEvents = events.filter(v => v.event === 'funnel' && v.target);
  const audioFailures = events.filter(v => v.event === 'audio_failure');

  const uniques = new Set();
  const landingUniques = new Set();
  const gameUniques = new Set();
  const newVisitors = new Set();
  const returningVisitors = new Set();
  let landingViews = 0;
  let gameViews = 0;
  const viewsOverTime = {};
  const newOverTime = {};
  const returningOverTime = {};
  const referrers = {};
  const utmSources = {};
  const utmMediums = {};
  const utmCampaigns = {};
  const utmContents = {};
  const pages = {};
  const countries = {};
  const devices = {};
  const browsers = {};
  const operatingSystems = {};
  const ctaTargets = {};
  const ctaSources = {};
  const ctaBreakdown = {};

  views.forEach(v => {
    if (v.vid) {
      uniques.add(v.vid);
      if (v.isNew) newVisitors.add(v.vid);
      else returningVisitors.add(v.vid);
    }
    if (v.site === 'landing') {
      landingViews++;
      if (v.vid) landingUniques.add(v.vid);
    } else if (v.site === 'game') {
      gameViews++;
      if (v.vid) gameUniques.add(v.vid);
    }
    const day = v.t.split('T')[0];
    viewsOverTime[day] = (viewsOverTime[day] || 0) + 1;
    if (v.isNew) newOverTime[day] = (newOverTime[day] || 0) + 1;
    else returningOverTime[day] = (returningOverTime[day] || 0) + 1;
    referrers[v.ref] = (referrers[v.ref] || 0) + 1;
    if (v.utmSource) utmSources[v.utmSource] = (utmSources[v.utmSource] || 0) + 1;
    if (v.utmMedium) utmMediums[v.utmMedium] = (utmMediums[v.utmMedium] || 0) + 1;
    if (v.utmCampaign) utmCampaigns[v.utmCampaign] = (utmCampaigns[v.utmCampaign] || 0) + 1;
    if (v.utmContent) utmContents[v.utmContent] = (utmContents[v.utmContent] || 0) + 1;
    const pageKey = `${v.site}${v.path}`;
    pages[pageKey] = (pages[pageKey] || 0) + 1;
    countries[v.country || 'unknown'] = (countries[v.country || 'unknown'] || 0) + 1;
    devices[v.device || 'unknown'] = (devices[v.device || 'unknown'] || 0) + 1;
    browsers[v.browser || 'unknown'] = (browsers[v.browser || 'unknown'] || 0) + 1;
    operatingSystems[v.os || 'unknown'] = (operatingSystems[v.os || 'unknown'] || 0) + 1;
  });

  ctaEvents.forEach(v => {
    const source = v.utmSource || 'unattributed';
    ctaTargets[v.target] = (ctaTargets[v.target] || 0) + 1;
    ctaSources[source] = (ctaSources[source] || 0) + 1;
    const breakdownKey = `${source} → ${v.target}`;
    ctaBreakdown[breakdownKey] = (ctaBreakdown[breakdownKey] || 0) + 1;
  });

  const appStoreClicks = ctaEvents.filter(v => v.target.startsWith('app_store_')).length;
  const browserPlayClicks = ctaEvents.filter(v => v.target.startsWith('play_browser_')).length;

  // Per-channel table: views, unique visitors and CTA clicks side by side, so a
  // source can be judged on conversion rather than raw traffic.
  const channelMap = {};
  const channelUniques = {};
  const addChannel = (key, field) => {
    if (!channelMap[key]) channelMap[key] = { channel: key, views: 0, visitors: 0, ctaClicks: 0, appStore: 0, browserPlay: 0 };
    channelMap[key][field]++;
  };
  views.forEach(v => {
    const key = v.utmSource || v.ref || 'direct';
    addChannel(key, 'views');
    if (v.vid) {
      channelUniques[key] = channelUniques[key] || new Set();
      channelUniques[key].add(v.vid);
    }
  });
  ctaEvents.forEach(v => {
    const key = v.utmSource || v.ref || 'direct';
    addChannel(key, 'ctaClicks');
    if (v.target.startsWith('app_store_')) addChannel(key, 'appStore');
    if (v.target.startsWith('play_browser_')) addChannel(key, 'browserPlay');
  });
  const channels = Object.values(channelMap).map(c => ({
    ...c,
    visitors: channelUniques[c.channel] ? channelUniques[c.channel].size : 0,
  })).sort((a, b) => b.views - a.views).slice(0, 25);

  // Product funnel steps recorded by the client (landing → lobby → game).
  const funnelSteps = {};
  const funnelStepUniques = {};
  funnelEvents.forEach(v => {
    funnelSteps[v.target] = (funnelSteps[v.target] || 0) + 1;
    if (v.vid) {
      funnelStepUniques[v.target] = funnelStepUniques[v.target] || new Set();
      funnelStepUniques[v.target].add(v.vid);
    }
  });

  return {
    overview: {
      totalViews: views.length,
      uniqueVisitors: uniques.size,
      newVisitors: newVisitors.size,
      returningVisitors: returningVisitors.size,
      returningRate: uniques.size > 0 ? Math.round((returningVisitors.size / uniques.size) * 100) : 0,
      landingViews,
      landingUniques: landingUniques.size,
      gameViews,
      gameUniques: gameUniques.size,
      appStoreClicks,
      browserPlayClicks,
      audioFailures: audioFailures.length,
    },
    timeSeries: {
      viewsOverTime: Object.entries(viewsOverTime).sort(),
      newVisitorsOverTime: Object.entries(newOverTime).sort(),
      returningVisitorsOverTime: Object.entries(returningOverTime).sort(),
    },
    referrers: topEntries(referrers),
    utmSources: topEntries(utmSources),
    utmMediums: topEntries(utmMediums),
    utmCampaigns: topEntries(utmCampaigns),
    utmContents: topEntries(utmContents),
    topPages: topEntries(pages),
    countries: topEntries(countries, 30),
    devices: topEntries(devices),
    browsers: topEntries(browsers),
    operatingSystems: topEntries(operatingSystems),
    ctaTargets: topEntries(ctaTargets),
    ctaSources: topEntries(ctaSources),
    ctaBreakdown: topEntries(ctaBreakdown),
    channels,
    funnelSteps: Object.entries(funnelStepUniques)
      .map(([step, set]) => [step, set.size, funnelSteps[step]])
      .sort((a, b) => b[1] - a[1]),
    timestamp: new Date().toISOString(),
  };
}

// --- Audience: loyalty, retention and churn -----------------------------

const DAY_MS = 86400000;

/**
 * Who keeps coming back and who has drifted away.
 * Built from durable visitor profiles rather than the rolling pageview log, so
 * the numbers stay right once old raw hits are trimmed.
 */
function getVisitorStats({ dateFrom, dateTo, country, device } = {}) {
  loadVisitors();

  const [fromTime, toTime] = rangeBounds(dateFrom, dateTo);
  // A visitor counts for the range if they were active at any point inside it.
  let profiles = Object.entries(_visitors)
    .map(([vid, v]) => ({ vid, ...v }))
    .filter(v => new Date(v.last).getTime() >= fromTime && new Date(v.first).getTime() <= toTime);
  if (country) profiles = profiles.filter(v => (v.country || 'unknown') === country);
  if (device) profiles = profiles.filter(v => (v.device || 'unknown') === device);

  const now = Date.now();
  const total = profiles.length;
  const oneAndDone = profiles.filter(v => (v.days || []).length <= 1).length;
  const returned = total - oneAndDone;
  const players = profiles.filter(v => (v.games || 0) > 0);
  const repeatPlayers = players.filter(v => (v.games || 0) > 1);

  // How long each visitor has been quiet: the churn picture.
  const lifecycle = { active: 0, cooling: 0, dormant: 0, churned: 0 };
  profiles.forEach(v => {
    const quietDays = (now - new Date(v.last).getTime()) / DAY_MS;
    if (quietDays <= 7) lifecycle.active++;
    else if (quietDays <= 14) lifecycle.cooling++;
    else if (quietDays <= 30) lifecycle.dormant++;
    else lifecycle.churned++;
  });

  const visitFrequency = {};
  profiles.forEach(v => {
    const n = (v.days || []).length;
    const bucket = n <= 1 ? '1 day' : n <= 2 ? '2 days' : n <= 4 ? '3-4 days' : n <= 7 ? '5-7 days' : '8+ days';
    visitFrequency[bucket] = (visitFrequency[bucket] || 0) + 1;
  });

  const gamesPerPlayer = {};
  players.forEach(v => {
    const n = v.games || 0;
    const bucket = n === 1 ? '1 game' : n <= 3 ? '2-3 games' : n <= 9 ? '4-9 games' : '10+ games';
    gamesPerPlayer[bucket] = (gamesPerPlayer[bucket] || 0) + 1;
  });

  // Weekly acquisition cohorts: of everyone first seen in week W, what share
  // came back in each following week.
  const cohorts = {};
  profiles.forEach(v => {
    const key = weekKey(v.first);
    if (!cohorts[key]) cohorts[key] = { cohort: key, size: 0, weeks: [0, 0, 0, 0, 0] };
    const c = cohorts[key];
    c.size++;
    const firstDay = dayNumber(v.first);
    const seenWeeks = new Set((v.days || []).map(d => Math.floor((d - firstDay) / 7)));
    for (let w = 0; w < 5; w++) if (seenWeeks.has(w)) c.weeks[w]++;
  });
  const retentionCohorts = Object.values(cohorts)
    .sort((a, b) => b.cohort.localeCompare(a.cohort))
    .slice(0, 12)
    .map(c => ({
      ...c,
      rates: c.weeks.map(n => (c.size > 0 ? Math.round((n / c.size) * 100) : 0)),
    }));

  // Classic day-N retention across everyone, measured from their own first day.
  const dayN = { d1: 0, d7: 0, d30: 0 };
  const dayNEligible = { d1: 0, d7: 0, d30: 0 };
  profiles.forEach(v => {
    const firstDay = dayNumber(v.first);
    const ageDays = Math.floor((now - new Date(v.first).getTime()) / DAY_MS);
    const offsets = new Set((v.days || []).map(d => d - firstDay));
    [['d1', 1, 2], ['d7', 7, 8], ['d30', 30, 31]].forEach(([key, start, end]) => {
      if (ageDays < end) return; // not old enough to judge yet
      dayNEligible[key]++;
      for (let off = start; off <= end; off++) if (offsets.has(off)) { dayN[key]++; return; }
    });
  });
  const dayNRetention = {
    d1: dayNEligible.d1 ? Math.round((dayN.d1 / dayNEligible.d1) * 100) : null,
    d7: dayNEligible.d7 ? Math.round((dayN.d7 / dayNEligible.d7) * 100) : null,
    d30: dayNEligible.d30 ? Math.round((dayN.d30 / dayNEligible.d30) * 100) : null,
    eligible: dayNEligible,
  };

  const byCountry = countBy(profiles, v => v.country || 'unknown');
  const byDevice = countBy(profiles, v => v.device || 'unknown');
  const byBrowser = countBy(profiles, v => v.browser || 'unknown');
  const byOS = countBy(profiles, v => v.os || 'unknown');
  const byFirstSource = countBy(profiles, v => v.firstUtmSource || v.firstRef || 'direct');
  const byFirstSite = countBy(profiles, v => v.firstSite || 'unknown');

  // Loyal visitors worth eyeballing individually.
  const topVisitors = profiles
    .slice()
    .sort((a, b) => ((b.games || 0) - (a.games || 0)) || ((b.days || []).length - (a.days || []).length))
    .slice(0, 25)
    .map(v => ({
      vid: v.vid,
      first: v.first,
      last: v.last,
      days: (v.days || []).length,
      views: v.views || 0,
      games: v.games || 0,
      country: v.country || 'unknown',
      device: v.device || 'unknown',
      source: v.firstUtmSource || v.firstRef || 'direct',
    }));

  // New-visitor acquisition per day, from profiles (not the trimmed hit log).
  const newVisitorsByDay = {};
  profiles.forEach(v => {
    const day = String(v.first).split('T')[0];
    newVisitorsByDay[day] = (newVisitorsByDay[day] || 0) + 1;
  });

  return {
    overview: {
      totalVisitors: total,
      oneAndDone,
      returned,
      returnRate: total > 0 ? Math.round((returned / total) * 100) : 0,
      players: players.length,
      repeatPlayers: repeatPlayers.length,
      repeatPlayerRate: players.length > 0 ? Math.round((repeatPlayers.length / players.length) * 100) : 0,
      visitorToPlayerRate: total > 0 ? Math.round((players.length / total) * 100) : 0,
      activeLast7: lifecycle.active,
      churned: lifecycle.churned,
    },
    lifecycle,
    dayNRetention,
    retentionCohorts,
    visitFrequency,
    gamesPerPlayer,
    byCountry: topEntries(byCountry, 30),
    byDevice: topEntries(byDevice),
    byBrowser: topEntries(byBrowser),
    byOS: topEntries(byOS),
    byFirstSource: topEntries(byFirstSource, 20),
    byFirstSite: topEntries(byFirstSite),
    newVisitorsByDay: Object.entries(newVisitorsByDay).sort(),
    topVisitors,
    timestamp: new Date().toISOString(),
  };
}

// --- Health: what is going wrong ----------------------------------------

// Collapse ids, codes and numbers out of a message so the same fault groups
// into one row instead of a thousand near-identical ones.
function fingerprintMessage(message) {
  return String(message || '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\b\d+\b/g, '<n>')
    .slice(0, 160);
}

/**
 * Everything that points at a bug: server errors, client crashes, games people
 * walked out of, and audio that would not play.
 */
function getHealthStats({ dateFrom, dateTo } = {}) {
  loadErrors();
  loadSessions();
  loadPageviews();

  const [fromTime, toTime] = rangeBounds(dateFrom, dateTo);
  const errors = _errors.filter(e => inRange(e.timestamp, fromTime, toTime));
  const sessions = _sessions.filter(s => inRange(s.startTime, fromTime, toTime));
  const events = _pageviews.filter(v => v.kind === 'event' && inRange(v.t, fromTime, toTime));

  const errorsOverTime = {};
  errors.forEach(e => {
    const day = e.timestamp.split('T')[0];
    errorsOverTime[day] = (errorsOverTime[day] || 0) + 1;
  });

  const grouped = {};
  errors.forEach(e => {
    const key = `${e.errorType || 'unknown'}|${fingerprintMessage(e.message)}`;
    if (!grouped[key]) {
      grouped[key] = {
        errorType: e.errorType || 'unknown',
        message: fingerprintMessage(e.message),
        count: 0,
        firstSeen: e.timestamp,
        lastSeen: e.timestamp,
        sample: e,
      };
    }
    const g = grouped[key];
    g.count++;
    if (e.timestamp < g.firstSeen) g.firstSeen = e.timestamp;
    if (e.timestamp > g.lastSeen) { g.lastSeen = e.timestamp; g.sample = e; }
  });
  const topIssues = Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 25);

  // Where games die: how far people got before giving up.
  const abandoned = sessions.filter(s => sessionStatus(s) === 'abandoned');
  const abandonByRound = {};
  abandoned.forEach(s => {
    const r = s.totalRounds || 0;
    const bucket = r === 0 ? '0 (never played a round)' : r <= 2 ? '1-2 rounds' : r <= 5 ? '3-5 rounds' : r <= 10 ? '6-10 rounds' : '11+ rounds';
    abandonByRound[bucket] = (abandonByRound[bucket] || 0) + 1;
  });
  const abandonByMode = countBy(abandoned, s => s.gameMode || 'multiplayer');
  const abandonReasons = countBy(abandoned, s => s.endReason || 'never_ended');
  const abandonByClient = countBy(abandoned, s => s.clientMix || 'unknown');
  const zeroRoundGames = sessions.filter(s => (s.totalRounds || 0) === 0).length;

  const audioFailures = events.filter(v => v.event === 'audio_failure');
  const audioFailureReasons = countBy(audioFailures, v => v.target || 'unknown');
  const audioFailureBrowsers = countBy(audioFailures, v => v.browser || 'unknown');

  const clientCrashes = errors.filter(e => e.errorType === 'client_js' || e.errorType === 'client_unhandled_rejection');

  return {
    overview: {
      totalErrors: errors.length,
      clientCrashes: clientCrashes.length,
      serverErrors: errors.length - clientCrashes.length,
      gamesStarted: sessions.length,
      abandonedGames: abandoned.length,
      abandonRate: sessions.length > 0 ? Math.round((abandoned.length / sessions.length) * 100) : 0,
      zeroRoundGames,
      zeroRoundRate: sessions.length > 0 ? Math.round((zeroRoundGames / sessions.length) * 100) : 0,
      audioFailures: audioFailures.length,
      errorsPerGame: sessions.length > 0 ? Math.round((errors.length / sessions.length) * 100) / 100 : 0,
    },
    errorsOverTime: Object.entries(errorsOverTime).sort(),
    errorTypes: topEntries(countBy(errors, e => e.errorType || 'unknown'), 20),
    topIssues,
    abandonByRound,
    abandonByMode,
    abandonReasons,
    abandonByClient,
    audioFailureReasons: topEntries(audioFailureReasons),
    audioFailureBrowsers: topEntries(audioFailureBrowsers),
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
  recordEvent,
  getPageviewStats,
  getVisitorStats,
  getHealthStats,
  noteVisitorGame,
};
