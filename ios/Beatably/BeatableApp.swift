import SwiftUI

@main
struct BeatableApp: App {
    @State private var viewModel: GameViewModel
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Must clear UI-test state BEFORE the ViewModel reads UserDefaults
        GameViewModel.prepareForUITestsIfNeeded()
        let vm = GameViewModel()
        vm.seedStateForUITestsIfNeeded()
        _viewModel = State(wrappedValue: vm)
        SoundManager.shared.preload()
    }

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
            .onOpenURL { url in
                viewModel.handleDeepLink(url)
            }
        }
    }
}
