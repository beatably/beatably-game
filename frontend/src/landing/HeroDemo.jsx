import React, { useEffect, useMemo, useRef, useState } from 'react';
import DemoTimeline, { prefersReducedMotion } from './DemoTimeline';
import { SONGS } from './demoSongs';

// Auto-looping placement demo: the page's one signature motion moment.
// A mystery track "plays", the target gap pulses, the card springs into the
// timeline (real layout engine + spring curves), then flips over to album art
// with the game's green reveal. Rotates through three scenarios so each loop
// lands on a different gap. Paused off-screen / in background tabs; renders
// the revealed end-state statically under prefers-reduced-motion.

const BASE = [SONGS.takeOnMe, SONGS.wonderwall, SONGS.heyYa, SONGS.rollingInTheDeep];
const SCENARIOS = [
  { song: SONGS.babyOneMoreTime, insertAt: 2 },
  { song: SONGS.umbrella, insertAt: 3 },
  { song: SONGS.likeAPrayer, insertAt: 1 },
];
const PHASE_MS = { listen: 1700, placed: 950, revealed: 2900, fade: 260 };
const PHASE_ORDER = ['listen', 'placed', 'revealed', 'fade'];

export function EqBars() {
  return (
    <span className="landing-eq" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function NowPlayingChip({ revealed, song }) {
  return (
    <div className="beat-card px-4 py-2.5 flex items-center gap-3 min-w-[240px]">
      {revealed ? (
        <img
          src={song.art}
          alt=""
          width={28}
          height={28}
          className="rounded-md flex-none"
          style={{ border: '1px solid rgba(255,255,255,0.25)' }}
        />
      ) : (
        <EqBars />
      )}
      <div key={revealed ? 'revealed' : 'listening'} className="view-fade-in leading-tight text-left">
        {revealed ? (
          <>
            <div className="text-sm font-extrabold">{song.title}</div>
            <div className="text-xs text-foreground/60">
              {song.artist} ·{' '}
              <span className="font-black tabular-nums" style={{ color: '#22C55E' }}>
                {song.year}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-extrabold">Mystery track</div>
            <div className="text-xs text-foreground/60">Now playing · guess the year</div>
          </>
        )}
      </div>
    </div>
  );
}

function HeroDemo() {
  const reduced = useMemo(prefersReducedMotion, []);
  const rootRef = useRef(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [step, setStep] = useState({ scenario: 0, phase: reduced ? 'revealed' : 'listen' });
  const active = inView && pageVisible && !reduced;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => {
      setStep((s) => {
        const i = PHASE_ORDER.indexOf(s.phase);
        if (i < PHASE_ORDER.length - 1) return { ...s, phase: PHASE_ORDER[i + 1] };
        return { scenario: (s.scenario + 1) % SCENARIOS.length, phase: 'listen' };
      });
    }, PHASE_MS[step.phase]);
    return () => clearTimeout(t);
  }, [active, step]);

  const { song, insertAt } = SCENARIOS[step.scenario];
  const revealed = step.phase === 'revealed' || step.phase === 'fade';

  const cards = useMemo(() => {
    if (step.phase === 'listen') return BASE;
    const placed = {
      ...song,
      mystery: step.phase === 'placed',
      colorState: step.phase === 'placed' ? undefined : 'correct',
    };
    const list = BASE.slice();
    list.splice(insertAt, 0, placed);
    return list;
  }, [step.phase, song, insertAt]);

  return (
    <div ref={rootRef} className="relative" aria-label="Gameplay demo: a mystery song is placed on a music timeline and revealed">
      <div className={`landing-demo ${step.phase === 'fade' ? 'is-fading' : ''}`}>
        <DemoTimeline
          cards={cards}
          showGaps={step.phase === 'listen'}
          highlightGap={step.phase === 'listen' && !reduced ? insertAt : null}
          revealPopId={revealed ? song.id : null}
          minMargin={14}
          className="h-[300px] lg:h-[360px]"
        />
        <div className="flex justify-center -mt-1">
          <NowPlayingChip revealed={revealed} song={song} />
        </div>
      </div>
    </div>
  );
}

export default HeroDemo;
