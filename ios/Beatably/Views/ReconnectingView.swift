import SwiftUI

/// Full-screen "resuming" state shown when the app relaunches with a saved
/// session (killed mid-game) while reconnect_session is in flight.
struct ReconnectingView: View {
    @Environment(GameViewModel.self) private var vm
    @State private var dotScale: CGFloat = 1.0

    var body: some View {
        ZStack {
            // ── Video background ────────────────────────────────────
            VideoBackground(resource: "ghost5")
                .ignoresSafeArea()
                .accessibilityHidden(true)

            // Dim the video so foreground content stays legible
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .accessibilityHidden(true)

            // ── Content ─────────────────────────────────────────────
            VStack(spacing: 0) {
                Spacer()

                // Logo with brand glow
                Image("BeatableLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 48)
                    .foregroundStyle(.white)
                    .shadow(color: Color.beatPurple.opacity(0.9), radius: 8)
                    .shadow(color: Color.beatPurple.opacity(0.5), radius: 20)
                    .shadow(color: Color.beatPurple.opacity(0.2), radius: 40)
                    .padding(.bottom, 40)

                VStack(spacing: 14) {
                    ProgressView()
                        .controlSize(.large)
                        .tint(Color.beatTeal)

                    Text("Resuming your game…")
                        .font(.system(.title3, design: .rounded).bold())
                        .foregroundStyle(Color.beatText)

                    if !vm.roomCode.isEmpty {
                        Text("Room \(vm.roomCode)")
                            .font(.system(.subheadline, design: .rounded).weight(.medium))
                            .foregroundStyle(Color.beatMuted)
                    }

                    // Connection status with pulsing dot (matches landing screen)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(vm.isConnected ? Color.beatGreen : Color.orange)
                            .frame(width: 7, height: 7)
                            .scaleEffect(dotScale)
                            .animation(
                                .easeInOut(duration: 1.4).repeatForever(autoreverses: true),
                                value: dotScale
                            )
                        Text(vm.isConnected ? "Restoring game state…" : "Connecting to server…")
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(Color.beatMuted)
                    }
                    .padding(.top, 2)
                }

                Spacer()

                // ── Actions ──────────────────────────────────────────
                VStack(spacing: 12) {
                    Button { vm.forceReconnect() } label: {
                        BeatPrimaryLabel(title: "Retry")
                    }
                    .buttonStyle(PressScaleStyle(haptic: .medium))

                    Button { vm.cancelReconnect() } label: {
                        BeatSecondaryLabel(title: "Back to start")
                    }
                    .buttonStyle(PressScaleStyle(haptic: .light))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
        .onAppear { dotScale = 1.4 }
    }
}

/// Thin banner overlaid at the top of the lobby/game when the socket has dropped
/// mid-session. Auto-reconnect runs in the background; this gives feedback and a
/// manual retry. Place via `.overlay(alignment: .top)`.
struct ReconnectingBanner: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Text("Reconnecting…")
                .font(.footnote.weight(.medium))
            Spacer(minLength: 0)
            Button("Retry") { vm.forceReconnect() }
                .font(.footnote.weight(.semibold))
                .buttonStyle(.plain)
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.orange.opacity(0.95))
        .foregroundStyle(.white)
        .clipShape(Capsule())
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .shadow(radius: 4, y: 2)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
