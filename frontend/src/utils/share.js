// One share entry point for every button in the app, so the wording, the
// fallback and the analytics stay identical wherever it is used.
import { trackShare } from './track';
import { composeShare, soloShareText, multiplayerShareText } from './shareText';

// Re-exported so callers import their wording from the same place they share.
export { soloShareText, multiplayerShareText };

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

  const body = composeShare(text);

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Beatably', text: body });
      return 'shared';
    } catch (err) {
      // The user backing out of the sheet is not an error.
      if (err?.name === 'AbortError') return 'cancelled';
      console.error('Share failed:', err);
      return 'failed';
    }
  }

  try {
    await navigator.clipboard.writeText(body);
    return 'copied';
  } catch (err) {
    console.error('Copy failed:', err);
    return 'failed';
  }
}
