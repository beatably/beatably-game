import React, { useCallback, useEffect, useRef, useState } from 'react';
import DemoTimeline from './DemoTimeline';
import { EqBars } from './HeroDemo';
import { SONGS } from './demoSongs';
import { PLAY_URL } from './CtaButtons';

// One real round, playable on the page: the visitor taps a gap and the card
// places with the game's spring. Wrong guesses flash red, then the card
// slides to its true spot — the same tension the game runs on.

const PLACED = [SONGS.likeAPrayer, SONGS.mrBrightside, SONGS.blindingLights];
const MYSTERY = SONGS.umbrella;
const CORRECT_INDEX = 2; // 1989 · 2004 · [here] · 2020

function buildCards(insertAt, cardProps) {
  const list = PLACED.slice();
  list.splice(insertAt, 0, { ...MYSTERY, ...cardProps });
  return list;
}

function TryItDemo() {
  const [phase, setPhase] = useState('idle'); // idle | placing | wrong | moving | done
  const [result, setResult] = useState(null); // null | 'correct' | 'corrected'
  const [cards, setCards] = useState(PLACED);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));

  const handleGap = useCallback(
    (gapIndex) => {
      if (phase !== 'idle') return;
      setPhase('placing');
      setCards(buildCards(gapIndex, { mystery: true }));

      if (gapIndex === CORRECT_INDEX) {
        later(750, () => {
          setCards(buildCards(CORRECT_INDEX, { colorState: 'correct' }));
          setPhase('done');
          setResult('correct');
        });
      } else {
        later(750, () => {
          setCards(buildCards(gapIndex, { colorState: 'incorrect' }));
          setPhase('wrong');
        });
        later(1750, () => {
          setCards(buildCards(CORRECT_INDEX, {}));
          setPhase('moving');
        });
        later(2500, () => {
          setCards(buildCards(CORRECT_INDEX, { colorState: 'correct' }));
          setPhase('done');
          setResult('corrected');
        });
      }
    },
    [phase]
  );

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCards(PLACED);
    setPhase('idle');
    setResult(null);
  };

  return (
    <div>
      <div className="flex justify-center">
        <div className="beat-card px-4 py-2.5 flex items-center gap-3">
          <EqBars />
          <div className="leading-tight text-left">
            <div className="text-sm font-extrabold">
              {MYSTERY.title} — {MYSTERY.artist}
            </div>
            <div className="text-xs text-foreground/60">
              {phase === 'idle' && 'Tap the gap where it belongs'}
              {phase !== 'idle' && phase !== 'done' && 'Locking it in…'}
              {phase === 'done' && (
                <>
                  Dropped in{' '}
                  <span className="font-black tabular-nums" style={{ color: '#22C55E' }}>
                    2008
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <DemoTimeline
        cards={cards}
        showGaps={phase === 'idle'}
        onGapSelect={handleGap}
        revealPopId={phase === 'done' ? MYSTERY.id : null}
        className="h-[240px] sm:h-[280px]"
      />

      <div aria-live="polite" className="min-h-[5.5rem] text-center">
        {result === 'correct' && (
          <div className="view-fade-in">
            <p className="font-extrabold text-lg" style={{ color: '#22C55E' }}>
              Called it — Umbrella dropped in 2008.
            </p>
            <p className="text-sm text-foreground/70 mt-1">
              You'd be dangerous at game night.
            </p>
          </div>
        )}
        {result === 'corrected' && (
          <div className="view-fade-in">
            <p className="font-extrabold text-lg" style={{ color: '#FF1493' }}>
              It's 2008 — off by a gap.
            </p>
            <p className="text-sm text-foreground/70 mt-1">
              In a real game, a friend just challenged that card and stole it.
            </p>
          </div>
        )}
        {result && (
          <div className="view-fade-in mt-4 flex items-center justify-center gap-5">
            <a
              href={PLAY_URL}
              className="bg-primary h-11 px-5 rounded-md text-sm font-bold inline-flex items-center justify-center press-scale"
            >
              Start a real game
            </a>
            <button
              type="button"
              onClick={reset}
              className="inline-link-button !text-foreground/60 hover:!text-foreground"
              style={{ background: 'transparent', border: 'none', minHeight: 0 }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TryItDemo;
