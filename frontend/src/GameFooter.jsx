import React, { useState } from "react";
import SongGuessModal from './SongGuessModal';
import { ResolvedIcon, SheetButton } from './ChallengeSheet';
import { CoinView } from './components/design/CoinView';
import { usePreviewMode } from './contexts/PreviewModeContext';
import {
  isAirPlaySupported,
  showAirPlayPicker,
  onAirPlayAvailabilityChange
} from './utils/castUtils';

const blurOnTouch = (e) => e.currentTarget.blur();

function GameFooter({
  currentCard,
  showFeedback,
  feedback,
  onContinue,
  players,
  currentPlayerId,
  myPlayerId,
  isMyTurn,
  phase,
  onUseToken,
  onGuessSong,
  challenge,
  onInitiateChallenge,
  onContinueAfterChallenge,
  onSkipChallenge,
  onSkipSongGuess,
  lastSongGuess,
  isPlayingMusic,
  isCreator,
  socketRef,
  roomCode,
  pendingDropIndex,
  onConfirmDrop,
  onCancelDrop,
  placeCardError
}) {
  // Preview Mode context
  const {
    isPreviewMode,
    isPlaying: previewIsPlaying,
    currentTime: previewCurrentTime,
    duration: previewDuration,
    playPreview,
    pausePreview,
    resumePreview,
    stopPreview,
    getMediaElement
  } = usePreviewMode();

  // Determine if we're using preview mode (only creator uses it)
  const usingPreviewMode = isPreviewMode && isCreator;

  // ─── AirPlay state (Safari/iOS) ─────────────────────────────────────────
  const [airPlayAvailable, setAirPlayAvailable] = React.useState(false);

  // Detect AirPlay support (Safari/iOS only)
  React.useEffect(() => {
    if (!isCreator) return;

    const supported = isAirPlaySupported();
    console.log('[GameFooter] AirPlay supported:', supported);

    if (supported) {
      // AirPlay is supported — check if devices are available
      setAirPlayAvailable(true);

      // Listen for AirPlay device availability changes
      const mediaEl = getMediaElement?.();
      if (mediaEl) {
        const cleanup = onAirPlayAvailabilityChange(mediaEl, (available) => {
          console.log('[GameFooter] AirPlay devices available:', available);
          setAirPlayAvailable(available);
        });
        return cleanup;
      }
    }
  }, [isCreator, getMediaElement]);

  // Handle AirPlay button click
  const handleAirPlayClick = () => {
    const mediaEl = getMediaElement?.();
    if (mediaEl) {
      showAirPlayPicker(mediaEl);
    }
  };

  // Show AirPlay button when supported (Safari/iOS)
  const showAirPlayButton = isCreator && airPlayAvailable;

  // Track local playing state for UI
  const [localIsPlaying, setLocalIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(30); // Default 30 seconds

  // Track when a new song has been loaded but not yet played
  const [showNewSongMessage, setShowNewSongMessage] = React.useState(false);
  const lastCardIdRef = React.useRef(null);

  // Track if play has been pressed at least once for current song
  const [, setHasPlayedOnce] = React.useState(false);

  // In preview mode, use preview playing state
  const actualIsPlaying = usingPreviewMode ? previewIsPlaying : localIsPlaying;

  // Use preview mode progress/duration when active
  const displayProgress = usingPreviewMode ? previewCurrentTime : progress;
  const displayDuration = usingPreviewMode ? previewDuration : duration;

  // Fallback progress for non-creators - sync with creator's music state
  React.useEffect(() => {
    // For non-creators, sync with the actual playing state from creator
    if (!actualIsPlaying) return;
    if (progress >= duration) {
      setLocalIsPlaying(false);
      return;
    }
    const interval = setInterval(() => setProgress((p) => Math.min(p + 1, duration)), 1000);
    return () => clearInterval(interval);
  }, [actualIsPlaying, progress, duration]);

  // Sync non-creator progress with creator's music state
  React.useEffect(() => {
    // When music starts/stops, sync the local playing state
    if (isPlayingMusic && !localIsPlaying) {
      setLocalIsPlaying(true);
    } else if (!isPlayingMusic && localIsPlaying) {
      setLocalIsPlaying(false);
    }
  }, [isPlayingMusic, localIsPlaying]);

  // Detect when a new song is loaded and show message
  React.useEffect(() => {
    if (currentCard?.id && currentCard.id !== lastCardIdRef.current) {
      console.log('[GameFooter] New song detected:', currentCard.title);
      lastCardIdRef.current = currentCard.id;

      // Reset hasPlayedOnce for new song
      setHasPlayedOnce(false);

      // Show "new song loaded" message for creator only
      if (isCreator) {
        setShowNewSongMessage(true);
      }
    }
  }, [currentCard?.id, isCreator]);

  // Reset progress when new song starts (when currentCard changes)
  React.useEffect(() => {
    console.log('[GameFooter] Current card changed, resetting progress:', currentCard?.title);
    setProgress(0);
    setLocalIsPlaying(false);
  }, [currentCard?.id]);

  // CRITICAL FIX: Reset progress when new turn/round starts (even if auto-play fails)
  React.useEffect(() => {
    console.log('[GameFooter] New turn/round detected, resetting progress:', {
      currentPlayerId,
      phase,
      isMyTurn
    });

    // Reset progress whenever a new turn starts or we enter player-turn phase
    if (phase === 'player-turn') {
      setProgress(0);
      setLocalIsPlaying(false);
    }
  }, [currentPlayerId, phase]);

  // Handle play/pause button click
  const handlePlayPauseClick = async () => {
    console.log('[GameFooter] Play button clicked:', {
      isCreator,
      usingPreviewMode,
      actualIsPlaying,
      currentCardTitle: currentCard?.title,
      previewUrl: currentCard?.previewUrl || currentCard?.preview_url
    });

    // Hide "new song loaded" message when play is pressed and mark that play has been pressed
    if (showNewSongMessage) {
      setShowNewSongMessage(false);
      setHasPlayedOnce(true);
    }

    // CRITICAL FIX: Reset progress when user manually presses play (fallback for failed auto-play)
    if (!actualIsPlaying && phase === 'player-turn') {
      console.log('[GameFooter] Manual play detected, resetting progress as fallback');
      setProgress(0);
      setLocalIsPlaying(false);
    }

    // PREVIEW MODE: Handle preview playback for creators
    if (usingPreviewMode) {
      const previewUrl = currentCard?.previewUrl || currentCard?.preview_url;

      if (!previewUrl) {
        console.warn('[PreviewMode] No preview URL available for:', currentCard?.title);
        return;
      }

      if (previewIsPlaying) {
        pausePreview();
      } else {
        if (previewCurrentTime > 0) {
          await resumePreview();
        } else {
          await playPreview(previewUrl);
        }
      }
      return;
    }

    // Non-creator: no-op (creator controls playback)
  };

  // Handle restart button click
  const handleRestartClick = () => {
    if (usingPreviewMode) {
      // Stop and restart preview from beginning
      stopPreview();
      const previewUrl = currentCard?.previewUrl || currentCard?.preview_url;
      if (previewUrl) {
        playPreview(previewUrl);
      }
    } else {
      setProgress(0);
      setLocalIsPlaying(true);
    }
  };

  // Song guessing state - now handled by modal
  const [showSongGuessModal, setShowSongGuessModal] = useState(false);
  const [, setNewSongRequest] = useState(null); // For creator notifications

  // iOS pattern: the guess fields open automatically on your turn during
  // song-guess (no intermediate "do you want to guess?" step). Closing the
  // sheet counts as skipping.
  React.useEffect(() => {
    if (phase === 'song-guess' && isMyTurn) {
      setShowSongGuessModal(true);
    } else {
      setShowSongGuessModal(false);
    }
  }, [phase, isMyTurn]);
  // Prevent spamming skip_song while backend reconnects or processes the request
  const skipInFlightRef = React.useRef(false);

  // Format time mm:ss (no decimals)
  const formatTime = (s) => {
    const seconds = Math.floor(s); // Remove decimals
    return `${Math.floor(seconds/60)}:${(seconds%60).toString().padStart(2, '0')}`;
  };

  // Helper functions for finding players
  const findPlayerByPersistentId = (persistentId) => players?.find(p => p.persistentId === persistentId);
  const findPlayerBySocketId = (socketId) => players?.find(p => p.id === socketId);

  const myPlayer = findPlayerBySocketId(myPlayerId);
  const currentPlayer = findPlayerByPersistentId(currentPlayerId);


  const handleTokenAction = (action, targetPlayerId = null) => {
    console.log('[GameFooter] handleTokenAction called:', { action, targetPlayerId, myPlayerId, isMyTurn });

    // Throttle skip_song to avoid repeated pauses when backend is reconnecting
    if (action === 'skip_song') {
      if (skipInFlightRef.current) {
        console.log('[GameFooter] skip_song ignored (in-flight)');
        return;
      }
      skipInFlightRef.current = true;
      // Reset guard after a short window; backend also updates state which will naturally clear it
      setTimeout(() => { skipInFlightRef.current = false; }, 2000);
    }

    // CRITICAL FIX: Stop music immediately when "New Song" is clicked
    if (action === 'skip_song' && usingPreviewMode) {
      console.log('[GameFooter] Stopping preview before new song');
      stopPreview();
    }

    // If this is a non-creator requesting a new song, send request to server
    if (action === 'skip_song' && !isCreator) {
      // Send request through server to notify creator
      if (socketRef?.current) {
        socketRef.current.emit('request_new_song', {
          code: roomCode,
          playerName: myPlayer?.name || 'A player'
        });
      }
    }

    onUseToken(action, targetPlayerId);
  };

  // Creator prompt removed: backend now auto-loads and emits new song with URI,
  // so we no longer show a manual "Load New Song" notification/CTA to the creator.
  React.useEffect(() => {
    if (!socketRef?.current || !isCreator) return;

    const handleNewSongRequest = (data) => {
      console.log('[GameFooter] Received new song request (no prompt, auto-load handled by backend):', data);
      setNewSongRequest(null);
    };

    socketRef.current.on('new_song_request', handleNewSongRequest);

    return () => {
      socketRef.current?.off('new_song_request', handleNewSongRequest);
    };
  }, [socketRef, isCreator]);

  // Listen for progress sync (non-creators only)
  React.useEffect(() => {
    if (!socketRef?.current || isCreator) return;

    const handleProgressSync = (data) => {
      console.log('[GameFooter] Received progress sync:', data);
      setProgress(data.progress || 0);
      setDuration(data.duration || 30);
      setLocalIsPlaying(data.isPlaying || false);
    };

    socketRef.current.on('progress_sync', handleProgressSync);

    return () => {
      socketRef.current?.off('progress_sync', handleProgressSync);
    };
  }, [socketRef, isCreator]);

  // Broadcast progress updates (creator only)
  React.useEffect(() => {
    // Only creator should broadcast, and only if we have a room and socket
    if (!socketRef?.current || !isCreator || !roomCode) return;

    const broadcastProgress = () => {
      socketRef.current.emit('progress_update', {
        code: roomCode,
        progress: displayProgress,
        duration: displayDuration,
        isPlaying: actualIsPlaying
      });
    };

    // Broadcast progress every 2 seconds when playing, and once when state changes
    if (actualIsPlaying) {
      // Immediate broadcast when starting
      broadcastProgress();
      const interval = setInterval(broadcastProgress, 2000);
      return () => clearInterval(interval);
    } else {
      // Broadcast pause state immediately
      broadcastProgress();
    }
  }, [socketRef, roomCode, displayProgress, displayDuration, actualIsPlaying, isCreator]);


  const handleContinueClick = () => {
    console.log('[GameFooter] Continue button clicked:', {
      myPlayerId,
      currentPlayerId,
      isMyTurn,
      phase,
      showFeedback,
      feedback
    });

    // CRITICAL FIX: Stop all music when continuing to next turn
    if (usingPreviewMode) {
      console.log('[GameFooter] Stopping preview mode music before continue');
      stopPreview();
    }

    // Reset progress and state for next turn
    setProgress(0);
    setLocalIsPlaying(false);
    setShowNewSongMessage(false);
    setHasPlayedOnce(false);

    onContinue();
  };

  const isRevealing = (showFeedback && feedback) || (phase === 'challenge-resolved' && feedback);

  // Song-guess-result line shared by reveal + challenge-resolved.
  const songGuessResult = lastSongGuess && (
    <div className="mb-4 text-sm">
      {lastSongGuess.correct ? (
        <div className="text-primary font-semibold">
          Song guess: {lastSongGuess.playerName} got both title and artist right and is awarded an extra credit 🎉
        </div>
      ) : (
        <div className="text-muted-foreground">
          Song guess: {lastSongGuess.playerName} guessed "{lastSongGuess.guessTitle}" by "{lastSongGuess.guessArtist}" which is wrong and gets no extra credit
        </div>
      )}
    </div>
  );

  // ── Challenge-window panel state ──
  const challengeWindowContent = phase === 'challenge-window' && (() => {
    // Determine if this player has already responded (skipped or challenged)
    let hasResponded = false;
    let waitingForOthers = false;
    if (challenge && challenge.challengeWindow) {
      const { waitingFor } = challenge.challengeWindow;
      hasResponded = waitingFor && !waitingFor.includes(myPlayerId);
      waitingForOthers = hasResponded && waitingFor.length > 0;
    }
    return (
      <div className="text-center">
        <div className="text-foreground font-semibold mb-4">Other players can now challenge.</div>
        {!isMyTurn && myPlayer && myPlayer.tokens > 0 && !hasResponded ? (
          <div className="flex gap-3 justify-center">
            <SheetButton onClick={onSkipChallenge}>Pass</SheetButton>
            <SheetButton variant="primary" onClick={onInitiateChallenge}>Challenge · 1 credit</SheetButton>
          </div>
        ) : !isMyTurn && myPlayer && myPlayer.tokens === 0 && !hasResponded ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-muted-foreground text-sm">No credits to challenge</div>
            <SheetButton onClick={onSkipChallenge}>Pass</SheetButton>
          </div>
        ) : waitingForOthers ? (
          <div className="text-muted-foreground text-sm">Waiting for other players…</div>
        ) : (
          <div className="text-muted-foreground text-sm">
            {isMyTurn ? "Waiting for other players…" : "Waiting…"}
          </div>
        )}
      </div>
    );
  })();

  // ── Challenge-resolved panel state ──
  const resolvedKind = challenge?.result
    ? challenge.result.challengeWon
      ? 'won'
      : challenge.result.originalCorrect
        ? 'defended'
        : 'none'
    : 'none';
  const challengeResolvedContent = phase === 'challenge-resolved' && challenge && feedback && (
    <div className="text-center">
      <div className="flex justify-center mb-2">
        <ResolvedIcon kind={resolvedKind} />
      </div>
      <div className="text-foreground font-bold">Challenge Complete!</div>
      <div className="text-foreground text-sm mb-4">
        {challenge.result?.challengeWon ?
          `${findPlayerByPersistentId(challenge.challengerPersistentId)?.name} won the challenge!` :
          !challenge.result?.challengerCorrect && challenge.result?.originalCorrect ?
            `${findPlayerByPersistentId(challenge.originalPlayerId)?.name} placed it correctly!` :
            challenge.result?.challengerCorrect && challenge.result?.originalCorrect ?
              `Both players placed it correctly, but ${findPlayerByPersistentId(challenge.originalPlayerId)?.name} went first!` :
              !challenge.result?.challengerCorrect && !challenge.result?.originalCorrect ?
                `Both players placed it incorrectly! No one gets the card.` :
                `${findPlayerByPersistentId(challenge.challengerPersistentId)?.name} placed it correctly, but ${findPlayerByPersistentId(challenge.originalPlayerId)?.name} went first!`
        }
      </div>
      {songGuessResult}
      {isCreator ? (
        <SheetButton
          variant="primary"
          onClick={() => {
            // CRITICAL FIX: Stop all music when continuing after challenge
            if (usingPreviewMode) {
              stopPreview();
            }
            setProgress(0);
            setLocalIsPlaying(false);
            setShowNewSongMessage(false);
            setHasPlayedOnce(false);
            onContinueAfterChallenge();
          }}
        >
          Continue to Next Turn
        </SheetButton>
      ) : (
        <div className="px-6 py-2 text-muted-foreground text-sm">
          Waiting for host to start next turn...
        </div>
      )}
    </div>
  );

  return (
    <footer
      className="w-full bg-footer-panel shadow flex flex-col items-center px-1 py-1 md:py-2 border-t border-border rounded-t-2xl"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0px)" }}
    >
      <div className="w-full max-w-md flex flex-col items-center" style={{ overflow: 'visible' }}>
        <div className="w-full rounded-2xl p-3 md:p-2 flex flex-col items-center mb-3" style={{ overflow: 'visible' }}>
          {/* Artist, title, year with album art - shown during reveal / challenge-resolved.
              (Song detail card is opened by tapping the timeline node, per iOS.) */}
          {currentCard && isRevealing && (
            <div className="mb-2 flex items-center gap-4 justify-center w-full">
              {(currentCard?.album_art || currentCard?.image || currentCard?.album?.images?.[0]?.url) && (
                <div
                  className="overflow-hidden bg-surface-2 flex-shrink-0"
                  style={{ width: 72, height: 72, borderRadius: 10 }}
                >
                  <img
                    src={currentCard?.album_art || currentCard?.image || currentCard?.album?.images?.[0]?.url}
                    alt="Album cover"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="text-sm md:text-base text-left flex-1 min-w-0">
                <div className="font-bold text-foreground leading-tight mb-1 truncate">
                  {currentCard.title}
                </div>
                <div className="leading-tight text-muted-foreground">
                  {currentCard.artist} ({feedback?.year || currentCard.year})
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center mt-3 gap-2 md:gap-4 w-full">
            {/* Show controls only for creator */}
            {isCreator ? (
              <>
                {/* Restart button (iOS: 32px surface-2 circle, teal icon) */}
                <button
                  className="flex items-center justify-center rounded-full bg-surface-2 hover:bg-surface-2/80 flex-shrink-0 no-focus-outline force-no-outline press-scale"
                  style={{
                    width: 32,
                    height: 32,
                    minWidth: 32,
                    minHeight: 32,
                    padding: 0,
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none',
                    border: 'none',
                    boxShadow: 'none'
                  }}
                  onClick={handleRestartClick}
                  onTouchEnd={blurOnTouch}
                  aria-label="Restart track"
                >
                  <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="#08AF9A" viewBox="0 0 12 16">
                    <path d="M10.819.4a1.974 1.974 0 0 0-2.147.33l-6.5 5.773A2.014 2.014 0 0 0 2 6.7V1a1 1 0 0 0-2 0v14a1 1 0 1 0 2 0V9.3c.055.068.114.133.177.194l6.5 5.773a1.982 1.982 0 0 0 2.147.33A1.977 1.977 0 0 0 12 13.773V2.227A1.977 1.977 0 0 0 10.819.4Z"/>
                  </svg>
                </button>

                {/* Play/pause (iOS AudioControls: 46px frame, 38px teal circle,
                    teal glow, pulsing ring when paused) */}
                <button
                  className="relative flex items-center justify-center flex-shrink-0 no-focus-outline force-no-outline press-scale"
                  style={{
                    width: 46,
                    height: 46,
                    minWidth: 46,
                    minHeight: 46,
                    padding: 0,
                    background: 'transparent',
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none',
                    border: 'none'
                  }}
                  onClick={handlePlayPauseClick}
                  onTouchEnd={blurOnTouch}
                  aria-label={actualIsPlaying ? "Pause" : "Play"}
                >
                  {!actualIsPlaying && (
                    <span
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 38,
                        height: 38,
                        border: '2px solid #08AF9A',
                        animation: 'beat-pulse-ring 1.4s ease-in-out infinite',
                      }}
                    />
                  )}
                  <span
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 38,
                      height: 38,
                      backgroundColor: '#08AF9A',
                      boxShadow: '0 0 8px rgba(8, 175, 154, 0.6), 0 0 16px rgba(8, 175, 154, 0.3)',
                    }}
                  >
                    {actualIsPlaying ? (
                      <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M8 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H8Zm7 0a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1Z" clipRule="evenodd"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 ml-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 10 16">
                        <path d="M3.414 1A2 2 0 0 0 0 2.414v11.172A2 2 0 0 0 3.414 15L9 9.414a2 2 0 0 0 0-2.828L3.414 1Z"/>
                      </svg>
                    )}
                  </span>
                </button>
              </>
            ) : (
              /* Spacer for non-creators to maintain layout */
              <div className="w-8 h-8 flex-shrink-0"></div>
            )}

            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: 13 }}>
                <span className="tabular-nums" style={{ minWidth: 34 }}>{formatTime(displayProgress)}</span>
                {/* Progress track (iOS: 9px border-colored track, teal→purple gradient fill w/ teal glow) */}
                <div className="relative flex-1 rounded-full overflow-hidden bg-border" style={{ height: 9 }}>
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width: `${(displayProgress/displayDuration)*100}%`,
                      background: 'linear-gradient(90deg, #08AF9A 0%, #7D3BED 100%)',
                      boxShadow: '0 0 4px rgba(8, 175, 154, 0.6)',
                    }}
                  ></div>
                </div>
                <span className="tabular-nums" style={{ minWidth: 34 }}>{formatTime(displayDuration)}</span>
                {/* AirPlay button (Safari/iOS) */}
                {showAirPlayButton && (
                  <button
                    onClick={handleAirPlayClick}
                    onTouchEnd={blurOnTouch}
                    className="ml-1 w-6 h-6 flex items-center p-0 justify-center rounded-full bg-surface-2 hover:bg-surface-2/80 text-foreground text-xs no-focus-outline force-no-outline"
                    title="AirPlay"
                    aria-label="Stream via AirPlay"
                    style={{
                      minWidth: 24,
                      minHeight: 24,
                      WebkitTapHighlightColor: 'transparent',
                      outline: 'none',
                      border: 'none',
                      boxShadow: 'none',
                    }}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                      <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Song Guess Modal (bottom sheet) */}
      <SongGuessModal
        isOpen={showSongGuessModal}
        onClose={onSkipSongGuess}
        onGuessSong={onGuessSong}
        onSkipSongGuess={onSkipSongGuess}
      />

      {/* Song guess — waiting for the current player to decide (my-turn opens the sheet) */}
      {phase === 'song-guess' && !isMyTurn && (
        <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
          <div className="text-muted-foreground text-sm">
            {findPlayerByPersistentId(currentPlayerId)?.name} is deciding whether to guess the song…
          </div>
        </div>
      )}

      {/* Challenge window — inline in the footer (iOS PhaseActionsFooter) */}
      {phase === 'challenge-window' && (
        <div className="w-full max-w-md p-3 mb-2">{challengeWindowContent}</div>
      )}

      {/* Challenge in progress section (inline, iOS PhaseActionsFooter) */}
      {phase === 'challenge' && challenge && (() => {
        // PERSISTENT ID FIX: Compare persistent IDs, not socket IDs
        const myPersistentId = myPlayer?.persistentId;
        const challengerPersistentId = challenge.challengerPersistentId || challenge.challengerId;
        const isMe = myPersistentId && challengerPersistentId && myPersistentId === challengerPersistentId;

        console.log('[GameFooter] Challenge UI check:', {
          challengerId: challenge.challengerId,
          challengerPersistentId: challenge.challengerPersistentId,
          myPlayerId,
          myPersistentId,
          isMe,
          phase,
          challengerName: challenge.challengerName
        });
        return (
          <div className="w-full max-w-md p-3 text-center mb-8" style={{ background: 'transparent' }}>
            <div className="text-white font-bold mb-2">
              {isMe ?
                "You are challenging the placement!" :
                `${challenge.challengerName || findPlayerByPersistentId(challenge.challengerPersistentId || challenge.challengerId)?.name || 'A player'} is challenging the placement!`
              }
            </div>
            {pendingDropIndex === null && (
              <div className="text-white text-sm">
                {isMe ?
                  "Select a place on timeline where you think the song belongs" :
                  "Waiting for challenger to place their guess..."
                }
              </div>
            )}
          </div>
        );
      })()}

      {/* Challenge resolved — inline in the footer with outcome icon */}
      {phase === 'challenge-resolved' && challenge && feedback && (
        <div className="w-full max-w-md p-3 mb-2">{challengeResolvedContent}</div>
      )}

      {/* Pending drop confirmation section */}
      {pendingDropIndex !== null && isMyTurn && (
        <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
          <div className="text-white mb-8">
            You have now selected a place on the timeline.
          </div>
          {placeCardError && (
            <div className="text-yellow-400 text-sm mb-3">{placeCardError}</div>
          )}
          <div className="flex gap-2 justify-center">
            <SheetButton onClick={onCancelDrop}>Cancel</SheetButton>
            <SheetButton variant="primary" onClick={onConfirmDrop}>Confirm Placement</SheetButton>
          </div>
        </div>
      )}

      {/* Feedback section */}
      <div className="w-full max-w-md flex flex-col items-center">
        {showFeedback && feedback && phase !== 'challenge-resolved' ? (
          <div className="w-full p-3 text-center mb-2" style={{ background: 'transparent' }}>
            <div className="font-bold mb-2 flex items-center justify-center gap-2">
              {feedback.correct ? (
                <span className="inline-flex" style={{ color: '#22C55E', filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.7))' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              ) : (
                <span className="inline-flex" style={{ color: '#EF4444', filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.7))' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </span>
              )}
              {feedback.correct ?
                (myPlayerId === currentPlayerId ?
                  "Yay, your answer is correct!" :
                  `${currentPlayer?.name || 'The player'} was correct!`
                ) :
                (myPlayerId === currentPlayerId ?
                  "Wrong answer!" :
                  `${currentPlayer?.name || 'The player'} was wrong!`
                )
              }
            </div>

            {songGuessResult}

            {/* Continue button - only creator can click */}
            {isCreator ? (
              <SheetButton variant="primary" onClick={handleContinueClick}>
                Continue to Next Turn
              </SheetButton>
            ) : (
              <div className="mt-3 px-6 py-2 text-white rounded">
                Waiting for host to start next turn...
              </div>
            )}
          </div>
        ) : currentCard && phase === 'player-turn' && pendingDropIndex === null ? (
          <div className="w-full p-2 md:p-4 text-center mb-1" style={{ background: 'transparent' }}>
            {showNewSongMessage && isCreator ? (
              <>
                <div className="text-foreground text-md md:text-2xl font-bold mb-1">
                  New song loaded
                </div>
                <div className="text-foreground text-sm md:text-base mb-2">
                  Press play when you are ready
                </div>
              </>
            ) : (
              <div className="text-foreground text-md md:text-2xl font-bold mb-1">
                {isMyTurn ? "Select a place in the timeline above" : `${findPlayerByPersistentId(currentPlayerId)?.name}'s turn`}
              </div>
            )}

            {/* New Song button (iOS: surface pill + coin) */}
            {isMyTurn && myPlayer && myPlayer.tokens > 0 && (
              <div className="flex flex-col items-center w-full max-w-md mx-auto mt-4">
                <button
                  onClick={() => handleTokenAction('skip_song')}
                  onTouchEnd={blurOnTouch}
                  className="w-full h-12 px-4 bg-surface-2 hover:bg-surface-2/80 text-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 rounded-xl no-focus-outline force-no-outline"
                  style={{ WebkitTapHighlightColor: 'transparent', border: '1px solid hsl(var(--border))' }}
                >
                  <CoinView size={14} />
                  New Song · 1 credit
                </button>
              </div>
            )}

          </div>
        ) : phase === 'game-over' ? (
          <div className="w-full p-2 md:p-4 rounded text-center bg-gray-800 mb-1 text-gray-300 text-lg md:text-2xl">Game over! 🎉</div>
        ) : null}
      </div>

    </footer>
  );
}

export default GameFooter;
