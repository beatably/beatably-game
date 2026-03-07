/**
 * Feedback Database (file-backed)
 * - Stores user-submitted feedback messages
 * - Uses the same persistent disk pattern as analytics.js
 */

const fs = require('fs');
const path = require('path');

function getCacheDir() {
  if (process.env.NODE_ENV === 'production') {
    const persistentPath = '/var/data/cache';
    const deployedPath = path.join(__dirname, 'cache');
    if (fs.existsSync(persistentPath)) {
      return persistentPath;
    }
    return deployedPath;
  }
  return path.join(__dirname, 'cache');
}

const CACHE_DIR = getCacheDir();
const FEEDBACK_FILE = path.join(CACHE_DIR, 'feedback.json');
const MAX_FEEDBACK = 5000;

let _feedback = [];
let _loaded = false;

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn('[Feedback] Failed to ensure cache dir:', e && e.message);
  }
}

function load() {
  if (_loaded) return;
  ensureCacheDir();
  try {
    if (fs.existsSync(FEEDBACK_FILE)) {
      const raw = fs.readFileSync(FEEDBACK_FILE, 'utf8');
      _feedback = JSON.parse(raw);
      if (!Array.isArray(_feedback)) _feedback = [];
      console.log('[Feedback] Loaded', _feedback.length, 'feedback entries from disk');
    } else {
      _feedback = [];
      save();
    }
    _loaded = true;
  } catch (e) {
    console.warn('[Feedback] Failed to load feedback:', e && e.message);
    _feedback = [];
    _loaded = true;
  }
}

function save() {
  ensureCacheDir();
  try {
    if (_feedback.length > MAX_FEEDBACK) {
      _feedback = _feedback.slice(-MAX_FEEDBACK);
    }
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(_feedback, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn('[Feedback] Failed to save feedback:', e && e.message);
    return false;
  }
}

/**
 * Record a new feedback entry
 */
function recordFeedback({ message, context }) {
  load();
  const entry = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    message: String(message || '').slice(0, 2000),
    context: String(context || '').slice(0, 50),
    timestamp: new Date().toISOString(),
  };
  _feedback.push(entry);
  save();
  console.log('[Feedback] Recorded feedback:', entry.id, 'Context:', entry.context);
  return entry;
}

/**
 * Get feedback entries with pagination
 */
function getFeedback({ limit = 100, offset = 0 } = {}) {
  load();
  const sorted = _feedback.slice().reverse(); // newest first
  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
  };
}

/**
 * Delete a feedback entry by id
 */
function deleteFeedback(id) {
  load();
  const before = _feedback.length;
  _feedback = _feedback.filter(e => e.id !== id);
  if (_feedback.length < before) {
    save();
    return true;
  }
  return false;
}

module.exports = { recordFeedback, getFeedback, deleteFeedback };
