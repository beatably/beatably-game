import { useEffect, useRef } from 'react';
import { playSound } from './soundUtils';

// Centralized game-sound triggers, mirroring the iOS wiring
// (ios/Beatably/Views/GameView.swift onChange/onAppear blocks):
//   reveal        → correct / lose
//   challenge     → challenge sting when a challenge starts
//   resolved      → correct for the winner (and observers), lose for the loser
//   song guessed  → casino bling + coin award to the guesser
//   game over     → win for the winner, lose for everyone else
// The placement sound fires at tap time in TimelineBoard; credit/bonus fire in
// App's credit_spent_for_new_song handler.
export default function useGameSounds({
  phase,
  lastPlaced,
  challenge,
  lastSongGuess,
  showWinnerView,
  winner,
  myPersistentId,
  mySocketId,
  onCoinAward,
  isSolo,
}) {
  const prevPhaseRef = useRef(phase);
  const casinoPlayedRef = useRef(null);
  const winPlayedRef = useRef(false);

  // Phase-transition sounds
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase === prev) return;

    if (phase === 'reveal') {
      playSound(lastPlaced?.correct ? 'correct' : 'lose');
    } else if (phase === 'challenge') {
      playSound('challenge');
    } else if (phase === 'challenge-resolved') {
      const r = challenge?.result;
      if (r) {
        const iAmChallenger = challenge.challengerPersistentId === myPersistentId;
        const iAmOriginal =
          (challenge.originalPlayerId || challenge.targetId) === myPersistentId;
        if ((iAmChallenger && r.challengeWon) || (iAmOriginal && r.originalCorrect)) {
          playSound('correct');
        } else if (iAmChallenger || iAmOriginal) {
          playSound('lose');
        } else {
          playSound('correct');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Casino bling + coin award when a correct song guess is revealed
  useEffect(() => {
    if ((phase === 'reveal' || phase === 'challenge-resolved') && lastSongGuess?.correct) {
      const key = `${lastSongGuess.playerId}-${lastSongGuess.guessTitle}`;
      if (casinoPlayedRef.current !== key) {
        casinoPlayedRef.current = key;
        playSound('casino');
        onCoinAward?.(lastSongGuess.playerId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lastSongGuess]);

  // Win / lose at game over
  useEffect(() => {
    if (showWinnerView && winner && !winPlayedRef.current) {
      winPlayedRef.current = true;
      if (isSolo) {
        // Solo run over → leaderboard fanfare (win/lose doesn't apply).
        playSound('winner');
      } else {
        const iWon =
          winner.persistentId === myPersistentId ||
          winner.id === myPersistentId ||
          winner.id === mySocketId;
        playSound(iWon ? 'win' : 'lose');
      }
    }
    if (!showWinnerView) winPlayedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWinnerView, winner]);
}
