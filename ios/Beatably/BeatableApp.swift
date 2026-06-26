import SwiftUI

@main
struct BeatableApp: App {
    @State private var viewModel = GameViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                switch viewModel.view {
                case .landing:
                    LandingView()
                case .reconnecting:
                    ReconnectingView()
                case .lobby:
                    LobbyView()
                case .game:
                    GameView()
                }
            }
            .animation(.easeInOut(duration: 0.25), value: viewModel.view)
            .environment(viewModel)
            .onChange(of: scenePhase) { _, newPhase in
                // iOS suspends the socket in the background; on return, make sure
                // we reconnect/resync any active session.
                if newPhase == .active {
                    viewModel.handleForeground()
                }
            }
        }
    }
}
