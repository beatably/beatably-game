import SwiftUI

// Height of a year pill = circle diameter when minimised during animation.
private let pillCircleSize: CGFloat = 24

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

    func effectValue(size: CGSize) -> ProjectionTransform {
        let t = progress, mt = 1 - t
        let x = mt*mt*mt*from.x + 3*mt*mt*t*c1.x + 3*mt*t*t*c2.x + t*t*t*to.x
        let y = mt*mt*mt*from.y + 3*mt*mt*t*c1.y + 3*mt*t*t*c2.y + t*t*t*to.y
        return ProjectionTransform(CGAffineTransform(translationX: x - from.x, y: y - from.y))
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
    case collapsing  // moving pills shrink to circles in-place
    case animating   // circles slide along path + path grows
    case expanding   // circles arrived, now expanding to pills
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
    let onPlace: (Int) -> Void

    // ── Animation state ──────────────────────────────────────────────
    @State private var containerSize: CGSize = .zero
    @State private var animPhase: PlacementAnimPhase = .idle

    // Captured at animation start to keep Y locked during animation.
    @State private var capturedOffsetY: CGFloat? = nil
    @State private var capturedOldSegments: [PathSegment] = []

    // Drives circle movement (PathFollower) and path opacity crossfade.
    @State private var slideProgress: CGFloat = 0
    // Drives path trim growth (separate so we can ease independently).
    @State private var pathTrimEnd: CGFloat = 1.0

    // Pills shrink/expand.
    @State private var pillsMinimized = false

    // Slide data for moving pills and the tapped gap.
    @State private var pillSlides: [PillSlide] = []
    @State private var gapSlide: GapSlide? = nil

    // IDs of pills that actually move (originalIndex >= pendingIdx).
    @State private var movingIds: Set<String> = []

    // All base card positions from the old layout, captured at animation start.
    // Used during .collapsing so left-movers and right-movers both render at their
    // correct pre-insertion positions.
    @State private var capturedOldYearPositions: [String: CGPoint] = [:]

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

                switch animPhase {
                case .animating:
                    animatingNodes(layout: layout)
                case .idle, .collapsing, .expanding:
                    staticNodes(layout: layout)
                }
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
                pillsMinimized = false
                slideProgress = 0
                pathTrimEnd = 1.0
                pillSlides = []
                gapSlide = nil
                movingIds = []
                capturedOffsetY = nil
                capturedOldSegments = []
                capturedOldYearPositions = [:]
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
        if animPhase == .collapsing {
            // Pills are shrinking in place — show the old path unchanged.
            Canvas { ctx, _ in
                ctx.stroke(buildPath(from: capturedOldSegments),
                           with: .color(Color.beatMagenta.opacity(0.6)),
                           style: StrokeStyle(lineWidth: 30, lineCap: .round, lineJoin: .round))
            }
            .blur(radius: 12)
            .opacity(0.18)
            .allowsHitTesting(false)

            Canvas { ctx, sz in
                ctx.stroke(buildPath(from: capturedOldSegments),
                           with: .linearGradient(
                            Gradient(stops: [
                                .init(color: Color.beatPurple.opacity(0.65),  location: 0),
                                .init(color: Color.beatMagenta.opacity(0.55), location: 0.5),
                                .init(color: Color.beatCyan.opacity(0.55),    location: 1),
                            ]),
                            startPoint: .zero,
                            endPoint: CGPoint(x: sz.width, y: sz.height)),
                           style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            }
            .allowsHitTesting(false)

        } else if animPhase == .animating {
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

    // MARK: - Animating nodes (collapse + slide phase)

    @ViewBuilder
    private func animatingNodes(layout: TimelineLayoutResult) -> some View {
        // Stationary pills — stay at full size, no movement.
        ForEach(layout.items, id: \.stableId) { item in
            if case .year(let song, _) = item.kind,
               song.id != pendingSong?.id,
               !movingIds.contains(song.id) {
                let label = yearLabel(for: song)
                if let label {
                    Text(label)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .shadow(color: Color.beatMagenta.opacity(0.7), radius: 4)
                        .lineLimit(1).fixedSize()
                        .position(CGPoint(x: item.position.x, y: item.position.y - 26))
                }
                if isChallengeMarker(song) {
                    ChallengeMarkerPill().position(item.position)
                } else {
                    YearPill(song: song, colorState: cardColor(song),
                             minimized: false, skipEnterAnimation: true)
                        .position(item.position)
                }
            }
        }

        // Moving pills — minimised circles sliding to new positions.
        ForEach(pillSlides, id: \.songId) { slide in
            if let song = cards.first(where: { $0.id == slide.songId }) {
                YearPill(song: song, colorState: .normal, minimized: true, skipEnterAnimation: true)
                    .position(slide.fromPos)
                    .modifier(PathFollower(progress: slideProgress,
                                          from: slide.fromPos, to: slide.toPos,
                                          c1: slide.c1, c2: slide.c2))
            }
        }

        // Tapped gap — opaque magenta circle, slides to pending position.
        if let gs = gapSlide {
            Circle()
                .fill(Color.beatMagenta)
                .frame(width: pillCircleSize, height: pillCircleSize)
                .overlay(Circle().strokeBorder(.white.opacity(0.25), lineWidth: 1.5))
                .shadow(color: Color.beatMagenta.opacity(0.8), radius: 6)
                .shadow(color: Color.beatMagenta.opacity(0.35), radius: 14)
                .position(gs.fromPos)
                .modifier(PathFollower(progress: slideProgress,
                                       from: gs.fromPos, to: gs.toPos,
                                       c1: gs.c1, c2: gs.c2))
        }
    }

    // MARK: - Static nodes (idle + collapsing + expanding)

    @ViewBuilder
    private func staticNodes(layout: TimelineLayoutResult) -> some View {
        let isCollapsing = animPhase == .collapsing
        let isExpanding  = animPhase == .expanding
        // Old-position lookup for moving pills during the collapse phase.
        // Use explicitly captured old positions (covers all moving pills including
        // left-movers) rather than re-deriving from pillSlides.
        let fromLookup: [String: CGPoint] = isCollapsing ? capturedOldYearPositions : [:]

        ForEach(layout.items, id: \.stableId) { item in
            switch item.kind {
            case .year(let song, _):
                // Only the actively-placed card is a pending "?" pill. Gate on
                // pendingIndex so that in reveal / challenge-resolved (where currentCard
                // still equals a card already on the timeline) it renders as a year pill.
                if pendingIndex != nil, let ps = pendingSong, song.id == ps.id {
                    // Pending pill: hidden during collapse, expands from circle during expanding.
                    if !isCollapsing {
                        if let label = pendingLabel, !isExpanding {
                            Text(label)
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                                .shadow(color: Color.beatMagenta.opacity(0.7), radius: 4)
                                .lineLimit(1).fixedSize()
                                .position(CGPoint(x: item.position.x, y: item.position.y - 26))
                        }
                        PendingPill(song: song, minimized: isExpanding ? pillsMinimized : false)
                            .position(item.position)
                    }
                } else {
                    // Single branch for every non-pending year pill — moving or not — so a
                    // card leaving `movingIds` at cleanup keeps the same SwiftUI identity
                    // and doesn't reset its @State (which caused the end-of-animation flash).
                    let isMoving = movingIds.contains(song.id)
                    // Collapse: render at OLD position while shrinking. Expand/idle: new position.
                    let pos = (isMoving && isCollapsing) ? (fromLookup[song.id] ?? item.position) : item.position
                    let minimised = (isMoving && (isCollapsing || isExpanding)) ? pillsMinimized : false
                    let state = cardColor(song)
                    // Hide the label while a moving pill is collapsed/expanding; else show it.
                    if let label = yearLabel(for: song), !(isMoving && (isCollapsing || isExpanding)) {
                        Text(label)
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .shadow(color: Color.beatPurple.opacity(0.8), radius: 4)
                            .lineLimit(1).fixedSize()
                            .position(CGPoint(x: pos.x, y: pos.y - 26))
                    }
                    if isChallengWindowMarker(song) || isChallengeMarker(song) {
                        // Placed/challenged card shown as the wide pink "?" marker, year hidden.
                        // In challenge this is the original's placement occupying a full slot.
                        ChallengeMarkerPill()
                            .position(pos)
                    } else {
                        YearPill(song: song, colorState: state,
                                 minimized: minimised,
                                 skipEnterAnimation: isCollapsing || isExpanding)
                            .position(pos)
                    }
                }

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

        // During collapse, show the tapped gap as an immediate opaque magenta circle.
        if isCollapsing, let gs = gapSlide {
            Circle()
                .fill(Color.beatMagenta)
                .frame(width: pillCircleSize, height: pillCircleSize)
                .overlay(Circle().strokeBorder(.white.opacity(0.25), lineWidth: 1.5))
                .shadow(color: Color.beatMagenta.opacity(0.8), radius: 6)
                .shadow(color: Color.beatMagenta.opacity(0.35), radius: 14)
                .position(gs.fromPos)
        }
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
        capturedOldYearPositions = Dictionary(
            uniqueKeysWithValues: oldLayout.items.compactMap { item -> (String, CGPoint)? in
                guard let s = item.song else { return nil }; return (s.id, item.position)
            }
        )

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
        var moving: Set<String> = []
        for (origIdx, card) in baseCards.enumerated() {
            guard let fromPos = oldYearPos[card.id], let toPos = newYearPos[card.id] else { continue }
            if fromPos == toPos { continue }  // didn't move — no slide
            moving.insert(card.id)
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
        movingIds = moving

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

        // ── Phase 1: collapse moving pills to circles in-place (0–220ms) ──
        slideProgress = 0
        pathTrimEnd = 0
        animPhase = .collapsing
        withAnimation(.spring(duration: 0.22, bounce: 0)) { pillsMinimized = true }

        // ── Phase 2: switch to slide phase; path grows + circles move (220–740ms) ──
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            guard animPhase == .collapsing else { return }
            animPhase = .animating
            withAnimation(.spring(duration: 0.5, bounce: 0.08)) { slideProgress = 1 }
            withAnimation(.easeOut(duration: 0.52)) { pathTrimEnd = 1 }
        }

        // ── Phase 3: circles expand to pills at new positions (740–1080ms) ──
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.74) {
            guard animPhase == .animating else { return }
            animPhase = .expanding
            withAnimation(.spring(duration: 0.35, bounce: 0.1)) { pillsMinimized = false }
        }

        // ── Cleanup: back to idle (~1.15s) ─────────────────────────────
        // capturedOffsetY intentionally NOT cleared here — cleared when cards.count
        // changes so the Y snap only happens at the start of the next confirmed placement.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.15) {
            guard animPhase == .expanding else { return }
            animPhase = .idle
            pillSlides = []
            gapSlide = nil
            movingIds = []
            capturedOldSegments = []
            capturedOldYearPositions = [:]
            pathTrimEnd = 1.0
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

// MARK: - Challenge marker pill (original player's placement shown during challenger's turn)

private struct ChallengeMarkerPill: View {
    @State private var ring1 = false
    @State private var ring2 = false

    var body: some View {
        Text("?")
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(minWidth: 44, minHeight: pillCircleSize, maxHeight: pillCircleSize)
            .background {
                Capsule()
                    .fill(Color.beatMagenta)
                    .overlay { Capsule().strokeBorder(.white.opacity(0.25), lineWidth: 1.5) }
            }
            .overlay {
                Capsule()
                    .stroke(Color.beatMagenta, lineWidth: 2)
                    .scaleEffect(ring1 ? 2.8 : 1.0)
                    .opacity(ring1 ? 0 : 0.75)
                    .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: false), value: ring1)
                Capsule()
                    .stroke(Color.beatMagenta, lineWidth: 1.5)
                    .scaleEffect(ring2 ? 2.8 : 1.0)
                    .opacity(ring2 ? 0 : 0.5)
                    .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: false), value: ring2)
            }
            .shadow(color: Color.beatMagenta.opacity(0.75), radius: 6)
            .shadow(color: Color.beatMagenta.opacity(0.35), radius: 14)
            .onAppear { startRipple() }
    }

    private func startRipple() {
        ring1 = false; ring2 = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { ring1 = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9)  { ring2 = true }
    }
}

// MARK: - Pending pill ("?" node — appears after placement tap)

private struct PendingPill: View {
    let song: Song
    var minimized: Bool = false

    @State private var ring1 = false
    @State private var ring2 = false

    var body: some View {
        Text("?")
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .opacity(minimized ? 0 : 1)
            .padding(.horizontal, minimized ? 0 : 8)
            .padding(.vertical, 4)
            // minWidth 44 ensures "?" pill matches the width of a 4-digit year pill.
            .frame(minWidth: minimized ? pillCircleSize : 44,
                   maxWidth: minimized ? pillCircleSize : nil,
                   minHeight: pillCircleSize, maxHeight: pillCircleSize)
            .background {
                Capsule()
                    .fill(Color.beatMagenta)
                    .overlay { Capsule().strokeBorder(.white.opacity(0.25), lineWidth: 1.5) }
            }
            .overlay {
                if !minimized {
                    Capsule()
                        .stroke(Color.beatMagenta, lineWidth: 2)
                        .scaleEffect(ring1 ? 2.8 : 1.0)
                        .opacity(ring1 ? 0 : 0.75)
                        .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: false), value: ring1)
                    Capsule()
                        .stroke(Color.beatMagenta, lineWidth: 1.5)
                        .scaleEffect(ring2 ? 2.8 : 1.0)
                        .opacity(ring2 ? 0 : 0.5)
                        .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: false), value: ring2)
                }
            }
            .shadow(color: Color.beatMagenta.opacity(0.75), radius: 6)
            .shadow(color: Color.beatMagenta.opacity(0.35), radius: 14)
            .animation(.spring(duration: 0.32), value: minimized)
            .onAppear { if !minimized { startRipple() } }
            .onChange(of: minimized) { _, m in if !m { startRipple() } }
    }

    private func startRipple() {
        ring1 = false; ring2 = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { ring1 = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9)  { ring2 = true }
    }
}

// MARK: - Year pill

private struct YearPill: View {
    let song: Song
    var colorState: CardColorState = .normal
    var hideYear: Bool = false
    var outlined: Bool = false
    var minimized: Bool = false
    var skipEnterAnimation: Bool = false

    @State private var appear: Bool
    @State private var ring1 = false
    @State private var ring2 = false

    init(song: Song, colorState: CardColorState = .normal, hideYear: Bool = false,
         outlined: Bool = false, minimized: Bool = false, skipEnterAnimation: Bool = false) {
        self.song = song
        self.colorState = colorState
        self.hideYear = hideYear
        self.outlined = outlined
        self.minimized = minimized
        self.skipEnterAnimation = skipEnterAnimation
        // Start already-visible when we're re-inserting into a new branch mid-animation,
        // so the view doesn't flash from scale 0.5 / opacity 0.
        self._appear = State(initialValue: skipEnterAnimation)
    }

    private var outlineColor: Color {
        switch colorState {
        case .normal:    return outlined ? Color.beatMagenta : .clear
        case .correct:   return Color.beatGreen
        case .incorrect: return Color(hex: "EF4444")
        }
    }
    private var glowColor: Color {
        switch colorState {
        case .normal:    return outlined ? Color.beatMagenta : Color.beatPurple
        case .correct:   return Color.beatGreen
        case .incorrect: return Color(hex: "EF4444")
        }
    }
    private var outlineWidth: CGFloat { colorState != .normal ? 3 : (outlined ? 1.5 : 0) }

    var body: some View {
        Text(verbatim: hideYear ? "?" : String(song.year))
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .opacity(minimized ? 0 : 1)
            .padding(.horizontal, minimized ? 0 : 8)
            .padding(.vertical, 4)
            .frame(width: minimized ? pillCircleSize : nil, height: pillCircleSize)
            .background {
                ZStack {
                    if colorState == .normal {
                        Capsule().fill(LinearGradient(
                            colors: [Color.beatPurple, Color(hex: "5A2BA8")],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                    } else {
                        Capsule().fill(Color(hex: "252535"))
                    }
                    Capsule().strokeBorder(outlineColor, lineWidth: outlineWidth)
                }
            }
            .overlay {
                if colorState != .normal {
                    Capsule()
                        .stroke(outlineColor, lineWidth: 2.5)
                        .scaleEffect(ring1 ? 2.5 : 1.0)
                        .opacity(ring1 ? 0 : 0.8)
                        .animation(.easeOut(duration: 2.5).repeatForever(autoreverses: false), value: ring1)
                    Capsule()
                        .stroke(outlineColor, lineWidth: 2.0)
                        .scaleEffect(ring2 ? 2.5 : 1.0)
                        .opacity(ring2 ? 0 : 0.55)
                        .animation(.easeOut(duration: 2.5).repeatForever(autoreverses: false), value: ring2)
                }
            }
            .shadow(color: glowColor.opacity(0.7), radius: 5)
            .shadow(color: glowColor.opacity(0.3), radius: 12)
            .scaleEffect(appear ? 1 : 0.5)
            .opacity(appear ? 1 : 0)
            .animation(.spring(duration: 0.3), value: minimized)
            .onAppear {
                if !skipEnterAnimation {
                    withAnimation(.spring(duration: 0.4)) { appear = true }
                }
                if colorState != .normal { startRipple() }
            }
            .onChange(of: colorState) { _, s in if s != .normal && !ring1 { startRipple() } }
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
    private let size: CGFloat = pillCircleSize

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
