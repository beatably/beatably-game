import React, { useCallback, useEffect, useRef, useState } from 'react';
import DemoTimeline from './DemoTimeline';
import { EqBars } from './HeroDemo';
import { PLAY_URL } from './CtaButtons';
import { REAL_SONGS } from './realSongs';

// One real round, playable on the page — the same loop as the game. A real
// randomized song plays its 30s Apple Music preview (tap play), you guess where
// it belongs on the timeline, and it snaps into place with the game's spring.
// Wrong guesses flash red, then the card slides to its true year.
//
// Compliance: artwork + previews are referenced LIVE from the Apple Music CDN
// (never bundled), each track links out to Apple Music, and the "Listen on
// Apple Music" badge is shown — the sanctioned "in connection with playback" use.

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick 4 distinct-year songs; one becomes the mystery, the other 3 are the
// timeline. correctIndex = where the mystery's year actually belongs.
function newRound() {
  const picked = [];
  const years = new Set();
  for (const s of shuffle(REAL_SONGS)) {
    if (years.has(s.year)) continue;
    years.add(s.year);
    picked.push(s);
    if (picked.length === 4) break;
  }
  picked.sort((a, b) => a.year - b.year);
  const mIdx = Math.floor(Math.random() * picked.length);
  const mystery = picked[mIdx];
  const placed = picked.filter((_, i) => i !== mIdx);
  const correctIndex = placed.filter((s) => s.year < mystery.year).length;
  return { placed, mystery, correctIndex };
}

const toCard = (s, extra = {}) => ({ id: s.id, art: s.art, year: s.year, ...extra });

// Inline gradient + CSS-shape glyphs, deliberately NOT using the .bg-primary
// class (its global !important + overflow:hidden overrides swallow child icons).
function PlayButton({ playing, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? 'Pause preview' : 'Play preview'}
      className="flex-none flex items-center justify-center press-scale"
      style={{
        width: 44,
        height: 44,
        borderRadius: '9999px',
        border: 'none',
        background: 'linear-gradient(135deg, #08AF9A 0%, #7D3BED 100%)',
        boxShadow: '0 2px 10px rgba(125, 59, 237, 0.4)',
      }}
    >
      {playing ? (
        <span className="flex items-center gap-[3px]" aria-hidden="true">
          <span style={{ width: 4, height: 15, borderRadius: 2, background: '#fff' }} />
          <span style={{ width: 4, height: 15, borderRadius: 2, background: '#fff' }} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            marginLeft: 3,
            borderTop: '9px solid transparent',
            borderBottom: '9px solid transparent',
            borderLeft: '15px solid #fff',
          }}
        />
      )}
    </button>
  );
}

function AppleMusicLink({ href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex press-scale"
      aria-label="Listen on Apple Music"
    >
      <img src="/img/listen-on-apple-music.png" alt="Listen on Apple Music" className="h-[26px] w-auto" />
    </a>
  );
}

function TryItDemo() {
  const [round, setRound] = useState(newRound);
  const [phase, setPhase] = useState('idle'); // idle | placing | wrong | moving | done
  const [result, setResult] = useState(null); // null | 'correct' | 'corrected'
  const [cards, setCards] = useState(() => round.placed.map((s) => toCard(s)));
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => clearTimers(), []);

  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  // Reset audio whenever the round changes.
  useEffect(() => stopAudio, [round, stopAudio]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const buildCards = useCallback(
    (insertAt, mysteryProps) => {
      const list = round.placed.map((s) => toCard(s));
      list.splice(insertAt, 0, toCard(round.mystery, mysteryProps));
      return list;
    },
    [round]
  );

  const handleGap = useCallback(
    (gapIndex) => {
      if (phase !== 'idle') return;
      stopAudio();
      setPhase('placing');
      setCards(buildCards(gapIndex, { mystery: true }));

      if (gapIndex === round.correctIndex) {
        later(750, () => {
          setCards(buildCards(round.correctIndex, { colorState: 'correct' }));
          setPhase('done');
          setResult('correct');
        });
      } else {
        later(750, () => {
          setCards(buildCards(gapIndex, { colorState: 'incorrect' }));
          setPhase('wrong');
        });
        later(1750, () => {
          setCards(buildCards(round.correctIndex, {}));
          setPhase('moving');
        });
        later(2500, () => {
          setCards(buildCards(round.correctIndex, { colorState: 'correct' }));
          setPhase('done');
          setResult('corrected');
        });
      }
    },
    [phase, round, buildCards, stopAudio]
  );

  const reset = () => {
    clearTimers();
    stopAudio();
    const r = newRound();
    setRound(r);
    setCards(r.placed.map((s) => toCard(s)));
    setPhase('idle');
    setResult(null);
  };

  const { mystery } = round;

  return (
    <div>
      <audio ref={audioRef} src={mystery.preview} preload="none" onEnded={() => setPlaying(false)} />

      <div className="flex justify-center">
        <div className="beat-card px-3.5 py-2.5 flex items-center gap-3 max-w-[19rem] w-full">
          <PlayButton playing={playing} onClick={togglePlay} />
          <div className="leading-tight text-left min-w-0 flex-1">
            <div className="text-sm font-extrabold truncate">{mystery.title}</div>
            <div className="text-xs text-foreground/60 truncate">
              {mystery.artist}
              {playing && <span className="inline-flex ml-2 align-middle"><EqBars /></span>}
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-foreground/55 mt-2">
        {phase === 'idle' ? 'Hit play, then tap the gap where it belongs' : 'Locking it in…'}
      </p>

      <DemoTimeline
        cards={cards}
        showGaps={phase === 'idle'}
        onGapSelect={handleGap}
        revealPopId={phase === 'done' ? mystery.id : null}
        minMargin={14}
        className="h-[280px] sm:h-[320px]"
      />

      <div aria-live="polite" className="min-h-[6.5rem] text-center">
        {result === 'correct' && (
          <div className="view-fade-in">
            <p className="font-extrabold text-lg" style={{ color: '#22C55E' }}>
              Nailed it — {mystery.title} dropped in {mystery.year}.
            </p>
            <p className="text-sm text-foreground/70 mt-1">You'd be dangerous at game night.</p>
          </div>
        )}
        {result === 'corrected' && (
          <div className="view-fade-in">
            <p className="font-extrabold text-lg" style={{ color: '#FF1493' }}>
              It's {mystery.year} — off by a gap.
            </p>
            <p className="text-sm text-foreground/70 mt-1">
              In a real game, a friend just challenged that card and stole it.
            </p>
          </div>
        )}
        {result && (
          <div className="view-fade-in mt-4 flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-5">
              <a
                href={PLAY_URL}
                className="bg-primary h-11 px-5 rounded-md text-sm font-bold inline-flex items-center justify-center press-scale"
              >
                Start a real game
              </a>
              <button
                type="button"
                onClick={reset}
                className="text-sm font-semibold text-foreground/60 hover:text-foreground underline underline-offset-2 bg-transparent border-0"
              >
                Try another
              </button>
            </div>
            <AppleMusicLink href={mystery.appleUrl} />
          </div>
        )}
        {!result && (
          <div className="mt-4 flex justify-center">
            <AppleMusicLink href={mystery.appleUrl} />
          </div>
        )}
      </div>
    </div>
  );
}

export default TryItDemo;
