// Sound utility functions for the game

/**
 * Fallback HTMLAudio elements (used when Web Audio is unavailable)
 */
let clickAudio = null;
let correctGuessAudio = null;
let incorrectGuessAudio = null;

/**
 * Web Audio state (preferred for low-latency SFX)
 */
let audioContext = null;
let webAudioSupported = false;
let webAudioInitAttempted = false;
const audioBufferCache = new Map();
const bufferLoadPromises = new Map();

const SOUND_CONFIG = {
  click: { url: '/sounds/drop_card_3.mp3', volume: 0.4 },
  correct: { url: '/sounds/correct_guess.mp3', volume: 0.5 },
  incorrect: { url: '/sounds/incorrect_guess.mp3', volume: 0.5 },
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

/**
 * Initialize fallback HTMLAudio element
 */
function initializeAudio() {
  if (!clickAudio) {
    try {
      clickAudio = new Audio(SOUND_CONFIG.click.url);
      clickAudio.volume = SOUND_CONFIG.click.volume;
      clickAudio.preload = 'auto';
    } catch (error) {
      console.warn('Audio not supported:', error);
    }
  }
}

/**
 * Initialize fallback HTMLAudio element for correct guess
 */
function initializeCorrectGuessAudio() {
  if (!correctGuessAudio) {
    try {
      correctGuessAudio = new Audio(SOUND_CONFIG.correct.url);
      correctGuessAudio.volume = SOUND_CONFIG.correct.volume;
      correctGuessAudio.preload = 'auto';
    } catch (error) {
      console.warn('Correct guess audio not supported:', error);
    }
  }
}

/**
 * Initialize fallback HTMLAudio element for incorrect guess
 */
function initializeIncorrectGuessAudio() {
  if (!incorrectGuessAudio) {
    try {
      incorrectGuessAudio = new Audio(SOUND_CONFIG.incorrect.url);
      incorrectGuessAudio.volume = SOUND_CONFIG.incorrect.volume;
      incorrectGuessAudio.preload = 'auto';
    } catch (error) {
      console.warn('Incorrect guess audio not supported:', error);
    }
  }
}

/**
 * Play a click sound when a card is dropped
 */
export function playClickSound() {
  try {
    // Prefer low-latency Web Audio if ready
    if (webAudioSupported && playWebAudioBuffer('click', SOUND_CONFIG.click.volume)) {
      return;
    }

    // Fallback to HTMLAudio
    if (!clickAudio) {
      initializeAudio();
    }
    if (clickAudio) {
      clickAudio.currentTime = 0;
      const playPromise = clickAudio.play();

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('Could not play click sound:', error);
        });
      }
    }
  } catch (error) {
    // Silently fail if audio doesn't work - don't break the game
    console.warn('Could not play click sound:', error);
  }
}

/**
 * Play a correct guess sound
 */
export function playCorrectGuessSound() {
  try {
    // Prefer low-latency Web Audio if ready
    if (webAudioSupported && playWebAudioBuffer('correct', SOUND_CONFIG.correct.volume)) {
      return;
    }

    // Fallback to HTMLAudio
    if (!correctGuessAudio) {
      initializeCorrectGuessAudio();
    }
    if (correctGuessAudio) {
      correctGuessAudio.currentTime = 0;
      const playPromise = correctGuessAudio.play();

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('Could not play correct guess sound:', error);
        });
      }
    }
  } catch (error) {
    // Silently fail if audio doesn't work - don't break the game
    console.warn('Could not play correct guess sound:', error);
  }
}

/**
 * Play an incorrect guess sound
 */
export function playIncorrectGuessSound() {
  try {
    // Prefer low-latency Web Audio if ready
    if (webAudioSupported && playWebAudioBuffer('incorrect', SOUND_CONFIG.incorrect.volume)) {
      return;
    }

    // Fallback to HTMLAudio
    if (!incorrectGuessAudio) {
      initializeIncorrectGuessAudio();
    }
    if (incorrectGuessAudio) {
      incorrectGuessAudio.currentTime = 0;
      const playPromise = incorrectGuessAudio.play();

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('Could not play incorrect guess sound:', error);
        });
      }
    }
  } catch (error) {
    // Silently fail if audio doesn't work - don't break the game
    console.warn('Could not play incorrect guess sound:', error);
  }
}

/**
 * Preload audio (call this on user interaction to prepare audio)
 */
export function preloadAudio() {
  // Initialize and unlock Web Audio ASAP (on user gesture)
  ensureAudioContext();
  unlockAudioContext();

  // Preload Web Audio buffers for low-latency playback
  loadBuffer('click', SOUND_CONFIG.click.url);
  loadBuffer('correct', SOUND_CONFIG.correct.url);
  loadBuffer('incorrect', SOUND_CONFIG.incorrect.url);

  // Initialize HTMLAudio fallback as well
  initializeAudio();
  initializeCorrectGuessAudio();
  initializeIncorrectGuessAudio();
}
