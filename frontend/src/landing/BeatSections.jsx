import React, { useLayoutEffect, useMemo, useRef } from 'react';
import MysteryNode from '@/components/timeline/MysteryNode';
import ArtNode from '@/components/timeline/ArtNode';
import CoinView from '@/components/design/CoinView';
import { gsap, prefersReducedMotion, revealOnEnter } from './fx';
import HeroDemo, { EqBars } from './HeroDemo';
import { SONGS } from './demoSongs';

// The four gameplay beats, each a full scroll section revealed on enter:
// 01 Listen · 02 Place · 03 Earn coins · 04 Challenge & steal.

function SectionShell({ number, kicker, accent, title, children, visual, flip = false }) {
  const ref = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      revealOnEnter(ref.current, '[data-reveal]');
      gsap.from('[data-visual]', {
        scale: 0.93,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 70%', once: true },
      });
      gsap.to('[data-giant]', {
        yPercent: -16,
        ease: 'none',
        scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={ref} className="relative py-20 sm:py-28 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 items-center gap-14 lg:gap-24">
        <div className={flip ? 'lg:order-2' : ''}>
          <p
            data-reveal
            className="text-xs sm:text-sm font-black tracking-[0.24em] uppercase"
            style={{ color: accent }}
          >
            {number} · {kicker}
          </p>
          <h2 data-reveal className="landing-h2 mt-3">
            {title}
          </h2>
          <p data-reveal className="mt-5 text-base sm:text-lg text-foreground/75 max-w-md">
            {children}
          </p>
        </div>
        <div className={`relative ${flip ? 'lg:order-1' : ''}`}>
          <span
            data-giant
            aria-hidden="true"
            className="landing-giant-number -top-8 -left-2 lg:-top-14"
            style={{ color: accent }}
          >
            {number}
          </span>
          <div data-visual className="relative" style={{ zIndex: 1 }}>
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 01 · LISTEN ─────────────────────────────────────────────────── */

function ListenVisual() {
  return (
    <div className="relative h-[300px] flex items-center justify-center">
      <div className="absolute w-[280px] h-[280px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <span className="landing-radiate-ring" />
        <span className="landing-radiate-ring" style={{ animationDelay: '1.1s' }} />
        <span className="landing-radiate-ring" style={{ animationDelay: '2.2s' }} />
      </div>
      <div className="relative flex flex-col items-center gap-7">
        <div className="relative w-[120px] h-[120px]">
          <div className="absolute left-1/2 top-1/2">
            <MysteryNode size={120} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="landing-eq landing-eq--xl" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="text-sm font-extrabold text-foreground/70 tabular-nums">
            Now playing · 0:30
          </span>
        </div>
      </div>
    </div>
  );
}

export function ListenSection() {
  return (
    <SectionShell
      number="01"
      kicker="Listen"
      accent="#00CED1"
      title="A mystery hit starts playing"
      visual={<ListenVisual />}
    >
      Thirty seconds, one shot. Everyone hears the same preview — nobody sees the
      year. Was that 1998… or 2004? It suddenly matters a lot.
    </SectionShell>
  );
}

/* ── 02 · PLACE ──────────────────────────────────────────────────── */

export function PlaceSection() {
  return (
    <SectionShell
      number="02"
      kicker="Place"
      accent="#9945FF"
      title="Tap where it belongs"
      flip
      visual={
        <div className="h-[400px] sm:h-[440px] lg:h-[500px] flex items-center justify-center">
          <div className="w-full origin-center scale-100 sm:scale-110 lg:scale-125">
            <HeroDemo />
          </div>
        </div>
      }
    >
      Slot it into your timeline — before, between, or after the cards you've
      already earned. Right order? The card is yours. Wrong? It's gone.
    </SectionShell>
  );
}

/* ── 03 · EARN ───────────────────────────────────────────────────── */

// Animated "Guess the Song" sheet (mirrors the in-game bonus dialog): the
// title + artist type themselves in, Submit pulses, then it resolves to a
// correct check + bonus coin. Loops.
function EarnVisual() {
  const ref = useRef(null);
  const titleRef = useRef(null);
  const artistRef = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const TITLE = 'Take on Me';
  const ARTIST = 'a-ha';

  useLayoutEffect(() => {
    const setText = (el, t) => {
      if (el) el.textContent = t;
    };
    if (reduced) {
      setText(titleRef.current, TITLE);
      setText(artistRef.current, ARTIST);
      return undefined;
    }
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 1.4,
        scrollTrigger: { trigger: ref.current, start: 'top 78%', toggleActions: 'play pause resume pause' },
      });
      tl.call(() => {
        setText(titleRef.current, '');
        setText(artistRef.current, '');
      })
        .set('[data-caret="1"]', { autoAlpha: 1 })
        .set('[data-caret="2"]', { autoAlpha: 0 })
        .set('[data-guess-success]', { opacity: 0, y: 8 })
        .set('[data-guess-submit]', { opacity: 1 })
        .to(
          { n: 0 },
          {
            n: TITLE.length,
            duration: 0.85,
            ease: 'none',
            onUpdate() {
              setText(titleRef.current, TITLE.slice(0, Math.round(this.targets()[0].n)));
            },
          },
          0.3
        )
        .set('[data-caret="1"]', { autoAlpha: 0 }, '>0.15')
        .set('[data-caret="2"]', { autoAlpha: 1 }, '<')
        .to(
          { n: 0 },
          {
            n: ARTIST.length,
            duration: 0.5,
            ease: 'none',
            onUpdate() {
              setText(artistRef.current, ARTIST.slice(0, Math.round(this.targets()[0].n)));
            },
          },
          '>0.1'
        )
        .set('[data-caret="2"]', { autoAlpha: 0 }, '>0.15')
        .to('[data-guess-submit]', { scale: 0.96, duration: 0.12 }, '>0.25')
        .to('[data-guess-submit]', { scale: 1, duration: 0.14 })
        .to('[data-guess-submit]', { opacity: 0, duration: 0.22 }, '>0.05')
        .to('[data-guess-success]', { opacity: 1, y: 0, duration: 0.42, ease: 'back.out(2)' }, '<')
        .to({}, { duration: 1.9 });
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  const field = (valRef, placeholder, caret) => (
    <div className="rounded-md bg-input border border-border px-3 h-11 flex items-center text-sm">
      <span ref={valRef} className="landing-field-val text-foreground whitespace-pre" data-placeholder={placeholder} />
      <span data-caret={caret} className="landing-type-caret" aria-hidden="true" />
    </div>
  );

  return (
    <div ref={ref} className="relative h-[300px] flex items-center justify-center">
      <div className="beat-card w-[300px] max-w-full p-5 text-left">
        <div className="text-center">
          <div className="text-base font-black">Guess the Song</div>
          <div className="text-[11px] text-foreground/55 mt-0.5">
            Both title and artist for the bonus
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          {field(titleRef, 'Song title', '1')}
          {field(artistRef, 'Artist', '2')}
        </div>
        <div className="relative mt-4 h-11">
          <div
            data-guess-submit
            className="absolute inset-0 bg-primary rounded-md flex items-center justify-center text-sm font-extrabold"
          >
            Submit Guess
          </div>
          <div
            data-guess-success
            className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-extrabold"
            style={{ color: '#22C55E' }}
            aria-hidden="true"
          >
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" fill="#22C55E" opacity="0.2" />
              <path d="m6.5 11.5 3 3 6-6.5" stroke="#22C55E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Correct!
            <span className="inline-flex items-center gap-1 ml-1">
              <CoinView size={16} />
              <span style={{ color: '#F5C842' }}>+1</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EarnSection() {
  return (
    <SectionShell
      number="03"
      kicker="Earn coins"
      accent="#F5C842"
      title="Know it? Name it."
      visual={<EarnVisual />}
    >
      After you place, call the artist and title for a bonus coin. Music nerds get
      rich fast — and coins are what the endgame runs on.
    </SectionShell>
  );
}

/* ── 04 · CHALLENGE & STEAL ──────────────────────────────────────── */

const STEAL = {
  maya: [SONGS.likeAPrayer, SONGS.heyYa],
  leo: [SONGS.wonderwall, SONGS.blindingLights],
  contested: SONGS.umbrella,
};

function StealVisual() {
  const ref = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 2.4,
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 78%',
          toggleActions: 'play pause resume pause',
        },
      });
      tl.set('[data-steal-mystery]', { opacity: 1, x: 0, y: 0 })
        .set('[data-steal-won]', { opacity: 0, scale: 0.7 })
        .from('[data-steal-toast]', { y: -10, opacity: 0, duration: 0.4, ease: 'power2.out' })
        .fromTo(
          '[data-steal-coin]',
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2.5)' },
          '>0.15'
        )
        .to('[data-steal-coin]', { opacity: 0, duration: 0.25 }, '>0.5')
        .to(
          '[data-steal-mystery]',
          {
            keyframes: {
              x: [0, -38, -76],
              y: [0, -46, 112],
            },
            duration: 0.75,
            ease: 'power1.inOut',
          },
          '>-0.1'
        )
        .to('[data-steal-mystery]', { opacity: 0, duration: 0.12 })
        .to(
          '[data-steal-won]',
          { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.2)' },
          '<'
        )
        .to({}, { duration: 1.4 }); // hold the stolen state
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  const nodeAt = (x, y, song, colorState) => (
    <div key={`${song.id}-${x}`} className="absolute" style={{ left: x, top: y }}>
      <ArtNode card={{ album_art: song.art }} colorState={colorState} label={String(song.year)} />
    </div>
  );

  return (
    <div ref={ref} className="relative h-[320px] flex items-center justify-center">
      <div className="relative" style={{ width: 320, height: 290 }}>
        {/* Challenge toast */}
        <div
          data-steal-toast
          className="beat-card absolute left-1/2 -translate-x-1/2 top-0 px-3.5 py-2 flex items-center gap-2 text-xs font-bold whitespace-nowrap"
          style={{ borderColor: 'rgba(255, 20, 147, 0.4)' }}
        >
          <CoinView size={14} />
          <span>Leo challenges Maya's card!</span>
        </div>

        {/* Maya's timeline */}
        <span className="absolute text-[11px] font-black tracking-[0.18em] text-foreground/50" style={{ left: 24, top: 74 }}>
          MAYA
        </span>
        {nodeAt(110, 118, STEAL.maya[0])}
        {nodeAt(190, 118, STEAL.maya[1])}
        <div data-steal-mystery className="absolute" style={{ left: 270, top: 118 }}>
          <MysteryNode />
        </div>

        {/* Leo's timeline */}
        <span className="absolute text-[11px] font-black tracking-[0.18em] text-foreground/50" style={{ left: 24, top: 186 }}>
          LEO
        </span>
        <span data-steal-coin className="absolute" style={{ left: 62, top: 180 }} aria-hidden="true">
          <CoinView size={16} />
        </span>
        {nodeAt(110, 230, STEAL.leo[0])}
        <div className="absolute" style={{ left: 194 - 20, top: 230 - 20 }} aria-hidden="true">
          <span className="landing-empty-slot block" />
        </div>
        <div data-steal-won className="absolute" style={{ left: 194, top: 230, opacity: reduced ? 1 : 0 }}>
          <ArtNode
            card={{ album_art: STEAL.contested.art }}
            colorState="correct"
            label={String(STEAL.contested.year)}
          />
        </div>
        {nodeAt(278, 230, STEAL.leo[1])}
      </div>
    </div>
  );
}

export function StealSection() {
  return (
    <SectionShell
      number="04"
      kicker="Challenge & steal"
      accent="#FF1493"
      title="Coins are leverage"
      flip
      visual={<StealVisual />}
    >
      Spend a coin to skip a track you can't stand — or to challenge a friend's
      placement. Re-place the same song yourself, and if you're right where they
      were wrong, the card is yours.
    </SectionShell>
  );
}
