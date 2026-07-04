import SwiftUI

// Animated space background used behind the S-curve timeline and the full game view.
// Three blurred orbs + 22 star particles drawn in Canvas for performance.

struct SpaceBackground: View {
    private let stars = SpaceBackground.makeStars()

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                Color.beatBg

                // ── Blurred colour orbs — lower opacity than before ──
                Ellipse()
                    .fill(Color.beatPurple.opacity(0.12))
                    .frame(width: w * 0.75, height: h * 0.42)
                    .blur(radius: 72)
                    .position(x: w * 0.22, y: h * 0.26)

                Ellipse()
                    .fill(Color.beatCyan.opacity(0.09))
                    .frame(width: w * 0.8, height: h * 0.42)
                    .blur(radius: 80)
                    .position(x: w * 0.78, y: h * 0.66)

                Ellipse()
                    .fill(Color.beatMagenta.opacity(0.08))
                    .frame(width: w * 0.60, height: h * 0.36)
                    .blur(radius: 64)
                    .position(x: w * 0.52, y: h * 0.84)

                // ── Animated star particles — drawn above the orbs ──
                SwiftUI.TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in
                    let t = ctx.date.timeIntervalSinceReferenceDate
                    Canvas { context, size in
                        for star in stars {
                            let phase = (t / star.duration + star.phaseOffset) * 2 * .pi
                            let dx = sin(phase * 0.7) * 18.0
                            let dy = cos(phase * 0.5) * 18.0
                            let opacity = 0.15 + 0.38 * (sin(phase) * 0.5 + 0.5)
                            let x = star.x * Double(size.width) + dx
                            let y = star.y * Double(size.height) + dy
                            let r = star.radius
                            context.fill(
                                Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                                with: .color(star.color.opacity(opacity))
                            )
                        }
                    }
                }
                .zIndex(1)
            }
            .clipped()
        }
        .allowsHitTesting(false)
    }

    // Faster durations: 10–20s (was 18–32s)
    private static func makeStars() -> [SpaceStar] {
        let palette: [Color] = [.beatPurple, .beatCyan, .beatMagenta, .white, .beatPurple, .beatCyan]
        var rng = SpaceRNG(seed: 42)
        return (0..<22).map { i in
            SpaceStar(
                x: rng.next01(), y: rng.next01(),
                radius: 0.8 + rng.next01() * 1.6,
                color: palette[i % palette.count],
                duration: 10 + rng.next01() * 10,
                phaseOffset: rng.next01()
            )
        }
    }
}

private struct SpaceStar {
    let x: Double; let y: Double; let radius: Double
    let color: Color; let duration: Double; let phaseOffset: Double
}

private struct SpaceRNG {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9e3779b97f4a7c15
        var z = state
        z = (z ^ (z >> 30)) &* 0xbf58476d1ce4e5b9
        z = (z ^ (z >> 27)) &* 0x94d049bb133111eb
        return z ^ (z >> 31)
    }
    mutating func next01() -> Double { Double(next()) / Double(UInt64.max) }
}
