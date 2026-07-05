import SwiftUI

private let gapCircleSize: CGFloat = 24     // tappable placement slot (circle)
private let nodeSize: CGFloat = 40          // album-art / mystery node side length
private let nodeCornerRadius: CGFloat = 16  // node corner radius
private let nodeLabelOffset: CGFloat = 33   // year/name label center, below the node center
private let startHintGap: CGFloat = 14      // gap between the callout tail tip and the node top

// MARK: - PathFollower

/// Moves a view from its placed position along a cubic bezier as `progress` animates 0→1.
/// c1 == from and c2 == to collapses to straight-line motion.
private struct PathFollower: GeometryEffect {
    var progress: CGFloat
    let from: CGPoint
    let to: CGPoint
    let c1: CGPoint
    let c2: CGPoint

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    // One unit of spring oscillation (progress − 1) maps to this many pixels along the
    // travel direction — a FIXED magnitude for every node regardless of slide distance,
    // so a long row-crossing slide doesn't overshoot proportionally further than a short one.
    static let overshootPixels: CGFloat = 105

    func effectValue(size: CGSize) -> ProjectionTransform {
        // Base motion follows the bezier for progress in [0,1] (clamped — no distance-
        // proportional extrapolation).
        let t = min(max(progress, 0), 1), mt = 1 - t
        var x = mt*mt*mt*from.x + 3*mt*mt*t*c1.x + 3*mt*t*t*c2.x + t*t*t*to.x
        var y = mt*mt*mt*from.y + 3*mt*mt*t*c1.y + 3*mt*t*t*c2.y + t*t*t*to.y

        // Bounce: the spring makes `progress` oscillate around 1 (overshoot → rebound →
        // overshoot, decaying). Applying the SIGNED (progress − 1) as a fixed-pixel offset
        // along the travel direction reproduces that whole decaying oscillation — a real
        // bounce, not a single overshoot. Weighted in only near arrival (smoothstep) so the
        // negative values during the initial approach don't drag the node backward.
        let dx = to.x - from.x, dy = to.y - from.y
        let len = (dx * dx + dy * dy).squareRoot()
        if len > 0.5 {
            let w = PathFollower.smoothstep(progress, 0.7, 0.97)
            let px = (progress - 1) * PathFollower.overshootPixels * w
            x += dx / len * px
            y += dy / len * px
        }
        return ProjectionTransform(CGAffineTransform(translationX: x - from.x, y: y - from.y))
    }

    private static func smoothstep(_ x: CGFloat, _ e0: CGFloat, _ e1: CGFloat) -> CGFloat {
        let t = min(max((x - e0) / (e1 - e0), 0), 1)
        return t * t * (3 - 2 * t)
    }
}

// MARK: - TimelinePath shape (supports trim animation)

private struct TimelinePath: Shape {
    let segments: [PathSegment]
    func path(in rect: CGRect) -> Path { buildPath(from: segments) }
}

// MARK: - Slide data

private struct PillSlide {
    let songId: String
    let fromPos: CGPoint
    let toPos: CGPoint
    let c1: CGPoint
    let c2: CGPoint
}

private struct GapSlide {
    let fromPos: CGPoint
    let toPos: CGPoint
    let c1: CGPoint
    let c2: CGPoint
}

// MARK: - Animation phase

private enum PlacementAnimPhase {
    case idle
    case animating   // nodes slide along the path (full size) while the path grows
}

// MARK: - TimelineView

struct TimelineView: View {
    let cards: [Song]
    let isInteractive: Bool
    var pendingIndex: Int? = nil
    var pendingSong: Song? = nil
    var lastPlacedId: String? = nil
    var gamePhase: String = "player-turn"
    var disabledIndex: Int? = nil
    var disabledLabel: String? = nil
    var pendingLabel: String? = nil
    var cardLabels: [String: String] = [:]
    var placementResult: PlacementResult? = nil
    var challengeResult: ChallengeResult? = nil
    var startHint: String? = nil
    let onPlace: (Int) -> Void

    // ── Animation state ──────────────────────────────────────────────
    @State private var containerSize: CGSize = .zero
    @State private var animPhase: PlacementAnimPhase = .idle
    @State private var startHintHeight: CGFloat = 84   // measured; seeded near the real height

    // Captured at animation start to keep Y locked during animation.
    @State private var capturedOffsetY: CGFloat? = nil
    @State private var capturedOldSegments: [PathSegment] = []

    // Drives circle movement (PathFollower) and path opacity crossfade.
    @State private var slideProgress: CGFloat = 0
    // Drives path trim growth (separate so we can ease independently).
    @State private var pathTrimEnd: CGFloat = 1.0

    // The tapped gap grows from a 24pt slot to a full 32pt node while it slides.
    @State private var gapGrown = false

    // Slide data for moving nodes and the tapped gap.
    @State private var pillSlides: [PillSlide] = []
    @State private var gapSlide: GapSlide? = nil

    // The original player's placement, shown to the challenger as a full "?" marker slot.
    // A distinct id keeps it separate from the challenger's pending card (same song), and
    // giving it a real slot (rather than floating at a half-gap) fixes the cramped spacing.
    private var challengeMarkerId: String { (pendingSong?.id ?? "song") + "-orig-marker" }
    private var challengeMarkerCard: Song? {
        guard gamePhase == "challenge", disabledIndex != nil, let c = pendingSong else { return nil }
        return Song(id: challengeMarkerId, title: c.title, artist: c.artist, year: c.year,
                    previewURL: c.previewURL, albumArt: c.albumArt, isPreview: c.isPreview)
    }
    private func isChallengeMarker(_ song: Song) -> Bool { song.id == challengeMarkerId }

    // Confirmed cards, plus (in challenge) the original's marker inserted at its slot.
    // Shared by the body layout and triggerAnimation so positions stay consistent.
    private var layoutBaseCards: [Song] {
        var base = TimelineView.filterDisplayCards(cards, lastPlacedId: lastPlacedId, gamePhase: gamePhase)
        if gamePhase == "challenge", let d = disabledIndex, let marker = challengeMarkerCard {
            base.insert(marker, at: min(d, base.count))
        }
        return base
    }

    // ── Display cards (with pending spliced in when set) ─────────────
    private var displayCards: [Song] {
        var base = layoutBaseCards
        if let cIdx = pendingIndex, let song = pendingSong {
            base.insert(song, at: min(layoutInsertIndex(forConfirmed: cIdx), base.count))
        }
        return base
    }

    static func filterDisplayCards(_ cards: [Song], lastPlacedId: String?, gamePhase: String) -> [Song] {
        // Only the challenge phase hides the real card (the original's placement is shown via a
        // synthesized marker instead). During song-guess the placed card stays on the timeline —
        // rendered as a hidden "?" marker (see isChallengWindowMarker) so it's visible to everyone.
        guard gamePhase == "challenge", let lid = lastPlacedId else { return cards }
        return cards.filter { $0.id != lid }
    }

    // Confirmed gap index → index within layoutBaseCards (accounts for the inserted marker).
    private func layoutInsertIndex(forConfirmed confirmedIdx: Int) -> Int {
        guard gamePhase == "challenge", let d = disabledIndex else { return confirmedIdx }
        return confirmedIdx <= d ? confirmedIdx : confirmedIdx + 1
    }

    // Layout gap index → the confirmed-timeline index the backend expects, or nil if the
    // gap is the original's own slot (not a valid challenger target).
    private func confirmedGapIndex(forLayoutGap g: Int) -> Int? {
        guard gamePhase == "challenge", let d = disabledIndex else { return g }
        if g == d || g == d + 1 { return nil }   // the two gaps flanking the marker = original's slot
        return g <= d ? g : g - 1
    }

    // MARK: - Body

    var body: some View {
        GeometryReader { geo in
            let layout = TimelineLayout.calculate(
                cards: displayCards,
                containerSize: geo.size,
                lastPlacedId: lastPlacedId,
                gamePhase: gamePhase,
                isInteractive: isInteractive,
                overrideOffsetY: animPhase != .idle ? capturedOffsetY : nil
            )

            ZStack {
                pathLayers(layout: layout, size: geo.size)
                timelineNodes(layout: layout)
                startHintOverlay(layout: layout)
            }
            .background(
                Color.clear
                    .onGeometryChange(for: CGSize.self, of: { $0.size }) { containerSize = $0 }
            )
        }
        .onChange(of: pendingIndex) { old, new in
            if new != nil, old == nil {
                triggerAnimation()
            } else if new == nil, animPhase != .idle {
                // Cancel — snap back instantly.
                animPhase = .idle
                gapGrown = false
                slideProgress = 0
                pathTrimEnd = 1.0
                pillSlides = []
                gapSlide = nil
                capturedOffsetY = nil
                capturedOldSegments = []
            }
        }
        .onChange(of: cards.count) { _, _ in
            // Card confirmed — release locked Y so the next placement gets a fresh centered layout.
            capturedOffsetY = nil
        }
        .animation(.spring(duration: 0.35), value: cards.count)
    }

    // MARK: - Path layers

    @ViewBuilder
    private func pathLayers(layout: TimelineLayoutResult, size: CGSize) -> some View {
        if animPhase == .animating {
            // Old path fades out quickly as slide starts.
            let oldOpacity = max(0, 1.0 - slideProgress * 3.0)

            Canvas { ctx, _ in
                let path = buildPath(from: capturedOldSegments)
                ctx.stroke(path, with: .color(Color.beatMagenta.opacity(0.6)),
                           style: StrokeStyle(lineWidth: 30, lineCap: .round, lineJoin: .round))
            }
            .blur(radius: 12)
            .opacity(oldOpacity * 0.18)
            .allowsHitTesting(false)

            Canvas { ctx, _ in
                let path = buildPath(from: capturedOldSegments)
                ctx.stroke(path, with: .linearGradient(
                    Gradient(stops: [
                        .init(color: Color.beatPurple.opacity(0.65),  location: 0),
                        .init(color: Color.beatMagenta.opacity(0.55), location: 0.5),
                        .init(color: Color.beatCyan.opacity(0.55),    location: 1),
                    ]),
                    startPoint: .zero,
                    endPoint: CGPoint(x: size.width, y: size.height)),
                           style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            }
            .opacity(oldOpacity)
            .allowsHitTesting(false)

            // New path trims in from the start.
            TimelinePath(segments: layout.segments)
                .trim(from: 0, to: pathTrimEnd)
                .stroke(Color.beatMagenta.opacity(0.6), lineWidth: 30)
                .blur(radius: 12)
                .opacity(0.18)
                .allowsHitTesting(false)

            TimelinePath(segments: layout.segments)
                .trim(from: 0, to: pathTrimEnd)
                .stroke(
                    LinearGradient(stops: [
                        .init(color: Color.beatPurple.opacity(0.65),  location: 0),
                        .init(color: Color.beatMagenta.opacity(0.55), location: 0.5),
                        .init(color: Color.beatCyan.opacity(0.55),    location: 1),
                    ],
                    startPoint: .leading, endPoint: .trailing),
                    lineWidth: 4
                )
                .allowsHitTesting(false)

        } else {
            // Normal full-path Canvas rendering.
            Canvas { ctx, _ in
                ctx.stroke(buildPath(from: layout.segments),
                           with: .color(Color.beatMagenta.opacity(0.6)),
                           style: StrokeStyle(lineWidth: 30, lineCap: .round, lineJoin: .round))
            }
            .blur(radius: 12)
            .opacity(0.18)
            .allowsHitTesting(false)

            Canvas { ctx, size in
                ctx.stroke(buildPath(from: layout.segments),
                           with: .linearGradient(
                            Gradient(stops: [
                                .init(color: Color.beatPurple.opacity(0.65),  location: 0),
                                .init(color: Color.beatMagenta.opacity(0.55), location: 0.5),
                                .init(color: Color.beatCyan.opacity(0.55),    location: 1),
                            ]),
                            startPoint: .zero,
                            endPoint: CGPoint(x: size.width, y: size.height)),
                           style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            }
            .allowsHitTesting(false)
        }
    }

    // MARK: - Timeline nodes (single render path for idle + slide)

    // One ForEach over the layout drives both the idle and the animating state, so every
    // node keeps a stable SwiftUI identity across the .animating → .idle transition and
    // is never torn down / re-created (which previously flashed the whole timeline).
    // Movement is a PathFollower whose params collapse to a no-op when a node isn't sliding.
    @ViewBuilder
    private func timelineNodes(layout: TimelineLayoutResult) -> some View {
        ForEach(layout.items, id: \.stableId) { item in
            switch item.kind {
            case .year(let song, _):
                let isPending = pendingIndex != nil && song.id == pendingSong?.id
                let slide = slideFor(song: song, isPending: isPending)
                Group {
                    if isPending {
                        // The placing player's node: solid magenta "?" that grows from the
                        // tapped slot to full size as it slides into place.
                        MysteryNode(size: (animPhase == .animating && !gapGrown) ? gapCircleSize : nodeSize,
                                    label: pendingLabel)
                    } else if isChallengWindowMarker(song) || isChallengeMarker(song) {
                        // Placed/challenged card shown as the pink "?" marker, year hidden.
                        MysteryNode(label: yearLabel(for: song))
                    } else {
                        ArtNode(song: song, colorState: cardColor(song),
                                label: nodeLabel(for: song))
                    }
                }
                .position(slide?.from ?? item.position)
                .modifier(PathFollower(progress: slideProgress,
                                       from: slide?.from ?? item.position,
                                       to:   slide?.to   ?? item.position,
                                       c1:   slide?.c1   ?? item.position,
                                       c2:   slide?.c2   ?? item.position))

            case .gap(let idx):
                // Map the layout gap to the confirmed index the backend expects; nil means
                // this gap is the original's own slot (challenge) and isn't selectable.
                let confirmedIdx = confirmedGapIndex(forLayoutGap: idx)
                let showAsGap = isInteractive && animPhase == .idle && pendingIndex == nil
                                && confirmedIdx != nil
                if showAsGap, let confirmedIdx {
                    if let hint = positionHintFor(idx) {
                        // Flank the single year: "before" sits to the left of the left gap,
                        // "after" to the right of the right gap — level with the tappable nodes.
                        let isBefore = idx == 0
                        Text(hint)
                            .font(.system(size: 12, weight: .regular, design: .rounded))
                            .foregroundStyle(.white.opacity(0.55))
                            .lineLimit(1).fixedSize()
                            .position(CGPoint(x: item.position.x + (isBefore ? -42 : 42),
                                              y: item.position.y))
                    }
                    GapCircle(index: idx, isSelected: false, isDisabled: false,
                              onPlace: { _ in onPlace(confirmedIdx) })
                        .position(item.position)
                }
            }
        }
    }

    // MARK: - Start-of-game hint

    // The bubble sizes itself (via its own maxWidth); we measure its height and place its
    // center so the tail tip lands `startHintGap` above the first node's top edge.
    @ViewBuilder
    private func startHintOverlay(layout: TimelineLayoutResult) -> some View {
        if let text = startHint,
           let nodePos = layout.items.first(where: { $0.isYear })?.position {
            StartHintCallout(text: text)
                .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { startHintHeight = $0 }
                .position(x: nodePos.x,
                          y: nodePos.y - nodeSize / 2 - startHintGap - startHintHeight / 2)
                .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .bottom)))
        }
    }

    // The bezier a node follows this frame, or nil when it isn't moving (→ PathFollower no-op).
    private func slideFor(song: Song, isPending: Bool)
        -> (from: CGPoint, to: CGPoint, c1: CGPoint, c2: CGPoint)? {
        guard animPhase == .animating else { return nil }
        if isPending, let gs = gapSlide { return (gs.fromPos, gs.toPos, gs.c1, gs.c2) }
        if let s = pillSlides.first(where: { $0.songId == song.id }) {
            return (s.fromPos, s.toPos, s.c1, s.c2)
        }
        return nil
    }

    // MARK: - Animation trigger

    private func triggerAnimation() {
        guard let confirmedIdx = pendingIndex, containerSize != .zero else { return }

        // Work entirely in layout-index space: the base includes the challenge marker,
        // and the pending card inserts at the marker-adjusted position.
        let baseCards = layoutBaseCards
        let pendingIdx = layoutInsertIndex(forConfirmed: confirmedIdx)

        // Old layout — lock its offsetY for the whole animation so existing rows don't shift.
        let oldLayout = TimelineLayout.calculate(
            cards: baseCards, containerSize: containerSize,
            lastPlacedId: lastPlacedId, gamePhase: gamePhase, isInteractive: true
        )
        capturedOffsetY = oldLayout.offsetY
        capturedOldSegments = oldLayout.segments

        // New layout — uses old offsetY so positions stay in the same Y space.
        var newCards = baseCards
        if let song = pendingSong { newCards.insert(song, at: min(pendingIdx, newCards.count)) }
        let newLayout = TimelineLayout.calculate(
            cards: newCards, containerSize: containerSize,
            lastPlacedId: lastPlacedId, gamePhase: gamePhase, isInteractive: false,
            overrideOffsetY: oldLayout.offsetY
        )

        // Position maps.
        let oldYearPos = Dictionary(uniqueKeysWithValues: oldLayout.items.compactMap { item -> (String, CGPoint)? in
            guard let s = item.song else { return nil }; return (s.id, item.position)
        })
        let newYearPos = Dictionary(uniqueKeysWithValues: newLayout.items.compactMap { item -> (String, CGPoint)? in
            guard let s = item.song else { return nil }; return (s.id, item.position)
        })
        let oldGapPos = Dictionary(uniqueKeysWithValues: oldLayout.items.compactMap { item -> (Int, CGPoint)? in
            guard let i = item.gapIndex else { return nil }; return (i, item.position)
        })

        let scale = oldLayout.scale
        let curveExt = TimelineLayout.curveExtend * scale

        // Build slides for every pill whose screen position changes. Cards before the
        // insertion index keep their logical index but still shift horizontally when the
        // timeline re-centers (e.g. 1 card → 2 cards), so we can't skip them by index —
        // we compare actual positions instead.
        var slides: [PillSlide] = []
        for (origIdx, card) in baseCards.enumerated() {
            guard let fromPos = oldYearPos[card.id], let toPos = newYearPos[card.id] else { continue }
            if fromPos == toPos { continue }  // didn't move — no slide
            // Cards at/after the insertion point gain one index; earlier cards keep theirs.
            let newIdx = origIdx >= pendingIdx ? origIdx + 1 : origIdx
            let crossesRow = (origIdx / 3) != (newIdx / 3)
            let c1: CGPoint, c2: CGPoint
            if crossesRow {
                let isEven = (origIdx / 3) % 2 == 0
                c1 = CGPoint(x: fromPos.x + (isEven ? curveExt : -curveExt), y: fromPos.y)
                c2 = CGPoint(x: toPos.x   + (isEven ? curveExt : -curveExt), y: toPos.y)
            } else {
                c1 = fromPos; c2 = toPos
            }
            slides.append(PillSlide(songId: card.id, fromPos: fromPos, toPos: toPos, c1: c1, c2: c2))
        }
        pillSlides = slides

        // Gap slide: tapped gap → pending pill destination.
        if let gapFrom = oldGapPos[pendingIdx],
           let pendSong = pendingSong,
           let gapTo = newYearPos[pendSong.id] {
            let crossesRow = abs(gapTo.y - gapFrom.y) > 20 * scale
            let c1: CGPoint, c2: CGPoint
            if crossesRow {
                let pendingSection = pendingIdx / 3
                let isEven = pendingSection % 2 == 0
                // Gap was on the section below; curve direction is the incoming direction.
                c1 = CGPoint(x: gapFrom.x + (isEven ? -curveExt : curveExt), y: gapFrom.y)
                c2 = CGPoint(x: gapTo.x   + (isEven ? -curveExt : curveExt), y: gapTo.y)
            } else {
                c1 = gapFrom; c2 = gapTo
            }
            gapSlide = GapSlide(fromPos: gapFrom, toPos: gapTo, c1: c1, c2: c2)
        }

        // ── Single slide phase: nodes move full-size; the tapped gap grows into a node.
        // The slide spring overshoots past 1, so PathFollower extrapolates the bezier
        // past the endpoint — nodes accelerate, overshoot, and snap back into place.
        slideProgress = 0
        pathTrimEnd = 0
        gapGrown = false
        animPhase = .animating
        withAnimation(.spring(duration: 0.35, bounce: 0.6))  { slideProgress = 1 }
        withAnimation(.easeOut(duration: 0.35))              { pathTrimEnd = 1 }
        withAnimation(.spring(duration: 0.32, bounce: 0.5))  { gapGrown = true }

        // ── Cleanup: back to idle once the springs have visually settled (~0.6s) ──
        // capturedOffsetY intentionally NOT cleared here — cleared when cards.count
        // changes so the Y snap only happens at the start of the next confirmed placement.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            guard animPhase == .animating else { return }
            animPhase = .idle
            pillSlides = []
            gapSlide = nil
            capturedOldSegments = []
            pathTrimEnd = 1.0
            gapGrown = false
        }
    }

    // MARK: - Helpers

    private func isChallengWindowMarker(_ song: Song) -> Bool {
        // song-guess and challenge-window both show the just-placed card as a hidden "?" marker
        // (its year isn't revealed until the reveal phase).
        (gamePhase == "challenge-window" || gamePhase == "song-guess") && song.id == lastPlacedId
    }

    private func positionHintFor(_ gapIdx: Int) -> String? {
        let total = displayCards.count
        // First round only: with a single year on the timeline the player needs a
        // "before / after" cue. Once two+ years are visible the order is self-evident,
        // so the hints are dropped.
        guard total == 1 else { return nil }
        if gapIdx == 0 { return "before" }
        if gapIdx == total { return "after" }
        return nil
    }

    private func cardColor(_ card: Song) -> CardColorState {
        if gamePhase == "challenge-resolved", let r = challengeResult {
            if card.challengerCard { return r.challengerCorrect ? .correct : .incorrect }
            if card.originalCard   { return r.originalCorrect  ? .correct : .incorrect }
        }
        // Only reveal shows correct/incorrect. In challenge-window the year is still hidden
        // (others are deciding whether to challenge) so the placed card stays a pink "?"
        // marker — colouring it green/red here would leak the answer.
        if gamePhase == "reveal", card.id == lastPlacedId, let r = placementResult {
            return r.correct ? .correct : .incorrect
        }
        return .normal
    }

    // The label shown under an art node. Correct/normal cards show the year; an incorrect
    // card keeps the player's name (the year sits in the same spot, so we surface whichever
    // is meaningful). Applies per-copy to challenge-resolved doubled cards via cardColor.
    private func nodeLabel(for card: Song) -> String? {
        switch cardColor(card) {
        case .incorrect: return yearLabel(for: card) ?? String(card.year)
        case .correct, .normal: return String(card.year)
        }
    }

    // The player-name label for a card (misnamed for historical reasons — it resolves the
    // per-card name labels, not the year).
    private func yearLabel(for card: Song) -> String? {
        if isChallengeMarker(card) { return disabledLabel }
        if isChallengWindowMarker(card) { return disabledLabel ?? cardLabels[card.id] }
        // challenge-resolved: original and challenger cards share the same song.id,
        // so labels are stored under distinct keys to avoid one overwriting the other.
        if card.originalCard   { return cardLabels[card.id + "-orig"] ?? cardLabels[card.id] }
        if card.challengerCard { return cardLabels[card.id + "-chal"] ?? cardLabels[card.id] }
        return cardLabels[card.id]
    }
}

// MARK: - Path builder

private func buildPath(from segments: [PathSegment]) -> Path {
    var path = Path()
    for seg in segments {
        switch seg {
        case .move(let to):                  path.move(to: to)
        case .line(let to):                  path.addLine(to: to)
        case .curve(let to, let c1, let c2): path.addCurve(to: to, control1: c1, control2: c2)
        }
    }
    return path
}

// MARK: - Card color state

enum CardColorState { case normal, correct, incorrect }

// MARK: - Node label (year or player name, shown below every node)

/// The text under a timeline node. Placed via `.overlay` inside the node so it travels
/// with the node during slide animations and never shifts the node's `.position()` center.
private struct NodeLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .black, design: .rounded))
            .foregroundStyle(.white)
            .shadow(color: Color.beatPurple.opacity(0.8), radius: 4)
            .lineLimit(1)
            .truncationMode(.tail)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: 84)
            .fixedSize(horizontal: false, vertical: true)
            .offset(y: nodeLabelOffset)
    }
}

// MARK: - Mystery node (solid magenta "?" — pending placement and challenge markers)

private struct MysteryNode: View {
    var size: CGFloat = nodeSize   // shrinks to gapCircleSize while the tapped slot grows
    var label: String? = nil

    @State private var ring1 = false
    @State private var ring2 = false

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: nodeCornerRadius) }

    var body: some View {
        shape
            .fill(Color.beatMagenta)
            .frame(width: size, height: size)
            .overlay(shape.strokeBorder(.white.opacity(0.25), lineWidth: 1.5))
            .overlay {
                Text("?")
                    .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
            .overlay {
                shape
                    .stroke(Color.beatMagenta, lineWidth: 2)
                    .scaleEffect(ring1 ? 2.8 : 1.0)
                    .opacity(ring1 ? 0 : 0.75)
                    .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: false), value: ring1)
                shape
                    .stroke(Color.beatMagenta, lineWidth: 1.5)
                    .scaleEffect(ring2 ? 2.8 : 1.0)
                    .opacity(ring2 ? 0 : 0.5)
                    .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: false), value: ring2)
            }
            .shadow(color: Color.beatMagenta.opacity(0.75), radius: 6)
            .shadow(color: Color.beatMagenta.opacity(0.35), radius: 14)
            .overlay { if let label { NodeLabel(text: label) } }
            .onAppear { startRipple() }
    }

    private func startRipple() {
        ring1 = false; ring2 = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { ring1 = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9)  { ring2 = true }
    }
}

// MARK: - Art node (album-art rounded square with year/name label below)

private struct ArtNode: View {
    let song: Song
    var colorState: CardColorState = .normal
    var label: String? = nil

    @State private var ring1 = false
    @State private var ring2 = false

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: nodeCornerRadius) }

    // Normal: a subtle white ring so dark album art doesn't merge with the background.
    private var outlineColor: Color {
        switch colorState {
        case .normal:    return .white.opacity(0.25)
        case .correct:   return Color.beatGreen
        case .incorrect: return Color(hex: "EF4444")
        }
    }
    private var outlineWidth: CGFloat { colorState != .normal ? 3 : 1.5 }
    private var glowColor: Color {
        switch colorState {
        case .normal:    return Color.beatPurple
        case .correct:   return Color.beatGreen
        case .incorrect: return Color(hex: "EF4444")
        }
    }

    var body: some View {
        ArtworkImage(urlString: song.albumArt)
            .frame(width: nodeSize, height: nodeSize)
            .clipShape(shape)
            .overlay(shape.strokeBorder(outlineColor, lineWidth: outlineWidth))
            .overlay {
                // Pulsating ring only for a correct placement (green); incorrect stays static.
                if colorState == .correct {
                    shape
                        .stroke(outlineColor, lineWidth: 2.5)
                        .scaleEffect(ring1 ? 2.5 : 1.0)
                        .opacity(ring1 ? 0 : 0.8)
                        .animation(.easeOut(duration: 2.5).repeatForever(autoreverses: false), value: ring1)
                    shape
                        .stroke(outlineColor, lineWidth: 2.0)
                        .scaleEffect(ring2 ? 2.5 : 1.0)
                        .opacity(ring2 ? 0 : 0.55)
                        .animation(.easeOut(duration: 2.5).repeatForever(autoreverses: false), value: ring2)
                }
            }
            // Purple glow on normal art nodes disabled (trial) — result rings keep their glow.
            .shadow(color: colorState == .normal ? .clear : glowColor.opacity(0.7),
                    radius: colorState == .normal ? 0 : 5)
            .shadow(color: colorState == .normal ? .clear : glowColor.opacity(0.3),
                    radius: colorState == .normal ? 0 : 12)
            // Label overlay comes after the ripple so the rings emanate from the node only.
            .overlay { if let label { NodeLabel(text: label) } }
            .onAppear { if colorState == .correct { startRipple() } }
            .onChange(of: colorState) { _, s in if s == .correct && !ring1 { startRipple() } }
    }

    private func startRipple() {
        ring1 = false; ring2 = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { ring1 = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9)  { ring2 = true }
    }
}

// MARK: - Gap circle

private struct GapCircle: View {
    let index: Int
    var isSelected: Bool = false
    var isDisabled: Bool = false
    let onPlace: (Int) -> Void

    @State private var ring1Active = false
    @State private var ring2Active = false
    private let size: CGFloat = gapCircleSize

    var body: some View {
        Button { onPlace(index) } label: {
            if isDisabled {
                Circle()
                    .fill(Color.beatSurface).frame(width: size, height: size)
                    .overlay(Circle().fill(Color.beatMagenta.opacity(0.12)))
                    .overlay(Circle().strokeBorder(Color.beatMagenta, lineWidth: 2.5))
                    .shadow(color: Color.beatMagenta.opacity(0.7), radius: 8)
                    .shadow(color: Color.beatMagenta.opacity(0.35), radius: 18)
            } else if isSelected {
                ZStack {
                    Circle().stroke(Color.beatMagenta, lineWidth: 2.5).frame(width: size, height: size)
                        .scaleEffect(ring1Active ? 2.4 : 1.0).opacity(ring1Active ? 0 : 0.75)
                        .animation(.easeOut(duration: 2.5).repeatForever(autoreverses: false), value: ring1Active)
                    Circle().stroke(Color.beatMagenta, lineWidth: 2.0).frame(width: size, height: size)
                        .scaleEffect(ring2Active ? 2.4 : 1.0).opacity(ring2Active ? 0 : 0.55)
                        .animation(.easeOut(duration: 2.5).repeatForever(autoreverses: false), value: ring2Active)
                    Circle().fill(Color.beatSurface).frame(width: size, height: size)
                    Circle().strokeBorder(Color.beatMagenta, lineWidth: 2.5).frame(width: size, height: size)
                        .shadow(color: Color.beatMagenta.opacity(0.9), radius: 10)
                        .shadow(color: Color.beatMagenta.opacity(0.4), radius: 22)
                }
            } else {
                Circle()
                    .fill(Color.beatSurface).frame(width: size, height: size)
                    .overlay(Circle().fill(Color(hex: "3A3B58")))
                    .overlay(Circle().strokeBorder(Color(hex: "5A5B7A"), lineWidth: 1.5))
                    .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
            }
        }
        .buttonStyle(.plain)
        .disabled(isDisabled || isSelected)
        .onAppear { if isSelected { startRipple() } }
        .onChange(of: isSelected) { _, s in if s { startRipple() } }
    }

    private func startRipple() {
        ring1Active = false; ring2Active = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { ring1Active = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.72) { ring2Active = true }
    }
}

// MARK: - Start-of-game hint callout

/// Soft dark speech bubble with a downward tail, shown once above the round-one starter node.
private struct StartHintCallout: View {
    let text: String

    private let bubble = SpeechBubble(cornerRadius: 16, tailWidth: 26, tailHeight: 16)

    var body: some View {
        Text(text)
            .font(.system(size: 16, weight: .medium, design: .rounded))
            .foregroundStyle(Color.beatText)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: 240)
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 14 + 16)   // reserve the tail height so text stays in the body
            .background(bubble.fill(Color.beatSurface2.opacity(0.96)))
            .overlay(bubble.stroke(Color.white.opacity(0.14), lineWidth: 1))
            .shadow(color: .black.opacity(0.45), radius: 14, y: 5)
            .allowsHitTesting(false)   // taps fall through to dismiss / place
    }
}

/// Rounded rectangle with a centered, downward-pointing tail at the bottom edge.
/// The tail occupies the bottom `tailHeight` of the rect; the body fills the rest.
private struct SpeechBubble: Shape {
    var cornerRadius: CGFloat = 16
    var tailWidth: CGFloat = 26
    var tailHeight: CGFloat = 16

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let r = cornerRadius
        let bodyBottom = rect.maxY - tailHeight
        let midX = rect.midX
        let half = tailWidth / 2

        p.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + r),
                       control: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: bodyBottom - r))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - r, y: bodyBottom),
                       control: CGPoint(x: rect.maxX, y: bodyBottom))
        // Right base → tip (concave), then tip → left base.
        p.addLine(to: CGPoint(x: midX + half, y: bodyBottom))
        p.addQuadCurve(to: CGPoint(x: midX, y: rect.maxY),
                       control: CGPoint(x: midX + half * 0.2, y: bodyBottom + tailHeight * 0.7))
        p.addQuadCurve(to: CGPoint(x: midX - half, y: bodyBottom),
                       control: CGPoint(x: midX - half * 0.2, y: bodyBottom + tailHeight * 0.7))
        p.addLine(to: CGPoint(x: rect.minX + r, y: bodyBottom))
        p.addQuadCurve(to: CGPoint(x: rect.minX, y: bodyBottom - r),
                       control: CGPoint(x: rect.minX, y: bodyBottom))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addQuadCurve(to: CGPoint(x: rect.minX + r, y: rect.minY),
                       control: CGPoint(x: rect.minX, y: rect.minY))
        p.closeSubpath()
        return p
    }
}
