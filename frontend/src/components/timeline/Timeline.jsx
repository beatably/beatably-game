import React, { useState, useEffect, useMemo, useRef } from 'react';
import SongDebugPanel from '../../SongDebugPanel';
import {
  calculateLayout,
  buildPathD,
  NODE_SIZE,
  GAP_CIRCLE_SIZE,
} from './timelineLayout';
import { PathPair, PathGradientDefs } from './TimelinePath';
import ArtNode from './ArtNode';
import MysteryNode from './MysteryNode';
import GapCircle from './GapCircle';
import StartHintCallout from './StartHintCallout';
import usePlacementAnimation, { slidePosition } from './usePlacementAnimation';

const START_HINT_KEY = 'beatably_seen_start_hint';

// iOS-parity timeline (port of ios/Beatably/Components/TimelineView.swift).
// Same props contract as the old CurvedTimeline; node index i means
// "insert before confirmed-timeline position i".
const Timeline = ({
  timeline,
  currentCard,
  onNodeSelect,
  phase,
  isMyTurn,
  lastPlaced,
  challenge,
  pendingDropIndex,
  remotePreviewIndex = null,
  onCancelPending,
  onCardTap,
  currentPlayerName,
  roomCode,
  myPersistentId,
  timelineOwnerPersistentId,
  isSolo,
}) => {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Secret 6-tap on the title opens the song debug panel.
  const [tapCount, setTapCount] = useState(0);
  const tapTimerRef = useRef(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const handleSecretTap = (event) => {
    event.stopPropagation();
    const next = tapCount + 1;
    setTapCount(next);
    clearTimeout(tapTimerRef.current);
    if (next >= 6) {
      setShowDebugPanel(true);
      setTapCount(0);
      return;
    }
    tapTimerRef.current = setTimeout(() => setTapCount(0), 4000);
  };
  useEffect(() => () => clearTimeout(tapTimerRef.current), []);

  // Container measurement.
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    window.addEventListener('resize', update);
    let ro;
    if (window.ResizeObserver && containerRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (ro) ro.disconnect();
    };
  }, []);

  // ── Roles / interactivity ─────────────────────────────────────
  const isChallenger =
    phase === 'challenge' &&
    !!challenge?.challengerPersistentId &&
    challenge.challengerPersistentId === myPersistentId;
  const isInteractive = (phase === 'player-turn' && isMyTurn) || isChallenger;

  // ── Base cards for layout ─────────────────────────────────────
  // During challenge the real placed card is hidden and replaced by a distinct
  // "?" marker at its slot (the challenger re-places the same song, so the two
  // copies need distinct identities — iOS challengeMarkerId).
  const { baseCards, markerIdx, markerId } = useMemo(() => {
    if (phase === 'challenge' && lastPlaced) {
      const origIdx = timeline.findIndex((c) => c.id === lastPlaced.id);
      if (origIdx >= 0) {
        const orig = timeline[origIdx];
        const id = `${orig.id}-orig-marker`;
        const base = timeline.filter((c) => c.id !== lastPlaced.id);
        base.splice(Math.min(origIdx, base.length), 0, { ...orig, id });
        return { baseCards: base, markerIdx: origIdx, markerId: id };
      }
    }
    return { baseCards: timeline, markerIdx: null, markerId: null };
  }, [timeline, phase, lastPlaced]);

  // Layout gap index → confirmed index the backend expects (null = the
  // original's own slot during challenge, not a valid target).
  const gapToConfirmed = (g) => {
    if (markerIdx == null) return g;
    if (g === markerIdx || g === markerIdx + 1) return null;
    return g <= markerIdx ? g : g - 1;
  };
  // Confirmed insert index → layout insert index (accounts for the marker).
  const confirmedToLayout = (idx) => {
    if (markerIdx == null) return idx;
    return idx <= markerIdx ? idx : idx + 1;
  };

  // ── Pending placement (local selection or a remote observer preview) ──
  // Only the player who owns the placement can cancel by tapping the "?" node;
  // observers watching a remote preview pass no handler (iOS canCancelPending).
  const isLocalPending = pendingDropIndex != null;
  const pendingConfirmedIdx = pendingDropIndex != null ? pendingDropIndex : remotePreviewIndex;
  const pendingLayoutIdx =
    pendingConfirmedIdx != null && currentCard ? confirmedToLayout(pendingConfirmedIdx) : null;
  const pendingCard = useMemo(
    () => (currentCard ? { ...currentCard, id: `pending-${currentCard.id}` } : null),
    [currentCard]
  );

  const displayCards = useMemo(() => {
    if (pendingLayoutIdx == null || !pendingCard) return baseCards;
    const cards = [...baseCards];
    cards.splice(Math.min(pendingLayoutIdx, cards.length), 0, pendingCard);
    return cards;
  }, [baseCards, pendingLayoutIdx, pendingCard]);

  // Solo streaks can grow past the 4-row box; scroll instead of shrinking.
  const scrollMode = !!isSolo;

  // Stabilized layout height: the timeline is bottom-anchored, and the footer
  // grows during reveal (album art, and a taller two-line message on the
  // streak-ending reveal). We seed the layout height ONCE per width — from the
  // initial player-turn state, when the footer is shortest — and never shrink it
  // when the footer grows. (An earlier min-latch dropped on the tallest footer,
  // which shifted the board on the losing reveal.) Re-seed on width change
  // (rotation); footer growth never changes the width.
  const lastWidthRef = useRef(null);
  const [stableHeight, setStableHeight] = useState(0);
  useEffect(() => {
    const { width: w, height: h } = containerSize;
    if (!h) return;
    const FOOTER_RESERVE = 120; // reserve reveal-time footer growth
    if (w !== lastWidthRef.current) {
      lastWidthRef.current = w;
      setStableHeight(Math.max(h - FOOTER_RESERVE, 1));
    }
  }, [containerSize.width, containerSize.height]);

  const layoutContainer = useMemo(
    () => ({ width: containerSize.width, height: stableHeight || Math.max(containerSize.height - 120, 1) }),
    [containerSize.width, containerSize.height, stableHeight]
  );

  const anim = usePlacementAnimation({
    pendingIndex: pendingLayoutIdx,
    pendingCard,
    baseCards,
    containerSize: layoutContainer,
    scrollMode,
  });

  const layout = useMemo(
    () => calculateLayout(displayCards, layoutContainer, anim.active ? anim.lockedOffsetY : null, undefined, scrollMode),
    [displayCards, layoutContainer, anim.active, anim.lockedOffsetY, scrollMode]
  );
  const pathD = useMemo(() => buildPathD(layout.segments), [layout.segments]);
  const contentHeight = layout.contentHeight || containerSize.height;

  // Auto-scroll the active node (the card being placed, or the just-revealed
  // one) into view so it stays visible on a long, scrollable solo timeline.
  const activeCardId =
    pendingCard && pendingLayoutIdx != null ? pendingCard.id : lastPlaced ? lastPlaced.id : null;
  useEffect(() => {
    if (!scrollMode || !containerRef.current || !activeCardId) return;
    const it = layout.items.find((i) => i.type === 'year' && i.card.id === activeCardId);
    if (!it) return;
    const el = containerRef.current;
    const vh = el.clientHeight;
    const target = Math.max(0, Math.min(it.y - vh / 2, contentHeight - vh));
    el.scrollTo({ top: target, behavior: 'smooth' });
  }, [scrollMode, activeCardId, layout, contentHeight]);

  // ── Node state helpers ────────────────────────────────────────
  const isChallengeWindowMarker = (card) =>
    (phase === 'challenge-window' || phase === 'song-guess') &&
    lastPlaced &&
    card.id === lastPlaced.id;
  const isChallengeMarker = (card) => markerId != null && card.id === markerId;

  const cardColor = (card) => {
    if (challenge?.result) {
      if (card.challengerCard) return challenge.result.challengerCorrect ? 'correct' : 'incorrect';
      if (card.originalCard) return challenge.result.originalCorrect ? 'correct' : 'incorrect';
    }
    if (lastPlaced && card.id === lastPlaced.id) {
      if (phase === 'reveal') return lastPlaced.correct ? 'correct' : 'incorrect';
      if (phase === 'challenge-resolved' && !challenge?.result) {
        return lastPlaced.correct ? 'correct' : 'incorrect';
      }
    }
    return 'normal';
  };

  const ownerLabel = () => {
    if (!currentPlayerName) return null;
    return myPersistentId === timelineOwnerPersistentId ? 'You' : currentPlayerName;
  };

  const challengeResolvedLabel = (card) => {
    if (card.isYourGuess) return 'You';
    if (card.challengerCard) return challenge?.challengerName || 'Challenger';
    if (card.originalCard) return challenge?.targetName || currentPlayerName || 'Player';
    return null;
  };

  // Label under an art node: year for normal/correct cards; the placer's name
  // for an incorrect card (iOS nodeLabel semantics).
  const nodeLabelFor = (card) => {
    if (cardColor(card) === 'incorrect') {
      if (challenge?.result && (card.challengerCard || card.originalCard)) {
        return challengeResolvedLabel(card) || String(card.year);
      }
      return ownerLabel() || String(card.year);
    }
    return String(card.year);
  };

  const pendingLabel =
    phase === 'challenge'
      ? isChallenger
        ? 'You'
        : challenge?.challengerName || null
      : ownerLabel();

  // ── Start-of-game hint ────────────────────────────────────────
  const [hintDismissed, setHintDismissed] = useState(
    () => !!localStorage.getItem(START_HINT_KEY)
  );
  const showStartHint =
    !hintDismissed && phase === 'player-turn' && baseCards.length === 1 && !anim.active;
  useEffect(() => {
    if (!showStartHint) return;
    const timer = setTimeout(() => {
      localStorage.setItem(START_HINT_KEY, '1');
      setHintDismissed(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [showStartHint]);

  // "before / after" hints flanking the round-one single card.
  const showPositionHints = isInteractive && displayCards.length === 1;

  const showGaps = isInteractive && !anim.active && pendingLayoutIdx == null;

  const firstYearItem = layout.items.find((i) => i.type === 'year');

  return (
    <div
      ref={containerRef}
      className="curved-timeline-container w-full h-full relative"
      style={{
        overflowY: scrollMode ? 'auto' : 'hidden',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Timeline Title — hidden in solo (no other player, and it overlaps the
          top node once the streak grows) */}
      {currentPlayerName && !isSolo && (
        <div className="absolute top-4 left-4 right-4 z-10">
          <h2
            className="text-lg font-semibold text-foreground text-center cursor-pointer select-none truncate"
            onClick={handleSecretTap}
          >
            {currentPlayerName}'s timeline
          </h2>
        </div>
      )}

      {/* Scrollable content sized to the full node extent */}
      <div className="relative w-full" style={{ height: contentHeight }}>
      {/* Neon path */}
      <svg
        className="absolute top-0 left-0 w-full pointer-events-none"
        style={{ height: contentHeight, zIndex: 2 }}
      >
        <PathGradientDefs width={containerSize.width} height={contentHeight} />
        {anim.active ? (
          <>
            <PathPair
              d={buildPathD(anim.oldSegments)}
              opacity={Math.max(0, 1 - anim.frame.slideP * 3)}
            />
            <PathPair d={pathD} trim={anim.frame.trimP} />
          </>
        ) : (
          <PathPair d={pathD} />
        )}
      </svg>

      {/* Nodes */}
      <div className="absolute top-0 left-0 w-full" style={{ height: contentHeight, zIndex: 3 }}>
        {layout.items.map((item) => {
          if (item.type === 'year') {
            const card = item.card;
            const isPending = pendingCard && card.id === pendingCard.id;

            // Position: final layout position, or along the slide bezier
            // while the placement animation runs.
            let pos = { x: item.x, y: item.y };
            let pendingSize = NODE_SIZE;
            if (anim.active) {
              if (isPending && anim.gapSlide) {
                pos = slidePosition(anim.gapSlide, anim.frame.slideP);
                pendingSize =
                  GAP_CIRCLE_SIZE + (NODE_SIZE - GAP_CIRCLE_SIZE) * anim.frame.growP;
              } else {
                const slide = anim.slides.get(card.id);
                if (slide) pos = slidePosition(slide, anim.frame.slideP);
              }
            }

            let node;
            if (isPending) {
              node = (
                <MysteryNode
                  size={pendingSize}
                  label={pendingLabel}
                  onClick={isLocalPending && onCancelPending ? onCancelPending : undefined}
                />
              );
            } else if (isChallengeWindowMarker(card) || isChallengeMarker(card)) {
              node = <MysteryNode label={ownerLabel()} />;
            } else {
              node = (
                <ArtNode
                  card={card}
                  colorState={cardColor(card)}
                  label={nodeLabelFor(card)}
                  onClick={onCardTap ? () => onCardTap(card) : undefined}
                />
              );
            }

            return (
              <div
                key={`y-${card.id}-${item.cardIndex}`}
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
                  willChange: anim.active ? 'transform' : undefined,
                }}
              >
                {node}
              </div>
            );
          }

          // Gap slot
          const confirmedIdx = gapToConfirmed(item.index);
          if (!showGaps || confirmedIdx == null) return null;
          return (
            <div
              key={`g-${item.index}`}
              className="absolute"
              style={{ left: 0, top: 0, transform: `translate3d(${item.x}px, ${item.y}px, 0)` }}
            >
              {showPositionHints && (item.index === 0 || item.index === displayCards.length) && (
                <span
                  className="absolute pointer-events-none"
                  style={{
                    left: item.index === 0 ? -42 : 42,
                    top: 0,
                    transform: 'translate(-50%, -50%)',
                    fontSize: 12,
                    color: 'rgba(255, 255, 255, 0.55)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.index === 0 ? 'before' : 'after'}
                </span>
              )}
              <GapCircle nodeIndex={confirmedIdx} onSelect={onNodeSelect} />
            </div>
          );
        })}

        {/* Start-of-game hint bubble above the starter node */}
        {showStartHint && firstYearItem && (
          <div
            className="absolute"
            style={{
              left: firstYearItem.x,
              top: firstYearItem.y - NODE_SIZE / 2 - 14,
              transform: 'translate(-50%, -100%)',
              zIndex: 5,
            }}
          >
            <StartHintCallout text="Everyone starts with one random song on their timeline" />
          </div>
        )}
      </div>
      </div>

      {/* Song Debug Panel */}
      <SongDebugPanel
        roomCode={roomCode}
        isVisible={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
      />
    </div>
  );
};

export default Timeline;
