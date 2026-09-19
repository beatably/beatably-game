// Share wording, kept in a module of its own with no imports so it can be
// unit-tested directly (see e2e/share-copy.mjs) and so the web and iOS copy can
// be compared side by side. The iOS twin lives in ios/Beatably/Analytics.swift.

export const SHARE_URL = 'https://beatably.app';
export const DEFAULT_MESSAGE =
  'Beatably — hear it, place it, steal it. The music timeline party game.';

/**
 * Put the message and the link into one string.
 *
 * The link must live INSIDE the text. Handing the Web Share API a `url`
 * alongside `text` makes most targets — the iOS sheet in particular — share
 * only the link and drop the message, which is how the score went missing.
 */
export function composeShare(message) {
  return `${message || DEFAULT_MESSAGE}\n\n${SHARE_URL}`;
}

/**
 * Wording for a finished solo run.
 * A bad run still deserves a shareable line, so a zero becomes a dare rather
 * than a boast, and the world rank is only named when it is worth naming.
 */
export function soloShareText({ score, rank } = {}) {
  if (!score || score < 1) return 'I got zero songs right on Beatably 🎵 Surely you can do better?';
  if (score === 1) return 'I managed exactly 1 song on Beatably 🎵 Think you can beat me?';
  const place = rank && rank <= 10 ? ` I'm #${rank} in the world right now.` : '';
  return `I placed ${score} songs in a row on Beatably 🎵${place} Think you can beat me?`;
}

/** Wording for the end of a multiplayer game. */
export function multiplayerShareText({ iWon, winnerName, score } = {}) {
  if (iWon) {
    const detail = score ? ` ${score} songs in the right order.` : '';
    return `I just won a game of Beatably 🏆${detail} Think you can beat me?`;
  }
  if (winnerName) return `${winnerName} just won our game of Beatably 🎵 Can you do better?`;
  return 'We just played Beatably 🎵 Can you do better?';
}
