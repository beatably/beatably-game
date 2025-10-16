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

// In-memory caches
let _sessions = [];
let _errors = [];
let _sessionsLoaded = false;
let _errorsLoaded = false;

// Configuration
const MAX_SESSIONS = 10000; // Keep last 10k sessions
const MAX_ERRORS = 5000; // Keep last 5k errors

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
  
  // Games over time (by day)
  const gamesOverTime = {};
  sessions.forEach(s => {
    const date = s.startTime.split('T')[0]; // YYYY-MM-DD
    gamesOverTime[date] = (gamesOverTime[date] || 0) + 1;
  });
  
  // Error statistics
  const totalErrors = _errors.length;
  const errorTypesDist = {};
  _errors.forEach(e => {
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
  
  const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
  
  const sessionsBefore = _sessions.length;
  _sessions = _sessions.filter(s => new Date(s.startTime).getTime() >= cutoffTime);
  const sessionsRemoved = sessionsBefore - _sessions.length;
  
  const errorsBefore = _errors.length;
  _errors = _errors.filter(e => new Date(e.timestamp).getTime() >= cutoffTime);
  const errorsRemoved = errorsBefore - _errors.length;
  
  saveSessions();
  saveErrors();
  
  console.log('[Analytics] Cleared old data:', sessionsRemoved, 'sessions,', errorsRemoved, 'errors');
  return { sessionsRemoved, errorsRemoved };
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
};
