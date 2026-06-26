import SwiftUI

/// Full-screen "resuming" state shown when the app relaunches with a saved
/// session (killed mid-game) while reconnect_session is in flight.
struct ReconnectingView: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView().controlSize(.large)
                Text("Resuming your game…")
                    .font(.headline)
                if !vm.roomCode.isEmpty {
                    Text("Room \(vm.roomCode)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Text(vm.isConnected ? "Restoring game state…" : "Connecting to server…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                HStack(spacing: 12) {
                    Button("Retry") { vm.forceReconnect() }
                        .buttonStyle(.bordered)
                    Button("Back to start", role: .cancel) { vm.cancelReconnect() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(.top, 8)
            }
            .padding(32)
        }
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
