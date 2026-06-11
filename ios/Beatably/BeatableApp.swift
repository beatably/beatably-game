import SwiftUI

@main
struct BeatableApp: App {
    @State private var viewModel = GameViewModel()

    var body: some Scene {
        WindowGroup {
            Group {
                switch viewModel.view {
                case .landing:
                    LandingView()
                case .lobby:
                    LobbyView()
                case .game:
                    GameView()
                }
            }
            .animation(.easeInOut(duration: 0.25), value: viewModel.view)
            .environment(viewModel)
        }
    }
}
