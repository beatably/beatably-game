// Pure port of the iOS layout engine (ios/Beatably/Components/TimelineLayout.swift).
// Cards snake upward in rows of 3 (boustrophedon); the scale is computed from a
// fixed 4-row reference box so the board never rescales as cards accumulate.

export const NORMAL_SPACING = 100;
export const ROW_HEIGHT = 80;
export const MIN_MARGIN = 44;
export const CURVE_EXTEND = 58;

export const GAP_CIRCLE_SIZE = 24;
export const NODE_SIZE = 40;
export const NODE_CORNER_RADIUS = 16;
export const NODE_LABEL_OFFSET = 33;

// Returns { items, segments, scale, offsetX, offsetY }
//   items: { type: 'year', card, cardIndex, x, y } | { type: 'gap', index, x, y }
//   segments: { type: 'move'|'line', x, y } | { type: 'curve', x, y, c1x, c1y, c2x, c2y }
// `minMargin` lets a caller (e.g. the landing-page demo on a narrow phone)
// reclaim horizontal room by shrinking the board's side margin. Defaults to
// MIN_MARGIN so the game's own callers are unaffected.
export function calculateLayout(cards, containerSize, overrideOffsetY = null, minMargin = MIN_MARGIN) {
  const total = cards.length;

  // ── Step 1: raw positions ────────────────────────────────────
  const rawYears = [];
  for (let i = 0; i < total; i++) {
    const sectionIndex = Math.floor(i / 3);
    const posInSection = i % 3;
    const sectionY = -sectionIndex * ROW_HEIGHT;
    const isEven = sectionIndex % 2 === 0;
    const x = isEven ? posInSection * NORMAL_SPACING : (2 - posInSection) * NORMAL_SPACING;
    rawYears.push({ x, y: sectionY, sectionIndex });
  }

  // ── Step 2: bounding box of actual content ───────────────────
  const xs = rawYears.map((r) => r.x);
  const minX = (xs.length ? Math.min(...xs) : 0) - NORMAL_SPACING / 2;
  const maxX = (xs.length ? Math.max(...xs) : 0) + NORMAL_SPACING / 2;
  const rawW = maxX - minX;

  // ── Step 3: scale + offset (fixed 4-row reference box) ───────
  const fixedRawW = 3 * NORMAL_SPACING; // 300
  const fixedRawH = 3 * ROW_HEIGHT; // 240
  const availW = Math.max(containerSize.width - 2 * minMargin, 1);
  const availH = Math.max(containerSize.height - 2 * minMargin, 1);
  const scaleX = fixedRawW > availW ? availW / fixedRawW : 1;
  const scaleY = fixedRawH > availH ? availH / fixedRawH : 1;
  const scale = Math.min(scaleX, scaleY, 1);

  const scaledW = rawW * scale;
  const offsetX = containerSize.width / 2 - scaledW / 2 - minX * scale;
  const fixedMinY = -3 * ROW_HEIGHT; // -240
  const offsetY =
    overrideOffsetY != null
      ? overrideOffsetY
      : containerSize.height / 2 - (fixedRawH * scale) / 2 - fixedMinY * scale;

  const toScreen = (x, y) => ({ x: x * scale + offsetX, y: y * scale + offsetY });
  const years = rawYears.map((r) => ({ pos: toScreen(r.x, r.y), sectionIndex: r.sectionIndex }));

  // ── Step 4: path segments ─────────────────────────────────────
  const segments = [];
  const scaledCurve = CURVE_EXTEND * scale;

  if (total > 0) {
    const first = years[0];
    const firstGapX = first.pos.x - (NORMAL_SPACING / 2) * scale;
    segments.push({ type: 'move', x: firstGapX, y: first.pos.y });
    segments.push({ type: 'line', x: first.pos.x, y: first.pos.y });

    for (let i = 0; i < total - 1; i++) {
      const cur = years[i];
      const next = years[i + 1];
      const isVertical = Math.abs(next.pos.y - cur.pos.y) > 30 * scale;
      if (isVertical) {
        const isEvenSection = cur.sectionIndex % 2 === 0;
        const cx1x = cur.pos.x + (isEvenSection ? scaledCurve : -scaledCurve);
        const cx2x = next.pos.x + (isEvenSection ? scaledCurve : -scaledCurve);
        segments.push({
          type: 'curve',
          x: next.pos.x,
          y: next.pos.y,
          c1x: cx1x,
          c1y: cur.pos.y,
          c2x: cx2x,
          c2y: next.pos.y,
        });
      } else {
        segments.push({ type: 'line', x: next.pos.x, y: next.pos.y });
      }
    }

    const last = years[total - 1];
    const isEvenLast = last.sectionIndex % 2 === 0;
    const lastGapX = isEvenLast
      ? last.pos.x + (NORMAL_SPACING / 2) * scale
      : last.pos.x - (NORMAL_SPACING / 2) * scale;
    segments.push({ type: 'line', x: lastGapX, y: last.pos.y });
  }

  // ── Step 5: items (years interleaved with tappable gaps) ─────
  const items = [];
  let gapIdx = 0;

  if (total === 0) {
    items.push({
      type: 'gap',
      index: gapIdx,
      x: containerSize.width / 2,
      y: containerSize.height / 2,
    });
    return { items, segments, scale, offsetX, offsetY };
  }

  const first = years[0];
  items.push({
    type: 'gap',
    index: gapIdx++,
    x: first.pos.x - (NORMAL_SPACING / 2) * scale,
    y: first.pos.y,
  });

  for (let i = 0; i < total; i++) {
    const y = years[i];
    items.push({ type: 'year', card: cards[i], cardIndex: i, x: y.pos.x, y: y.pos.y });
    if (i < total - 1) {
      const next = years[i + 1];
      const isVertical = Math.abs(next.pos.y - y.pos.y) > 30 * scale;
      const midX = (y.pos.x + next.pos.x) / 2;
      const midY = (y.pos.y + next.pos.y) / 2;
      if (isVertical) {
        const isEvenSection = y.sectionIndex % 2 === 0;
        const shift = (ROW_HEIGHT / 2) * scale;
        items.push({
          type: 'gap',
          index: gapIdx++,
          x: isEvenSection ? midX + shift : midX - shift,
          y: midY,
        });
      } else {
        items.push({ type: 'gap', index: gapIdx++, x: midX, y: midY });
      }
    }
  }

  const last = years[total - 1];
  const isEvenLast = last.sectionIndex % 2 === 0;
  items.push({
    type: 'gap',
    index: gapIdx,
    x: isEvenLast
      ? last.pos.x + (NORMAL_SPACING / 2) * scale
      : last.pos.x - (NORMAL_SPACING / 2) * scale,
    y: last.pos.y,
  });

  return { items, segments, scale, offsetX, offsetY };
}

export function buildPathD(segments) {
  let d = '';
  for (const seg of segments) {
    if (seg.type === 'move') d += `M ${seg.x} ${seg.y}`;
    else if (seg.type === 'line') d += ` L ${seg.x} ${seg.y}`;
    else d += ` C ${seg.c1x} ${seg.c1y} ${seg.c2x} ${seg.c2y} ${seg.x} ${seg.y}`;
  }
  return d;
}
