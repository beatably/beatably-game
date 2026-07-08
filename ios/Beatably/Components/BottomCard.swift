import SwiftUI

// (SheetCloseHeader was removed — BottomCard now owns the close affordance.)

/// Full-width, bottom-anchored card used for transient detail/action panels
/// (song detail, guess). Goes edge-to-edge left/right and flush to the bottom,
/// with rounded top corners, a soft colored glow behind it, a dimmed
/// tap-to-dismiss backdrop, and a close cross. Slide-in is applied by the caller
/// via a .transition on the conditional.
struct BottomCard<Content: View>: View {
    var glow: Color = .beatPurple
    let onClose: () -> Void
    @ViewBuilder var content: () -> Content

    private let corner: CGFloat = 28

    var body: some View {
        ZStack(alignment: .bottom) {
            // Dimmed backdrop — tap outside the card to dismiss. Fades in on its
            // own so it doesn't slide up with the card.
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { onClose() }
                .transition(.opacity)

            content()
                .frame(maxWidth: .infinity)
                .padding(.top, 22)
                .padding(.bottom, 24)
                .background(alignment: .top) {
                    UnevenRoundedRectangle(topLeadingRadius: corner, topTrailingRadius: corner)
                        .fill(Color.beatSurface)
                        // Extend the fill under the home indicator for a flush bottom edge.
                        .ignoresSafeArea(edges: .bottom)
                        // Soft glow rising from behind the card's top edge (subtle).
                        .shadow(color: glow.opacity(0.165), radius: 32, y: -1)
                        .shadow(color: glow.opacity(0.084), radius: 60, y: -1)
                }
                // Neutral edge so the card separates from a dark background behind it.
                .overlay(alignment: .top) {
                    UnevenRoundedRectangle(topLeadingRadius: corner, topTrailingRadius: corner)
                        .strokeBorder(Color.white.opacity(0.2), lineWidth: 1)
                        .ignoresSafeArea(edges: .bottom)
                        .allowsHitTesting(false)
                }
                .overlay(alignment: .topTrailing) {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Color.beatMuted)
                            .padding(9)
                            .background(Circle().fill(Color.beatSurface2))
                    }
                    .buttonStyle(PressScaleStyle(haptic: .light))
                    .padding(.top, 14)
                    .padding(.trailing, 16)
                }
                // Only the card slides up; the backdrop fades in separately.
                .transition(.move(edge: .bottom))
        }
    }
}
