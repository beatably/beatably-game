import CoreGraphics

// MARK: - Layout items

enum TimelineItemKind {
    case year(song: Song, cardIndex: Int)
    case gap(index: Int)
}

struct TimelineItem {
    let kind: TimelineItemKind
    let position: CGPoint
    var curveShift: CGFloat = 0  // perpendicular offset on curve segments

    var isYear: Bool { if case .year = kind { return true }; return false }
    var isGap: Bool  { if case .gap  = kind { return true }; return false }
    var gapIndex: Int? { if case .gap(let i) = kind { return i }; return nil }
    var song: Song? { if case .year(let s, _) = kind { return s }; return nil }

    var stableId: String {
        switch kind {
        case .year(let s, let cardIndex):
            // Include cardIndex so two copies of the same song (challenge-resolved:
            // originalCard + challengerCard) get distinct SwiftUI view identities.
            return "y-\(s.id)-\(cardIndex)"
        case .gap(let i):
            return "g-\(i)"
        }
    }
}

// MARK: - Path segment

enum PathSegment {
    case move(to: CGPoint)
    case line(to: CGPoint)
    case curve(to: CGPoint, control1: CGPoint, control2: CGPoint)
}

// MARK: - Result

struct TimelineLayoutResult {
    let items: [TimelineItem]
    let segments: [PathSegment]
    let scale: CGFloat
    let offsetX: CGFloat
    let offsetY: CGFloat
    // Height of the laid-out content. In scroll mode (solo) this can exceed the
    // viewport, and the container scrolls; otherwise it equals the viewport.
    var contentHeight: CGFloat = 0
}

// MARK: - Layout engine

enum TimelineLayout {
    static let normalSpacing: CGFloat = 100
    static let rowHeight: CGFloat = 80
    static let minMargin: CGFloat = 44
    static let curveExtend: CGFloat = 58

    static func calculate(
        cards: [Song],
        containerSize: CGSize,
        lastPlacedId: String?,
        gamePhase: String,
        isInteractive: Bool,
        overrideOffsetY: CGFloat? = nil,  // pin Y so adding rows doesn't shift existing content
        scrollMode: Bool = false          // solo: keep node size fixed and scroll instead of shrinking
    ) -> TimelineLayoutResult {

        // Lay out exactly the cards we're given. Callers (TimelineView.displayCards /
        // triggerAnimation) already apply phase-based filtering AND insert the pending card.
        // Filtering again here would drop the pending card during challenge, because its id
        // equals lastPlacedId — that collapsed the layout and made the placement + marker vanish.
        let confirmed = cards
        _ = (lastPlacedId, gamePhase)  // retained in signature for call-site clarity; not used for filtering

        let total = confirmed.count

        // ── Step 1: raw positions ────────────────────────────────────
        var rawYears: [(x: CGFloat, y: CGFloat, sectionIndex: Int, posInSection: Int)] = []
        for i in 0..<total {
            let sectionIndex = i / 3
            let posInSection = i % 3
            let sectionY = CGFloat(-sectionIndex) * rowHeight
            let isEven = sectionIndex % 2 == 0
            let x: CGFloat = isEven
                ? CGFloat(posInSection) * normalSpacing
                : CGFloat(2 - posInSection) * normalSpacing
            rawYears.append((x: x, y: sectionY, sectionIndex: sectionIndex, posInSection: posInSection))
        }

        // ── Step 2: bounding box ─────────────────────────────────────
        let minX = (rawYears.map(\.x).min() ?? 0) - normalSpacing / 2
        let maxX = (rawYears.map(\.x).max() ?? 0) + normalSpacing / 2
        let minY = rawYears.map(\.y).min() ?? 0
        let maxY = rawYears.map(\.y).max() ?? 0
        let rawW = maxX - minX
        let rawH = maxY - minY

        // ── Step 3: scale + offset ───────────────────────────────────
        // Scale is computed from the 4-row (12-card) bounding box so it never changes
        // as cards accumulate — the timeline stays visually stable all game.
        let fixedRawW: CGFloat = 3 * normalSpacing  // 300 — max section width
        let fixedRawH: CGFloat = 3 * rowHeight       // 240 — height spanning 4 sections
        let availW = max(containerSize.width  - 2 * minMargin, 1)
        let availH = max(containerSize.height - 2 * minMargin, 1)
        let scaleX = fixedRawW > availW ? availW / fixedRawW : 1
        let scaleY = fixedRawH > availH ? availH / fixedRawH : 1
        let scale  = min(scaleX, scaleY, 1)

        // Horizontal: centers actual content.
        let scaledW = rawW * scale
        let offsetX = containerSize.width  / 2 - scaledW / 2 - minX * scale

        // Vertical placement + content height. BOTTOM-anchor: the oldest row
        // (raw y = 0) sits `vpad` above the bottom of the board and rows grow
        // upward. This replaces vertical centering, which shifted the whole board
        // whenever the footer resized (album art appears during reveal). The
        // caller passes a stabilized height so a resizing footer doesn't move the
        // anchor. Solo overflow scrolls; everything else anchors to the bottom.
        let vpad = 40 * scale + 44   // node radius + year label
        let scaledContentH = rawH * scale
        let offsetY: CGFloat
        let contentHeight: CGFloat
        if scrollMode && scaledContentH + 2 * vpad > containerSize.height {
            contentHeight = scaledContentH + 2 * vpad
            offsetY = overrideOffsetY ?? (contentHeight - vpad)
        } else {
            contentHeight = containerSize.height
            offsetY = overrideOffsetY ?? (containerSize.height - vpad)
        }

        func toScreen(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: x * scale + offsetX, y: y * scale + offsetY)
        }

        let years = rawYears.map { r in
            (pos: toScreen(r.x, r.y), sectionIndex: r.sectionIndex, posInSection: r.posInSection)
        }

        // ── Step 4: path segments ─────────────────────────────────────
        var segments: [PathSegment] = []
        let scaledCurve = curveExtend * scale

        if total > 0 {
            let firstY = years[0]
            let firstGapX = firstY.pos.x - (normalSpacing / 2) * scale
            segments.append(.move(to: CGPoint(x: firstGapX, y: firstY.pos.y)))
            segments.append(.line(to: firstY.pos))

            for i in 0..<(total - 1) {
                let cur  = years[i]
                let next = years[i + 1]
                let isVertical = abs(next.pos.y - cur.pos.y) > 30 * scale
                if isVertical {
                    let isEvenSection = cur.sectionIndex % 2 == 0
                    let cx1x = cur.pos.x  + (isEvenSection ? scaledCurve : -scaledCurve)
                    let cx2x = next.pos.x + (isEvenSection ? scaledCurve : -scaledCurve)
                    segments.append(.curve(
                        to: next.pos,
                        control1: CGPoint(x: cx1x, y: cur.pos.y),
                        control2: CGPoint(x: cx2x, y: next.pos.y)
                    ))
                } else {
                    segments.append(.line(to: next.pos))
                }
            }

            let lastY = years[total - 1]
            let isEvenLast = lastY.sectionIndex % 2 == 0
            let lastGapX = isEvenLast
                ? lastY.pos.x + (normalSpacing / 2) * scale
                : lastY.pos.x - (normalSpacing / 2) * scale
            segments.append(.line(to: CGPoint(x: lastGapX, y: lastY.pos.y)))
        }

        // ── Step 5: items ─────────────────────────────────────────────
        var items: [TimelineItem] = []
        var gapIdx = 0

        if total == 0 {
            items.append(TimelineItem(kind: .gap(index: gapIdx),
                                      position: CGPoint(x: containerSize.width / 2, y: containerSize.height / 2)))
            return TimelineLayoutResult(items: items, segments: segments,
                                        scale: scale, offsetX: offsetX, offsetY: offsetY,
                                        contentHeight: contentHeight)
        }

        let firstY2 = years[0]
        let firstGapPos = CGPoint(x: firstY2.pos.x - (normalSpacing / 2) * scale, y: firstY2.pos.y)
        items.append(TimelineItem(kind: .gap(index: gapIdx), position: firstGapPos))
        gapIdx += 1

        for i in 0..<total {
            let y = years[i]
            items.append(TimelineItem(kind: .year(song: confirmed[i], cardIndex: i), position: y.pos))
            if i < total - 1 {
                let next = years[i + 1]
                let isVertical = abs(next.pos.y - y.pos.y) > 30 * scale
                let mid = CGPoint(x: (y.pos.x + next.pos.x) / 2, y: (y.pos.y + next.pos.y) / 2)
                if isVertical {
                    let isEvenSection = y.sectionIndex % 2 == 0
                    let shift = (rowHeight / 2) * scale
                    let shiftedX = isEvenSection ? mid.x + shift : mid.x - shift
                    var gap = TimelineItem(kind: .gap(index: gapIdx),
                                          position: CGPoint(x: shiftedX, y: mid.y))
                    gap.curveShift = isEvenSection ? shift : -shift
                    items.append(gap)
                } else {
                    items.append(TimelineItem(kind: .gap(index: gapIdx), position: mid))
                }
                gapIdx += 1
            }
        }

        let lastY2 = years[total - 1]
        let isEvenLast2 = lastY2.sectionIndex % 2 == 0
        let lastGapX2 = isEvenLast2
            ? lastY2.pos.x + (normalSpacing / 2) * scale
            : lastY2.pos.x - (normalSpacing / 2) * scale
        items.append(TimelineItem(kind: .gap(index: gapIdx),
                                  position: CGPoint(x: lastGapX2, y: lastY2.pos.y)))

        return TimelineLayoutResult(items: items, segments: segments,
                                    scale: scale, offsetX: offsetX, offsetY: offsetY,
                                    contentHeight: contentHeight)
    }
}
