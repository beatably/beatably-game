import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  calculateLayout,
  buildPathD,
  MIN_MARGIN,
  NORMAL_SPACING,
  ROW_HEIGHT,
} from '@/components/timeline/timelineLayout';
import { PathPair, PathGradientDefs } from '@/components/timeline/TimelinePath';
import ArtNode from '@/components/timeline/ArtNode';
import MysteryNode from '@/components/timeline/MysteryNode';
import GapCircle from '@/components/timeline/GapCircle';
import { springProgress, easeOut } from '@/utils/spring';

// Same numbers as the game's placement animation (usePlacementAnimation):
// 600ms total, bouncy spring slides, quicker grow, path trims in over the
// first 35% while the old path crossfades out.
const DURATION_MS = 600;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Anchor the BOTTOM row at a fixed vertical position, independent of how many
// cards/rows currently exist. Using a fixed `referenceRows` reserves room above
// for the second row, so when a placement wraps the timeline onto a new row the
// original nodes keep their vertical level and only the new row grows upward
// (no whole-board vertical shift). referenceRows=2 matches the demos' max.
function bottomAnchoredOffsetY(size, minMargin, referenceRows = 2) {
  const availW = Math.max(size.width - 2 * minMargin, 1);
  const availH = Math.max(size.height - 2 * minMargin, 1);
  const scale = Math.min(availW / (3 * NORMAL_SPACING), availH / (3 * ROW_HEIGHT), 1);
  const contentH = (referenceRows - 1) * ROW_HEIGHT * scale;
  return size.height / 2 + contentH / 2;
}

// Marketing-demo timeline: renders real game primitives (ArtNode, MysteryNode,
// GapCircle, neon path) via the real layout engine, and animates card
// insertions/reorders with the game's spring curves.
//
// cards: [{ id, title, artist, year, art, mystery?, colorState? }]
// Non-interactive gap slot (same look as the game's GapCircle, no button).
export function InertGapDot() {
  return (
    <span
      className="absolute block rounded-full"
      aria-hidden="true"
      style={{
        left: -12,
        top: -12,
        width: 24,
        height: 24,
        backgroundColor: '#3A3B58',
        border: '1.5px solid #5A5B7A',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
      }}
    />
  );
}

export function GapPulseRing() {
  return (
    <span
      className="absolute block rounded-full pointer-events-none"
      aria-hidden="true"
      style={{
        left: -16,
        top: -16,
        width: 32,
        height: 32,
        border: '2px solid rgba(153, 69, 255, 0.9)',
        animation: 'beat-pulse-ring 1.4s ease-in-out infinite',
      }}
    />
  );
}

function DemoTimeline({
  cards,
  showGaps = false,
  onGapSelect = null, // gaps are tappable when provided
  highlightGap = null, // gap index to pulse (attention hint)
  revealPopId = null, // card id that just flipped art-side-up
  height = null, // px number, or null to size via className (e.g. h-[270px])
  minMargin = MIN_MARGIN, // shrink to reclaim width on narrow screens
  className = '',
}) {
  const containerRef = useRef(null);
  const [size, setSize] = useState(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s && Math.abs(s.width - r.width) < 1 && Math.abs(s.height - r.height) < 1
          ? s
          : { width: r.width, height: r.height }
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!size) return null;
    return calculateLayout(cards, size, bottomAnchoredOffsetY(size, minMargin), minMargin);
  }, [cards, size, minMargin]);

  // ── Placement transition ─────────────────────────────────────
  const prevRef = useRef(null); // { ids, layout, size }
  const animRef = useRef(null); // { start, from: Map(id -> {x,y,grow}), oldPathD, raf }
  const [, setFrame] = useState(0);

  useLayoutEffect(() => {
    if (!layout || !size) return undefined;
    const ids = cards.map((c) => c.id);
    const prev = prevRef.current;
    prevRef.current = { ids, layout, size };

    if (!prev || prev.size !== size || prefersReducedMotion()) return undefined;

    const added = ids.filter((id) => !prev.ids.includes(id));
    const isInsertion = added.length === 1 && ids.length === prev.ids.length + 1;
    const isReorder =
      added.length === 0 &&
      ids.length === prev.ids.length &&
      ids.some((id, i) => prev.ids[i] !== id);
    if (!isInsertion && !isReorder) return undefined;

    const from = new Map();
    for (const item of prev.layout.items) {
      if (item.type === 'year') from.set(item.card.id, { x: item.x, y: item.y });
    }
    if (isInsertion) {
      // The new card grows out of the gap it was dropped on (gap index ==
      // insertion index in the layout engine).
      const insertIdx = ids.indexOf(added[0]);
      const gap = prev.layout.items.find((it) => it.type === 'gap' && it.index === insertIdx);
      if (gap) from.set(added[0], { x: gap.x, y: gap.y, grow: true });
    }

    if (animRef.current?.raf) cancelAnimationFrame(animRef.current.raf);
    const anim = { start: performance.now(), from, oldPathD: buildPathD(prev.layout.segments) };
    animRef.current = anim;
    const loop = (now) => {
      if (animRef.current !== anim) return;
      if (now - anim.start >= DURATION_MS) {
        animRef.current = null;
        setFrame((n) => n + 1);
        return;
      }
      setFrame((n) => n + 1);
      anim.raf = requestAnimationFrame(loop);
    };
    anim.raf = requestAnimationFrame(loop);

    return () => {
      if (animRef.current?.raf) cancelAnimationFrame(animRef.current.raf);
    };
  }, [layout, size, cards]);

  const sizeStyle = height != null ? { height } : undefined;

  if (!layout) {
    return <div ref={containerRef} className={`relative w-full ${className}`} style={sizeStyle} />;
  }

  const anim = animRef.current;
  const elapsedSec = anim ? (performance.now() - anim.start) / 1000 : 1;
  const slideP = anim ? springProgress(elapsedSec, 0.35, 0.6) : 1;
  const growP = anim ? springProgress(elapsedSec, 0.32, 0.5) : 1;
  const trimP = anim ? easeOut(elapsedSec / (0.35 * (DURATION_MS / 1000))) : 1;
  const oldPathOpacity = anim ? Math.max(0, 1 - trimP) : 0;
  const pathD = buildPathD(layout.segments);

  const gaps = layout.items.filter((it) => it.type === 'gap');
  const years = layout.items.filter((it) => it.type === 'year');

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} style={sizeStyle}>
      <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }} aria-hidden="true">
        <PathGradientDefs />
        {anim && <PathPair d={anim.oldPathD} opacity={oldPathOpacity} />}
        <PathPair d={pathD} trim={anim ? trimP : null} />
      </svg>

      {/* Gap slots (hidden while a placement is animating, like the game) */}
      {showGaps &&
        !anim &&
        gaps.map((gap) => (
          <div key={`gap-${gap.index}`} className="absolute" style={{ left: gap.x, top: gap.y }}>
            {onGapSelect ? (
              <GapCircle nodeIndex={gap.index} onSelect={onGapSelect} />
            ) : (
              <InertGapDot />
            )}
            {highlightGap === gap.index && <GapPulseRing />}
          </div>
        ))}

      {/* Cards */}
      {years.map((item) => {
        const card = item.card;
        const from = anim?.from.get(card.id);
        const x = from ? from.x + (item.x - from.x) * slideP : item.x;
        const y = from ? from.y + (item.y - from.y) * slideP : item.y;
        const scale = from?.grow ? 0.6 + 0.4 * growP : 1;
        return (
          <div
            key={card.id}
            className="absolute"
            style={{
              left: x,
              top: y,
              transform: scale !== 1 ? `scale(${scale})` : undefined,
            }}
          >
            {card.mystery ? (
              <MysteryNode />
            ) : (
              <span
                key={revealPopId === card.id ? 'pop' : 'still'}
                className={`block absolute ${revealPopId === card.id ? 'landing-reveal-pop' : ''}`}
              >
                <ArtNode
                  card={{ album_art: card.art }}
                  colorState={card.colorState}
                  label={String(card.year)}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default DemoTimeline;
