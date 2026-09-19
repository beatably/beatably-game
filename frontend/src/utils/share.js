// One share entry point for every button in the app, so the wording, the
// fallback and the analytics stay identical wherever it is used.
import { trackShare } from './track';

const SHARE_URL = 'https://beatably.app';

/**
 * Open the native share sheet, falling back to the clipboard where there is
 * none (most desktop browsers). Returns 'shared' | 'copied' | 'cancelled' |
 * 'failed' so the caller can show the right confirmation.
 *
 * The share is recorded either way: what we want to know is how often people
 * try to share, not which mechanism their browser happened to use.
 */
export async function shareBeatably({ placement, text }) {
  trackShare(placement);

  const data = {
    title: 'Beatably',
    text: text || 'Play Beatably — the music timeline party game!',
    url: SHARE_URL,
  };

  if (navigator.share) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      // The user backing out of the sheet is not an error.
      if (err?.name === 'AbortError') return 'cancelled';
      console.error('Share failed:', err);
      return 'failed';
    }
  }

  try {
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
    return 'copied';
  } catch (err) {
    console.error('Copy failed:', err);
    return 'failed';
  }
}
