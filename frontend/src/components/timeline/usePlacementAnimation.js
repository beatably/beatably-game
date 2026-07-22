import { useEffect, useRef, useState } from 'react';
import { calculateLayout, CURVE_EXTEND } from './timelineLayout';
import { springProgress, easeOut, smoothstep } from '../../utils/spring';

// Port of the iOS placement animation (TimelineView.swift triggerAnimation +
// PathFollower). When a gap is tapped, every node whose position changes
// slides along a cubic bezier with a bouncy spring, the tapped slot grows
// 24→40px, and the new path trims in while the old one crossfades out.

const OVERSHOOT_PIXELS = 105;
const DURATION_MS = 600;

// Evaluate a slide at (possibly unclamped) progress p: cubic bezier for
// p ∈ [0,1] plus the signed fixed-pixel spring overshoot along the travel
// direction, weighted in near arrival (exact PathFollower port).
export function slidePosition(slide, p) {
  const t = Math.min(Math.max(p, 0), 1);
  const mt = 1 - t;
  let x =
    mt * mt * mt * slide.from.x +
    3 * mt * mt * t * slide.c1.x +
    3 * mt * t * t * slide.c2.x +
    t * t * t * slide.to.x;
  let y =
    mt * mt * mt * slide.from.y +
    3 * mt * mt * t * slide.c1.y +
    3 * mt * t * t * slide.c2.y +
    t * t * t * slide.to.y;

  const dx = slide.to.x - slide.from.x;
  const dy = slide.to.y - slide.from.y;
  const len = Math.hypot(dx, dy);
  if (len > 0.5) {
    const w = smoothstep(p, 0.7, 0.97);
    const px = (p - 1) * OVERSHOOT_PIXELS * w;
    x += (dx / len) * px;
    y += (dy / len) * px;
  }
  return { x, y };
}

// pendingIndex: layout-space insert index (or null). baseCards: the cards laid
// out WITHOUT the pending card. pendingCard: the card being placed.
export default function usePlacementAnimation({
  pendingIndex,
  pendingCard,
  baseCards,
  containerSize,
  scrollMode = false,
}) {
  const [frame, setFrame] = useState(null); // { slideP, trimP, growP } while animating
  const dataRef = useRef(null); // { slides, gapSlide, oldSegments, lockedOffsetY }
  const rafRef = useRef(null);

  // Latest inputs, read at trigger time without retriggering the effect.
  const inputsRef = useRef({});
  inputsRef.current = { pendingCard, baseCards, containerSize, scrollMode };

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dataRef.current = null;
    setFrame(null);
  };

  const prevPendingRef = useRef(pendingIndex);
  useEffect(() => {
    const prev = prevPendingRef.current;
    prevPendingRef.current = pendingIndex;

    if (pendingIndex != null && prev == null) {
      const { pendingCard: card, baseCards: cards, containerSize: size, scrollMode: scroll } = inputsRef.current;
      if (!card || !size || size.width === 0) return;

      // Old layout — its offsetY is locked for the whole animation. Must match
      // the main render's scroll mode or the animation snaps to a different
      // scale/offset.
      const oldLayout = calculateLayout(cards, size, null, undefined, scroll);
      const newCards = [...cards];
      newCards.splice(Math.min(pendingIndex, newCards.length), 0, card);
      const newLayout = calculateLayout(newCards, size, oldLayout.offsetY, undefined, scroll);

      const oldYearPos = new Map();
      const oldGapPos = new Map();
      for (const item of oldLayout.items) {
        if (item.type === 'year') oldYearPos.set(item.card.id, { x: item.x, y: item.y });
        else oldGapPos.set(item.index, { x: item.x, y: item.y });
      }
      const newYearPos = new Map();
      for (const item of newLayout.items) {
        if (item.type === 'year') newYearPos.set(item.card.id, { x: item.x, y: item.y });
      }

      const scale = oldLayout.scale;
      const curveExt = CURVE_EXTEND * scale;

      // Slides for every card whose screen position changes (cards before the
      // insertion point still shift when the row re-centers).
      const slides = new Map();
      cards.forEach((c, origIdx) => {
        const from = oldYearPos.get(c.id);
        const to = newYearPos.get(c.id);
        if (!from || !to) return;
        if (from.x === to.x && from.y === to.y) return;
        const newIdx = origIdx >= pendingIndex ? origIdx + 1 : origIdx;
        const crossesRow = Math.floor(origIdx / 3) !== Math.floor(newIdx / 3);
        let c1, c2;
        if (crossesRow) {
          const isEven = Math.floor(origIdx / 3) % 2 === 0;
          c1 = { x: from.x + (isEven ? curveExt : -curveExt), y: from.y };
          c2 = { x: to.x + (isEven ? curveExt : -curveExt), y: to.y };
        } else {
          c1 = from;
          c2 = to;
        }
        slides.set(c.id, { from, to, c1, c2 });
      });

      // Tapped gap → pending card destination.
      let gapSlide = null;
      const gapFrom = oldGapPos.get(pendingIndex);
      const gapTo = newYearPos.get(card.id);
      if (gapFrom && gapTo) {
        const crossesRow = Math.abs(gapTo.y - gapFrom.y) > 20 * scale;
        let c1, c2;
        if (crossesRow) {
          const isEven = Math.floor(pendingIndex / 3) % 2 === 0;
          c1 = { x: gapFrom.x + (isEven ? -curveExt : curveExt), y: gapFrom.y };
          c2 = { x: gapTo.x + (isEven ? -curveExt : curveExt), y: gapTo.y };
        } else {
          c1 = gapFrom;
          c2 = gapTo;
        }
        gapSlide = { from: gapFrom, to: gapTo, c1, c2 };
      }

      dataRef.current = {
        slides,
        gapSlide,
        oldSegments: oldLayout.segments,
        lockedOffsetY: oldLayout.offsetY,
      };

      const start = performance.now();
      const tick = (now) => {
        const t = (now - start) / 1000;
        if (t * 1000 >= DURATION_MS) {
          stop();
          return;
        }
        setFrame({
          slideP: springProgress(t, 0.35, 0.6),
          trimP: easeOut(t / 0.35),
          growP: Math.min(Math.max(springProgress(t, 0.32, 0.5), 0), 1.15),
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      setFrame({ slideP: 0, trimP: 0, growP: 0 });
      rafRef.current = requestAnimationFrame(tick);
    } else if (pendingIndex == null && prev != null) {
      // Cancel / confirm — snap to idle instantly.
      stop();
    }
  }, [pendingIndex]);

  useEffect(() => stop, []); // unmount cleanup

  const active = frame != null && dataRef.current != null;
  return {
    active,
    frame: active ? frame : null,
    slides: active ? dataRef.current.slides : null,
    gapSlide: active ? dataRef.current.gapSlide : null,
    oldSegments: active ? dataRef.current.oldSegments : null,
    lockedOffsetY: active ? dataRef.current.lockedOffsetY : null,
  };
}
