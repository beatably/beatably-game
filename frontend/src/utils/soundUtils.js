// Sound utility functions for the game.
// Sound set + volumes ported from iOS (ios/Beatably/Audio/SoundManager.swift).

/**
 * When true, all sound effect playback is suppressed (e.g. creator with music playing)
 */
let suppressSoundEffects = false;

export function setSuppressSoundEffects(suppress) {
  suppressSoundEffects = suppress;
}

/**
 * Web Audio state (preferred for low-latency SFX)
 */
let audioContext = null;
let webAudioSupported = false;
let webAudioInitAttempted = false;
const audioBufferCache = new Map();
const bufferLoadPromises = new Map();

/**
 * Fallback HTMLAudio elements (used when Web Audio is unavailable)
 */
const htmlAudioCache = new Map();

const SOUND_CONFIG = {
  place: { url: '/sounds/place.mp3', volume: 0.45 }, // card placed on timeline
  correct: { url: '/sounds/correct.mp3', volume: 0.5 }, // correct placement / challenge win
  challenge: { url: '/sounds/challenge.mp3', volume: 0.55 }, // challenge initiated
  credit: { url: '/sounds/credit.mp3', volume: 0.6 }, // another player spends a credit
  bonus: { url: '/sounds/bonus.mp3', volume: 0.6 }, // you spent a credit
  casino: { url: '/sounds/casino.mp3', volume: 0.6 }, // someone guessed the song (coin award)
  win: { url: '/sounds/win.mp3', volume: 0.6 }, // you won the game
  lose: { url: '/sounds/lose.mp3', volume: 0.5 }, // wrong placement / you lost
};

function ensureAudioContext() {
  if (audioContext) return audioContext;
  if (webAudioInitAttempted) return null;

  webAudioInitAttempted = true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      webAudioSupported = false;
      return null;
    }

    audioContext = new Ctx({ latencyHint: 'interactive' });
    webAudioSupported = true;
    return audioContext;
  } catch (error) {
    webAudioSupported = false;
    console.warn('Web Audio not supported, using HTMLAudio fallback:', error);
    return null;
  }
}

async function unlockAudioContext() {
  const ctx = ensureAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch (error) {
    console.warn('Could not unlock audio context:', error);
    return false;
  }
}

async function loadBuffer(key, url) {
  const ctx = ensureAudioContext();
  if (!ctx) return null;

  if (audioBufferCache.has(key)) {
    return audioBufferCache.get(key);
  }

  if (bufferLoadPromises.has(key)) {
    return bufferLoadPromises.get(key);
  }

  const promise = (async () => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    audioBufferCache.set(key, audioBuffer);
    return audioBuffer;
  })()
    .catch((error) => {
      console.warn(`Could not preload sound buffer (${key}):`, error);
      return null;
    })
    .finally(() => {
      bufferLoadPromises.delete(key);
    });

  bufferLoadPromises.set(key, promise);
  return promise;
}

function playWebAudioBuffer(key, volume) {
  const ctx = ensureAudioContext();
  const buffer = audioBufferCache.get(key);

  if (!ctx || !buffer || ctx.state !== 'running') {
    return false;
  }

  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    return true;
  } catch (error) {
    console.warn(`Could not play web audio buffer (${key}):`, error);
    return false;
  }
}

function getHtmlAudio(key) {
  const config = SOUND_CONFIG[key];
  if (!config) return null;
  if (!htmlAudioCache.has(key)) {
    try {
      const audio = new Audio(config.url);
      audio.volume = config.volume;
      audio.preload = 'auto';
      htmlAudioCache.set(key, audio);
    } catch (error) {
      console.warn(`Audio not supported (${key}):`, error);
      return null;
    }
  }
  return htmlAudioCache.get(key);
}

/**
 * Play a game sound by key (see SOUND_CONFIG).
 */
export function playSound(key) {
  if (suppressSoundEffects) return;
  const config = SOUND_CONFIG[key];
  if (!config) {
    console.warn(`Unknown sound key: ${key}`);
    return;
  }
  try {
    // Prefer low-latency Web Audio if ready
    if (webAudioSupported && playWebAudioBuffer(key, config.volume)) {
      return;
    }

    // Fallback to HTMLAudio
    const audio = getHtmlAudio(key);
    if (audio) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn(`Could not play sound (${key}):`, error);
        });
      }
    }
  } catch (error) {
    // Silently fail if audio doesn't work - don't break the game
    console.warn(`Could not play sound (${key}):`, error);
  }
}

/**
 * Legacy alias: card placement tap.
 */
export function playClickSound() {
  playSound('place');
}

/**
 * Preload audio (call this on user interaction to prepare audio)
 */
export function preloadAudio() {
  // Initialize and unlock Web Audio ASAP (on user gesture)
  ensureAudioContext();
  unlockAudioContext();

  // Preload Web Audio buffers for low-latency playback
  for (const [key, config] of Object.entries(SOUND_CONFIG)) {
    loadBuffer(key, config.url);
    // Initialize HTMLAudio fallback as well
    getHtmlAudio(key);
  }
}
