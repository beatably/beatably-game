import SwiftUI

// MARK: - Dark card

struct BeatCardModifier: ViewModifier {
    var glowColor: Color = .clear
    var glowRadius: CGFloat = 0
    var cornerRadius: CGFloat = 14

    func body(content: Content) -> some View {
        content
            .background(Color.beatSurface)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius).strokeBorder(Color.beatBorder, lineWidth: 1))
            .shadow(color: glowColor.opacity(0.5), radius: glowRadius)
            .shadow(color: glowColor.opacity(0.25), radius: glowRadius * 2)
    }
}

// MARK: - Dark text field

struct BeatInputModifier: ViewModifier {
    var focused: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(Color.beatSurface2)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(focused ? Color.beatTeal : Color.beatBorder, lineWidth: 1)
            )
            .foregroundStyle(Color.beatText)
    }
}

// MARK: - Neon glow

struct NeonGlowModifier: ViewModifier {
    let color: Color
    var radius: CGFloat = 8

    func body(content: Content) -> some View {
        content
            .shadow(color: color.opacity(0.8), radius: radius * 0.5)
            .shadow(color: color.opacity(0.4), radius: radius)
            .shadow(color: color.opacity(0.2), radius: radius * 2)
    }
}

// MARK: - Press-scale button style

struct PressScaleStyle: ButtonStyle {
    var haptic: UIImpactFeedbackGenerator.FeedbackStyle = .medium

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(duration: 0.12), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed { UIImpactFeedbackGenerator(style: haptic).impactOccurred() }
            }
    }
}

// MARK: - View extensions

extension View {
    func beatCard(glowColor: Color = .clear, glowRadius: CGFloat = 0, cornerRadius: CGFloat = 14) -> some View {
        modifier(BeatCardModifier(glowColor: glowColor, glowRadius: glowRadius, cornerRadius: cornerRadius))
    }

    func beatInput(focused: Bool = false) -> some View {
        modifier(BeatInputModifier(focused: focused))
    }

    func neonGlow(_ color: Color, radius: CGFloat = 8) -> some View {
        modifier(NeonGlowModifier(color: color, radius: radius))
    }
}

// MARK: - Shared beat button label

struct BeatPrimaryLabel: View {
    let title: String
    var isLoading: Bool = false
    // accentColor controls the neon glow only; the background is always the brand gradient
    var accentColor: Color = .beatTeal

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(.white)
            } else {
                Text(title).font(.system(.body, design: .rounded).weight(.bold))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .background(
            LinearGradient(
                colors: [Color.beatTeal, Color.beatGradientPurple],
                startPoint: .leading, endPoint: .trailing
            )
        )
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .neonGlow(accentColor, radius: 6)
    }
}

struct BeatSecondaryLabel: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(.body, design: .rounded).weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Color.beatSurface2)
            .foregroundStyle(Color.beatMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.beatBorder, lineWidth: 1))
    }
}
