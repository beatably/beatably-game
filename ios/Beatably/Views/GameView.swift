import SwiftUI

struct GameView: View {
    @Environment(GameViewModel.self) private var vm
    @State private var showMenu = false
    @State private var showHowToPlay = false
    @State private var showExitConfirm = false
    @State private var showRestartConfirm = false

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Header ──────────────────────────────────────────────
                HStack {
                    ScoreHeader()
                    Spacer(minLength: 0)
                    Button { showMenu = true } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3).foregroundStyle(.secondary)
                    }
                    .padding(.trailing, 16)
                }
                Divider()

                // ── Timeline — fills all available space ─────────────
                TimelineSection()
                    .frame(maxHeight: .infinity)

                // ── Bottom footer (matches web GameFooter) ────────────
                Divider()
                VStack(spacing: 0) {
                    // Audio row — always visible when there's a card
                    if let card = vm.currentCard {
                        if vm.isCreator && card.previewURL != nil {
                            AudioControls().padding(.vertical, 10)
                        } else if !vm.isCreator {
                            NonCreatorProgressBar().padding(.vertical, 10)
                        }
                        Divider()
                    }
                    // Phase actions + turn text
                    PhaseActionsFooter()
                }
                .background(Color(.secondarySystemBackground))
            }

            // Full-screen overlays only — these intentionally block the whole screen
            if vm.showSongGuess {
                SongGuessOverlay()
            }

            if vm.gamePhase == "reveal", let result = vm.placementResult {
                RevealOverlay(result: result)
            }

            if vm.gamePhase == "challenge-resolved" {
                ChallengeResolvedOverlay()
            }

            if vm.gamePhase == "game-over" {
                GameOverOverlay()
            }

            // Player-left banner
            if let msg = vm.playerLeftMessage {
                PlayerLeftBanner(message: msg)
            }

            // Transient event notifications (centered card, like web)
            if let note = vm.creditSpendMessage {
                EventNotificationCard(
                    icon: "creditcard.fill",
                    title: note,
                    subtitle: note.contains("new song") ? "Loading a new song…" : "Challenge started…"
                )
            } else if let note = vm.songGuessNotification {
                EventNotificationCard(
                    icon: "checkmark.circle.fill",
                    title: note,
                    subtitle: "Result will be revealed at end of round"
                )
            }
        }
        .confirmationDialog("Menu", isPresented: $showMenu, titleVisibility: .hidden) {
            if vm.isCreator {
                Button("Restart Game", role: .destructive) { showRestartConfirm = true }
            }
            Button("Exit to Lobby") { showExitConfirm = true }
            Button("How to Play") { showHowToPlay = true }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Restart Game?", isPresented: $showRestartConfirm) {
            Button("Restart", role: .destructive) { vm.restartGame() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will end the current game and start a new one for everyone.")
        }
        .alert("Leave Game?", isPresented: $showExitConfirm) {
            Button("Yes, End Game", role: .destructive) { vm.leaveGame() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will end the game for everyone.")
        }
        .sheet(isPresented: $showHowToPlay) {
            HowToPlayView()
        }
    }
}

// MARK: - Score Header

private struct ScoreHeader: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(vm.gamePlayers) { player in
                    let isCurrent = player.persistentId == vm.currentPlayerId
                    let isMe = player.persistentId == vm.myPersistentId
                    VStack(spacing: 2) {
                        Text(player.name)
                            .font(.caption2)
                            .lineLimit(1)
                        HStack(alignment: .lastTextBaseline, spacing: 2) {
                            Text("\(player.score)")
                                .font(.headline.bold())
                            Text("pts")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        HStack(spacing: 2) {
                            ForEach(0..<player.credits, id: \.self) { _ in
                                Circle()
                                    .fill(isMe ? Color.accentColor : Color.secondary)
                                    .frame(width: 5, height: 5)
                            }
                        }
                        .frame(height: 6)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(isCurrent ? Color.accentColor.opacity(0.15) : Color(.secondarySystemBackground))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(isCurrent ? Color.accentColor : Color.clear, lineWidth: 1.5)
                            )
                    )
                }

                Text("→ \(vm.gameSettings.winCondition)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 10)
    }
}

// MARK: - Turn Banner

private struct TurnBanner: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        Group {
            switch vm.gamePhase {
            case "player-turn":
                Text(vm.isMyTurn ? "Your turn — tap a gap to place" : "\(vm.currentPlayerName)'s turn")
                    .font(.subheadline.weight(vm.isMyTurn ? .semibold : .regular))
                    .foregroundStyle(vm.isMyTurn ? Color.accentColor : .secondary)
            case "song-guess":
                Text(vm.isMyTurn ? "Guess the song for a bonus credit?" : "Waiting for \(vm.currentPlayerName) to guess…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            case "challenge-window":
                if vm.isMyTurn {
                    Text("Others can challenge your placement")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Challenge \(vm.currentPlayerName)'s placement?")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            case "challenge":
                if vm.isChallenger {
                    Text("Place where YOU think it goes")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                } else {
                    Text("\(vm.challengerName) is challenging!")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                }
            default:
                Text("Resolving…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .animation(.easeInOut, value: vm.gamePhase)
    }
}

// MARK: - Skip Song Button

private struct SkipSongButton: View {
    @Environment(GameViewModel.self) private var vm
    @State private var tapped = false

    var body: some View {
        Button {
            tapped = true
            vm.skipSong()
        } label: {
            Label("Skip song · 1 credit", systemImage: "forward.circle")
                .font(.footnote)
        }
        .buttonStyle(.bordered)
        .tint(.secondary)
        .disabled(tapped)
    }
}

// MARK: - Non-Creator Progress Bar

private struct NonCreatorProgressBar: View {
    @Environment(GameViewModel.self) private var vm

    private func formatTime(_ s: Double) -> String {
        guard s.isFinite && s >= 0 else { return "0:00" }
        let i = Int(s); return "\(i / 60):\(String(format: "%02d", i % 60))"
    }

    var body: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2).fill(Color(.systemFill)).frame(height: 4)
                    let progress = vm.syncedDuration > 0
                        ? min(vm.syncedProgress / vm.syncedDuration, 1) : 0
                    RoundedRectangle(cornerRadius: 2).fill(Color.secondary)
                        .frame(width: geo.size.width * progress, height: 4)
                }
            }
            .frame(height: 4)
            HStack {
                Text(formatTime(vm.syncedProgress))
                    .font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                Spacer()
                if vm.syncedIsPlaying {
                    Image(systemName: "music.note")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Text(formatTime(vm.syncedDuration))
                    .font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Timeline Section

private struct TimelineSection: View {
    @Environment(GameViewModel.self) private var vm

    var canPlace: Bool {
        (vm.isMyTurn && vm.gamePhase == "player-turn") ||
        (vm.isChallenger && vm.gamePhase == "challenge")
    }

    var isInteractive: Bool { canPlace && vm.pendingPlacementIndex == nil }

    var disabledIndex: Int? {
        guard vm.gamePhase == "challenge" || vm.gamePhase == "challenge-window" else { return nil }
        return vm.challengeState?.originalCardIndex
    }

    // Label shown on the disabled gap (original placement position)
    var disabledLabel: String? {
        guard disabledIndex != nil else { return nil }
        let originalId = vm.challengeState?.originalPlayerId ?? ""
        if originalId == vm.myPersistentId { return "You" }
        return vm.gamePlayers.first { $0.persistentId == originalId }?.name
    }

    // During challenge-window, show all gaps (non-interactive) so the disabled placement
    // marker is visible — this is how challengers see where the original player placed.
    var showGapsForContext: Bool {
        vm.gamePhase == "challenge-window" && disabledIndex != nil
    }

    // Labels by card ID: used during reveal and challenge-resolved
    var cardLabels: [String: String] {
        var labels: [String: String] = [:]
        if vm.gamePhase == "reveal", let placedId = vm.placementResult?.id {
            let label = vm.myPersistentId == vm.currentPlayerId ? "You" : vm.currentPlayerName
            if !label.isEmpty { labels[placedId] = label }
        }
        if vm.gamePhase == "challenge-resolved" {
            let originalId = vm.challengeState?.originalPlayerId ?? ""
            for card in vm.timeline {
                if card.isYourGuess {
                    labels[card.id] = "You"
                } else if card.challengerCard {
                    labels[card.id] = vm.challengerName.isEmpty ? "Challenger" : vm.challengerName
                } else if card.originalCard {
                    let name = vm.gamePlayers.first { $0.persistentId == originalId }?.name ?? vm.currentPlayerName
                    labels[card.id] = name.isEmpty ? "Player" : name
                }
            }
        }
        return labels
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(vm.currentPlayerName.isEmpty ? "Timeline" : "\(vm.currentPlayerName)'s Timeline")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)

            TimelineView(
                cards: vm.timeline,
                isInteractive: isInteractive,
                showGapsForContext: showGapsForContext,
                pendingIndex: vm.pendingPlacementIndex,
                lastPlacedId: vm.placementResult?.id,
                gamePhase: vm.gamePhase,
                disabledIndex: disabledIndex,
                disabledLabel: disabledLabel,
                cardLabels: cardLabels,
                placementResult: vm.placementResult,
                challengeResult: vm.challengeState?.result,
                onPlace: { vm.selectPlacement(index: $0) }
            )
            .frame(maxHeight: .infinity)

            // Two-step confirmation
            if vm.pendingPlacementIndex != nil {
                HStack(spacing: 12) {
                    Button("Cancel") { vm.cancelPlacement() }
                        .buttonStyle(.bordered).tint(.secondary).controlSize(.large)
                    Button("Confirm Placement") { vm.confirmPlacement() }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                }
                .padding(.horizontal, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.vertical, 12)
        .animation(.spring(duration: 0.25), value: vm.pendingPlacementIndex != nil)
    }
}

// MARK: - Phase Actions Footer
// All non-full-screen phase text and actions live here, pinned to the bottom.
// Layout matches web GameFooter: turn instruction + action buttons.

private struct PhaseActionsFooter: View {
    @Environment(GameViewModel.self) private var vm
    @State private var hasResponded = false

    var body: some View {
        VStack(spacing: 12) {
            switch vm.gamePhase {
            case "player-turn":
                PlayerTurnFooter()
            case "song-guess":
                if !vm.isMyTurn {
                    Text("\(vm.currentPlayerName) is deciding whether to guess the song…")
                        .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
            case "challenge-window":
                ChallengeWindowFooter(hasResponded: $hasResponded)
            case "challenge":
                ChallengeInProgressFooter()
            default:
                EmptyView()
            }
        }
        .onChange(of: vm.gamePhase) { _, _ in hasResponded = false }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

private struct PlayerTurnFooter: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        VStack(spacing: 8) {
            Text(vm.isMyTurn ? "Select a place in the timeline above" : "\(vm.currentPlayerName)'s turn")
                .font(.subheadline.weight(vm.isMyTurn ? .semibold : .regular))
                .foregroundStyle(vm.isMyTurn ? Color.accentColor : .secondary)
                .multilineTextAlignment(.center)

            if vm.isMyTurn && vm.myCredits > 0 {
                Button("New Song · 1 credit") { vm.skipSong() }
                    .font(.footnote)
                    .buttonStyle(.bordered)
                    .tint(.secondary)
            }
        }
    }
}

private struct ChallengeWindowFooter: View {
    @Environment(GameViewModel.self) private var vm
    @Binding var hasResponded: Bool

    var body: some View {
        VStack(spacing: 10) {
            Text("Other players can now challenge.")
                .font(.subheadline.weight(.semibold))

            if vm.isMyTurn || hasResponded {
                Text(vm.isMyTurn ? "Waiting for other players…" : "Waiting for other players…")
                    .font(.caption).foregroundStyle(.secondary)
            } else if vm.canChallenge {
                HStack(spacing: 12) {
                    Button("Pass") { hasResponded = true; vm.skipChallenge() }
                        .buttonStyle(.bordered).tint(.secondary).controlSize(.large)
                        .frame(maxWidth: .infinity)
                    Button("Challenge · 1 credit") { hasResponded = true; vm.initiateChallenge() }
                        .buttonStyle(.borderedProminent).tint(.orange).controlSize(.large)
                        .frame(maxWidth: .infinity)
                }
            } else {
                Text("No credits to challenge")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Pass") { hasResponded = true; vm.skipChallenge() }
                    .buttonStyle(.bordered).controlSize(.large).frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 12)
    }
}

private struct ChallengeInProgressFooter: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        VStack(spacing: 4) {
            if vm.isChallenger {
                Text("Place where YOU think it goes")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
            } else {
                Text("\(vm.challengerName) is challenging the placement!")
                    .font(.subheadline)
                    .foregroundStyle(.orange)
                Text("Waiting for challenger to place their guess…")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 12)
    }
}

// MARK: - Song Guess Overlay

private struct SongGuessOverlay: View {
    @Environment(GameViewModel.self) private var vm
    @State private var title = ""
    @State private var artist = ""
    @State private var submitted = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()

            VStack(spacing: 20) {
                VStack(spacing: 4) {
                    Text("Guess the Song")
                        .font(.title2.bold())
                    Text("Both title and artist must be correct for the bonus!")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 12) {
                    TextField("Song title", text: $title)
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.next)
                    TextField("Artist", text: $artist)
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.done)
                        .onSubmit { submitGuess() }
                }

                HStack(spacing: 12) {
                    Button("Skip") {
                        submitted = true
                        vm.skipSongGuess()
                    }
                    .buttonStyle(.bordered)
                    .tint(.secondary)
                    .controlSize(.large)
                    .disabled(submitted)

                    Button("Submit Guess") {
                        submitGuess()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(submitted || (title.trimmingCharacters(in: .whitespaces).isEmpty && artist.trimmingCharacters(in: .whitespaces).isEmpty))
                }
            }
            .padding(28)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.2), radius: 20)
            )
            .padding(.horizontal, 32)
        }
    }

    private func submitGuess() {
        guard !submitted else { return }
        submitted = true
        vm.submitSongGuess(title: title.trimmingCharacters(in: .whitespaces),
                           artist: artist.trimmingCharacters(in: .whitespaces))
    }
}

// MARK: - Reveal Overlay

private struct RevealOverlay: View {
    @Environment(GameViewModel.self) private var vm
    let result: PlacementResult
    @State private var continued = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()

            VStack(spacing: 20) {
                // Result indicator
                HStack(spacing: 10) {
                    Image(systemName: result.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(result.correct ? Color.green : Color.red)
                    Text(result.correct ? "Correct!" : "Wrong!")
                        .font(.title.bold())
                }

                // Full song reveal — album art + title + artist + year
                if let card = vm.currentCard {
                    HStack(spacing: 14) {
                        if let art = card.albumArt, let url = URL(string: art) {
                            AsyncImage(url: url) { phase in
                                if case .success(let image) = phase {
                                    image.resizable().aspectRatio(contentMode: .fill)
                                } else {
                                    Color(.tertiarySystemFill)
                                }
                            }
                            .frame(width: 80, height: 80)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(card.artist)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            Text(card.title)
                                .font(.headline)
                                .lineLimit(2)
                            Text(result.year > 0 ? "\(result.year)" : "\(card.year)")
                                .font(.title2.bold())
                                .foregroundStyle(Color.accentColor)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(14)
                    .background(Color(.tertiarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Song guess result
                if let sg = vm.lastSongGuess {
                    let guessText = sg.correct
                        ? "\(sg.playerName) guessed correctly — bonus credit earned!"
                        : "\(sg.playerName) guessed \(sg.guessTitle) / \(sg.guessArtist) — wrong, no credit"
                    Text(guessText)
                        .font(.caption)
                        .foregroundStyle(sg.correct ? Color.green : Color.secondary)
                        .multilineTextAlignment(.center)
                }

                if vm.isCreator {
                    Button("Continue") {
                        continued = true
                        vm.continueGame()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(continued)
                } else {
                    Text("Waiting for host to continue…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.2), radius: 20)
            )
            .padding(.horizontal, 32)
        }
    }
}

// MARK: - Game Over Overlay

private struct GameOverOverlay: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Text("🏆")
                    .font(.system(size: 72))

                VStack(spacing: 6) {
                    Text(vm.gameWinner.map { "\($0.name) wins!" } ?? "Game Over")
                        .font(.largeTitle.bold())
                    Text("and shows amazing knowledge in music.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                // Final scoreboard — all players sorted by score
                if vm.gamePlayers.count > 1 {
                    VStack(spacing: 0) {
                        Text("Final Scores")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(.bottom, 8)

                        let sorted = vm.gamePlayers.sorted { $0.score > $1.score }
                        ForEach(Array(sorted.enumerated()), id: \.element.id) { i, player in
                            HStack {
                                Text("#\(i + 1)")
                                    .font(.caption.bold())
                                    .foregroundStyle(i == 0 ? Color.accentColor : .secondary)
                                    .frame(width: 28, alignment: .leading)
                                Text(player.name)
                                    .font(.subheadline.weight(player.persistentId == vm.gameWinner.flatMap { _ in vm.gamePlayers.max(by: { $0.score < $1.score }) }?.persistentId ? .semibold : .regular))
                                Spacer()
                                Text("\(player.score) cards")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(i == 0 ? Color.accentColor.opacity(0.08) : Color.clear)
                            if i < sorted.count - 1 { Divider() }
                        }
                    }
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 4)
                }

                Spacer()

                VStack(spacing: 12) {
                    if vm.isCreator {
                        Button("Play Again") { vm.restartGame() }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .frame(maxWidth: .infinity)
                    }
                    Button("Return to Lobby") { vm.leaveGame() }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .frame(maxWidth: .infinity)
                }
                .padding(.bottom, 32)
            }
            .padding(.horizontal, 28)
        }
    }
}

// MARK: - Player Left Banner

// MARK: - Event Notification Card
// Centered modal card for transient events (credit spend, song guess submitted).
// Mirrors web's CreditSpendNotification / SongGuessNotification components.

private struct EventNotificationCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack {
            Spacer()
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
            )
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.spring(duration: 0.3), value: title)
        .ignoresSafeArea(edges: .bottom)
        .allowsHitTesting(false)
    }
}

// MARK: - Player Left Banner

private struct PlayerLeftBanner: View {
    @Environment(GameViewModel.self) private var vm
    let message: String

    var body: some View {
        VStack {
            HStack {
                Image(systemName: "person.fill.xmark")
                Text(message)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Button {
                    vm.dismissPlayerLeftMessage()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(.systemOrange).opacity(0.15))
            .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.orange.opacity(0.3)), alignment: .bottom)
            Spacer()
        }
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
