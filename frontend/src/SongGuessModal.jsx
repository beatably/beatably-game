import React, { useState, useEffect, useRef } from 'react';
import BottomCard from './components/design/BottomCard';

function SongGuessModal({ isOpen, onClose, onGuessSong, onSkipSongGuess }) {
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const songTitleInputRef = useRef(null);

  // Auto-focus the first input when modal opens
  useEffect(() => {
    if (isOpen && songTitleInputRef.current) {
      // Multiple attempts with different delays to ensure focus works on mobile
      const focusInput = () => {
        if (songTitleInputRef.current) {
          songTitleInputRef.current.focus();
          // Force cursor to appear and keyboard to show on mobile
          songTitleInputRef.current.click();
          // Set selection to end of input (in case there's any text)
          songTitleInputRef.current.setSelectionRange(
            songTitleInputRef.current.value.length,
            songTitleInputRef.current.value.length
          );
        }
      };

      // Try multiple times with different delays for better mobile compatibility
      setTimeout(focusInput, 100);
      setTimeout(focusInput, 200);
      setTimeout(focusInput, 300);
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSongTitle('');
      setSongArtist('');
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        // Ctrl/Cmd + Enter to submit
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, songTitle, songArtist]);

  const handleSubmit = () => {
    if (songTitle.trim() && songArtist.trim()) {
      onGuessSong(songTitle.trim(), songArtist.trim());
      onClose();
    }
  };

  const handleSkip = () => {
    onSkipSongGuess();
    onClose();
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleSubmit();
  };

  return (
    <BottomCard open={isOpen} onClose={onClose}>
      <div className="px-6 pt-6 pb-4 max-w-sm mx-auto w-full">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground mb-2">Guess the Song</h2>
          <p className="text-sm text-muted-foreground">
            Both title and artist must be correct for the bonus!
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <input
              ref={songTitleInputRef}
              type="text"
              placeholder="Song title"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              className="bg-input border-border text-foreground h-11 focus:ring-primary w-full rounded-md border px-3 py-2"
              autoComplete="off"
              autoFocus={isOpen}
              inputMode="text"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          <div>
            <input
              type="text"
              placeholder="Artist"
              value={songArtist}
              onChange={(e) => setSongArtist(e.target.value)}
              className="bg-input border-border text-foreground h-11 focus:ring-primary w-full rounded-md border px-3 py-2"
              autoComplete="off"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline rounded-md"
              style={{ background: 'transparent', WebkitTapHighlightColor: 'transparent' }}
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={!songTitle.trim() || !songArtist.trim()}
              className={`flex-1 h-12 px-4 font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline rounded-md ${
                songTitle.trim() && songArtist.trim()
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-input text-muted-foreground cursor-not-allowed'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Submit Guess
            </button>
          </div>
        </form>
      </div>
    </BottomCard>
  );
}

export default SongGuessModal;
