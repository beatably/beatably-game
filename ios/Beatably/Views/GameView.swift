import SwiftUI

struct GameView: View {
    @Environment(GameViewModel.self) private var vm
    @State private var showMenu = false
    @State private var showHowToPlay = false
    @State private var songDetail: Song? = nil   // tapped revealed timeline card
    @State private var showExitConfirm = false
    @State private var showRestartConfirm = false
    @State private var showCoinAnim = false
    @State private var coinAnimId = UUID()
    @State private var showCoinAwardAnim = false
    @State private var coinAwardId = UUID()
    @State private var playerCoinOrigins: [String: CGPoint] = [:]

    var body: some View {
        ZStack {
            // Space background covers the entire game view including header
            SpaceBackground().ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Header — semi-transparent so stars show through ──────────────
                HStack {
                    ScoreHeader(coinOrigins: $playerCoinOrigins)
                    Spacer(minLength: 0)
                    Button { showMenu = true } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3)
                            .foregroundStyle(Color.beatMuted)
                            .frame(width: 24, height: 24)
                    }
                    .padding(.trailing, 16)
                }

                // ── Timeline — fills all available space ────────────────────────
                TimelineSection(onCardTap: { songDetail = $0 })
                    .frame(maxHeight: .infinity)

                // ── Bottom footer — solid surface for readability ───────────────
                Divider().overlay(Color.beatBorder.opacity(0.4))
                VStack(spacing: 0) {
                    // Song info — shown once the card is revealed
                    if let card = vm.currentCard,
                       vm.gamePhase == "reveal" || vm.gamePhase == "challenge-resolved" {
                        FooterSongInfo(card: card, revealedYear: vm.placementResult?.year)
                        Divider().overlay(Color.beatBorder.opacity(0.4))
                    }
                    // Playback controls (all phases while a card is active)
                    if let card = vm.currentCard {
                        if vm.isCreator && card.previewURL != nil {
                            AudioControls()
                        } else if !vm.isCreator {
                            NonCreatorProgressBar()
                        }
                        Divider().overlay(Color.beatBorder.opacity(0.4))
                    }
                    PhaseActionsFooter()
                        .frame(minHeight: 110)
                }
                .animation(.spring(duration: 0.3), value: vm.gamePhase)
                // Slightly lighter than beatSurface so the action card stands out from the
                // near-black starry timeline area (still below beatSurface2 for nested contrast).
                .background(Color(hex: "19162E"))
            }

            // ── Full-screen overlays ────────────────────────────────────────────
            if let song = songDetail {
                BottomCard(glow: .beatPurple, onClose: { songDetail = nil }) {
                    SongDetailSheet(song: song)
                }
                .zIndex(9)
            }
            if vm.showSongGuess {
                BottomCard(glow: .beatPurple, onClose: { vm.skipSongGuess() }) {
                    SongGuessSheet()
                }
                .zIndex(9)
            }
            if vm.gamePhase == "game-over" {
                if vm.isSolo, let solo = vm.soloResult {
                    SoloScoreboardOverlay(result: solo)
                } else {
                    GameOverOverlay()
                }
            }

            // Solo run-ending cover: same background as the scoreboard, shown from
            // the "See Your Score" tap until the scoreboard arrives, so the brief
            // card-removal re-layout behind it is never visible.
            if vm.soloAwaitingScore && vm.soloResult == nil {
                ZStack {
                    Color.beatBg.ignoresSafeArea()
                    RadialGradient(colors: [Color.beatPurple.opacity(0.18), .clear],
                                   center: .center, startRadius: 0, endRadius: 360)
                        .ignoresSafeArea()
                }
                .transition(.identity)
                .zIndex(20)
            }

            // Player-left modal (centered popup)
            if let msg = vm.playerLeftMessage {
                PlayerLeftAlert(message: msg)
                    .zIndex(10)
            }

            // Coin payment animation — originates from the spender's coin stack in the header
            if showCoinAnim {
                let origin = playerCoinOrigins[vm.currentPlayerId ?? ""] ?? CGPoint(x: 80, y: 60)
                CoinPaymentAnimation()
                    .id(coinAnimId)
                    .position(x: origin.x, y: origin.y)
                    .zIndex(9)
            }

            // Coin award animation — flies in and lands on the guesser's coin stack in the header
            if showCoinAwardAnim {
                let origin = playerCoinOrigins[vm.currentPlayerId ?? ""] ?? CGPoint(x: 80, y: 60)
                CoinAwardAnimation()
                    .id(coinAwardId)
                    .position(x: origin.x, y: origin.y)
                    .zIndex(9)
            }

            // Transient notifications
            if let note = vm.creditSpendMessage {
                EventNotificationCard(
                    icon: "circle.fill",
                    color: Color(hex: "F5C842"),
                    title: note,
                    subtitle: note.contains("new song") ? "Loading a new song…" : "Challenge started…"
                )
            } else if let note = vm.songGuessNotification {
                EventNotificationCard(
                    icon: "checkmark.circle.fill",
                    color: Color.beatGreen,
                    title: note,
                    subtitle: "Result revealed at end of round"
                )
            }

            if let err = vm.placeErrorMessage {
                EventNotificationCard(
                    icon: "exclamationmark.triangle.fill",
                    color: Color.beatMagenta,
                    title: err,
                    subtitle: "Try a different position"
                )
            }
        }
        .coordinateSpace(.named("gameRoot"))
        .overlay(alignment: .top) {
            if !vm.isConnected { ReconnectingBanner() }
        }
        .onAppear {
            // Test hook: auto-open the song detail card for screenshot verification.
            if ProcessInfo.processInfo.arguments.contains("UITEST_SHOW_SONGDETAIL"),
               songDetail == nil,
               let s = vm.timeline.first(where: { $0.albumArt != nil }) ?? vm.timeline.first {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { songDetail = s }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: vm.isConnected)
        .onChange(of: vm.creditSpendMessage) { _, msg in
            guard msg != nil else { return }
            SoundManager.shared.play(vm.creditSpendAction == "challenge" ? .credit : .bonus)
            coinAnimId = UUID()
            showCoinAnim = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { showCoinAnim = false }
        }
        .onChange(of: vm.creditAwardTrigger) { _, _ in
            coinAwardId = UUID()
            showCoinAwardAnim = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { showCoinAwardAnim = false }
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
        .animation(.spring(duration: 0.35), value: songDetail)
        .animation(.spring(duration: 0.35), value: vm.showSongGuess)
    }
}

// MARK: - Coin view (custom gold circle, not emoji)

struct CoinView: View {
    var size: CGFloat = 13

    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(
                    colors: [Color(hex: "F5C842"), Color(hex: "C8930A")],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
            Circle()
                .strokeBorder(Color(hex: "E8B834"), lineWidth: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: Color(hex: "C8930A").opacity(0.5), radius: 2)
    }
}

// MARK: - Score Header

private struct ScoreHeader: View {
    @Environment(GameViewModel.self) private var vm
    @Binding var coinOrigins: [String: CGPoint]
    @State private var bouncingId: String? = nil

    // Fixed card width so a full row of 4 cards leaves a gap to the menu button equal to the
    // menu button's own 16pt margin to the screen edge. Consumed width across the row:
    // leading 16 + 3×8 inter-card + trailing 16 + 24 menu + 16 menu-trailing = 96.
    private var cardWidth: CGFloat {
        floor((UIScreen.main.bounds.width - 96) / 4)
    }

    var body: some View {
        if vm.isSolo {
            soloHeader
        } else {
            multiplayerHeader
        }
    }

    // Solo: no turn to highlight, so drop the player cards and show a stat row
    // (Streak / Guessed / Credits) across from the menu icon.
    private var soloHeader: some View {
        let p = vm.gamePlayers.first
        return HStack(spacing: 14) {
            soloStat(value: String(max(0, (p?.score ?? 1) - 1)), label: "Streak", color: .beatText)
            soloDivider
            soloStat(value: String(p?.correctGuesses ?? 0), label: "Guessed", color: .beatTeal)
            soloDivider
            VStack(spacing: 3) {
                HStack(spacing: 3) {
                    Text(verbatim: String(p?.credits ?? 0))
                        .font(.system(.headline, design: .rounded).bold())
                        .foregroundStyle(Color(hex: "F5C842"))
                    CoinView(size: 13)
                        // Record the coin-stack position so the credit-spend
                        // animation flies from here (not the default left origin).
                        .onGeometryChange(for: CGRect.self) { proxy in
                            proxy.frame(in: .named("gameRoot"))
                        } action: { frame in
                            if let pid = p?.persistentId {
                                coinOrigins[pid] = CGPoint(x: frame.midX, y: frame.midY)
                            }
                        }
                }
                Text("Credits")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private func soloStat(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 3) {
            Text(verbatim: value)
                .font(.system(.headline, design: .rounded).bold())
                .foregroundStyle(color)
            Text(label)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(Color.beatMuted)
        }
    }

    private var soloDivider: some View {
        Rectangle().fill(Color.beatBorder).frame(width: 1, height: 24)
    }

    private var multiplayerHeader: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.gamePlayers) { player in
                    let isCurrent = player.persistentId == vm.currentPlayerId
                    let isBouncing = player.persistentId == bouncingId
                    VStack(spacing: 3) {
                        Text(player.name)
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(isCurrent ? Color.beatText : Color.beatMuted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        HStack(alignment: .lastTextBaseline, spacing: 2) {
                            Text(verbatim: String(player.score))
                                .font(.system(.headline, design: .rounded).bold())
                                .foregroundStyle(Color.beatText)
                                .contentTransition(.numericText())
                            Text("songs")
                                .font(.system(.caption2, design: .rounded))
                                .foregroundStyle(Color.beatMuted)
                        }
                        // Overlapping coin stack — also tracks its position for coin-pay animation
                        OverlappingCoins(count: min(player.credits, 5))
                            .onGeometryChange(for: CGRect.self) { proxy in
                                proxy.frame(in: .named("gameRoot"))
                            } action: { frame in
                                coinOrigins[player.persistentId] = CGPoint(x: frame.midX, y: frame.midY)
                            }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .frame(width: cardWidth)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(isCurrent ? Color.beatMagenta.opacity(0.15) : Color.beatSurface2.opacity(0.85))
                    )
                    // Gradient border for active player, matching web's gradient-border-magenta
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(
                                isCurrent
                                    ? AnyShapeStyle(LinearGradient(
                                        colors: [Color.beatMagenta, Color.beatPurple],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    ))
                                    : AnyShapeStyle(Color.beatBorder),
                                lineWidth: isCurrent ? 2 : 1
                            )
                    )
                    .shadow(color: isCurrent ? Color.beatMagenta.opacity(0.6) : .clear, radius: 8)
                    .shadow(color: isCurrent ? Color.beatMagenta.opacity(0.3) : .clear, radius: 18)
                    .scaleEffect(isBouncing ? 1.12 : 1.0)
                    .animation(isBouncing
                        ? .spring(response: 0.25, dampingFraction: 0.3)
                        : .spring(response: 0.3, dampingFraction: 0.6),
                        value: isBouncing)
                }
            }
            // Inner vertical padding gives shadow room inside ScrollView's clip boundary
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .onChange(of: vm.creditSpendMessage) { _, msg in
            guard msg != nil else { return }
            bouncingId = vm.currentPlayerId
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { bouncingId = nil }
        }
        .onChange(of: vm.creditAwardTrigger) { _, _ in
            // Delay the bounce until the flying coin visually lands on the card.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.42) {
                bouncingId = vm.currentPlayerId
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { bouncingId = nil }
            }
        }
    }
}

// Overlapping coin stack — negative spacing so coins stack like web
private struct OverlappingCoins: View {
    let count: Int

    var body: some View {
        HStack(spacing: -5) {
            ForEach(Array(0..<count).reversed(), id: \.self) { i in
                CoinView(size: 13)
                    .zIndex(Double(i))
            }
        }
        .frame(height: 14)
    }
}

// MARK: - Footer Song Info (shown when card is revealed)

private struct FooterSongInfo: View {
    let card: Song
    var revealedYear: Int?

    var body: some View {
        HStack(spacing: 14) {
            if let art = card.albumArt, let url = URL(string: art) {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else { Color.beatSurface2 }
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.beatBorder, lineWidth: 1))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(card.title)
                    .font(.system(.body, design: .rounded).bold())
                    .foregroundStyle(Color.beatText)
                    .lineLimit(1)
                let year = revealedYear.map { $0 > 0 ? $0 : card.year } ?? card.year
                Text("\(card.artist) (\(String(year)))")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
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
        HStack(spacing: 6) {
            Text(formatTime(vm.syncedProgress))
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(Color.beatMuted)
                .frame(width: 34, alignment: .trailing)
                .monospacedDigit()

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color.beatBorder).frame(height: 9)
                    let progress = vm.syncedDuration > 0 ? min(vm.syncedProgress / vm.syncedDuration, 1) : 0
                    RoundedRectangle(cornerRadius: 4)
                        .fill(LinearGradient(
                            colors: [Color.beatTeal, Color.beatGradientPurple],
                            startPoint: .leading, endPoint: .trailing
                        ))
                        .frame(width: geo.size.width * progress, height: 9)
                        .shadow(color: Color.beatTeal.opacity(0.6), radius: 4)
                }
            }
            .frame(height: 9)

            Text(formatTime(vm.syncedDuration))
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(Color.beatMuted)
                .frame(width: 34, alignment: .leading)
                .monospacedDigit()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Timeline Section

private struct TimelineSection: View {
    @Environment(GameViewModel.self) private var vm
    let onCardTap: (Song) -> Void

    // One-time explainer shown in round one (single starter card visible). Persists across
    // launches via AppStorage; `dismissed` hides it immediately within the session.
    @AppStorage("beatably_seen_start_hint") private var seenStartHint = false
    @State private var startHintDismissed = false
    private var showStartHint: Bool { !seenStartHint && !startHintDismissed && vm.timeline.count == 1 }
    private func dismissStartHint() {
        guard showStartHint else { return }
        startHintDismissed = true
        seenStartHint = true
    }

    var canPlace: Bool {
        (vm.isMyTurn && vm.gamePhase == "player-turn") ||
        (vm.isChallenger && vm.gamePhase == "challenge")
    }
    var isInteractive: Bool { canPlace && vm.pendingPlacementIndex == nil }

    var disabledIndex: Int? {
        guard vm.gamePhase == "challenge" || vm.gamePhase == "challenge-window" else { return nil }
        return vm.challengeState?.originalCardIndex
    }

    var disabledLabel: String? {
        guard disabledIndex != nil else { return nil }
        let originalId = vm.challengeState?.originalPlayerId ?? ""
        if originalId == vm.myPersistentId { return "You" }
        return vm.gamePlayers.first { $0.persistentId == originalId }?.name
    }

    // Name shown below the "?" node while a card is being placed. During a challenge
    // the challenger is placing on the original's timeline; otherwise it's the active player.
    var pendingLabel: String? {
        if vm.gamePhase == "challenge" {
            let cid = vm.challengeState?.challengerPersistentId ?? ""
            if cid == vm.myPersistentId { return "You" }
            let name = vm.gamePlayers.first { $0.persistentId == cid }?.name ?? vm.challengerName
            return name.isEmpty ? nil : name
        }
        let label = vm.myPersistentId == vm.currentPlayerId ? "You" : vm.currentPlayerName
        return label.isEmpty ? nil : label
    }

    var cardLabels: [String: String] {
        var labels: [String: String] = [:]
        if vm.gamePhase == "reveal", let placedId = vm.placementResult?.id {
            let label = vm.myPersistentId == vm.currentPlayerId ? "You" : vm.currentPlayerName
            if !label.isEmpty { labels[placedId] = label }
        }
        if (vm.gamePhase == "challenge-window" || vm.gamePhase == "song-guess"), let placedId = vm.placementResult?.id {
            let label = vm.myPersistentId == vm.currentPlayerId ? "You" : vm.currentPlayerName
            if !label.isEmpty { labels[placedId] = label }
        }
        if vm.gamePhase == "challenge-resolved" {
            let originalId   = vm.challengeState?.originalPlayerId       ?? ""
            let challengerId = vm.challengeState?.challengerPersistentId ?? ""
            for card in vm.timeline {
                // Check role-specific flags first — isYourGuess is unreliable when both
                // the original placer and the challenger are the local player's concern.
                if card.challengerCard {
                    // Use "-chal" suffix so both copies of the song (same id) get distinct
                    // label keys; TimelineView's yearLabel() uses matching suffixes to look up.
                    labels[card.id + "-chal"] = challengerId == vm.myPersistentId
                        ? "You"
                        : (vm.challengerName.isEmpty ? "Challenger" : vm.challengerName)
                } else if card.originalCard {
                    labels[card.id + "-orig"] = originalId == vm.myPersistentId
                        ? "You"
                        : (vm.gamePlayers.first { $0.persistentId == originalId }?.name ?? vm.currentPlayerName)
                } else if card.isYourGuess {
                    labels[card.id] = "You"
                }
            }
        }
        return labels
    }

    var body: some View {
        VStack(spacing: 4) {
            // Solo has no other player, and the title overlaps the top node once the
            // streak grows — so it's hidden in solo.
            if !vm.isSolo {
                Text(vm.currentPlayerName.isEmpty ? "Timeline" : "\(vm.currentPlayerName)'s Timeline")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.beatText)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
            }

            TimelineView(
                cards: vm.timeline,
                isInteractive: isInteractive,
                pendingIndex: canPlace ? vm.pendingPlacementIndex : vm.remotePendingIndex,
                pendingSong: vm.currentCard,
                lastPlacedId: vm.placementResult?.id,
                gamePhase: vm.gamePhase,
                disabledIndex: disabledIndex,
                disabledLabel: disabledLabel,
                pendingLabel: pendingLabel,
                cardLabels: cardLabels,
                placementResult: vm.placementResult,
                challengeResult: vm.challengeState?.result,
                // Round-one explainer, rendered inside TimelineView anchored just above
                // the single starter node (only place the exact node position is known).
                startHint: showStartHint ? "Everyone starts with one random song on their timeline" : nil,
                isSolo: vm.isSolo,
                onPlace: {
                    vm.selectPlacement(index: $0)
                    SoundManager.shared.play(.placement)
                    SoundManager.shared.impact(.light)
                },
                // Tapping the pink pending node again cancels — mirror the Cancel button.
                canCancelPending: canPlace,
                onCancelPending: {
                    SoundManager.shared.impact(.light)
                    vm.cancelPlacement()
                },
                onCardTap: { song in
                    SoundManager.shared.impact(.light)
                    onCardTap(song)
                }
            )
            .frame(maxHeight: .infinity)
            // Tap anywhere in the timeline area to dismiss — simultaneous so it never
            // blocks the gap circles from placing a card.
            .simultaneousGesture(TapGesture().onEnded { dismissStartHint() })
            // Auto-dismiss after a few seconds if untouched.
            .task(id: showStartHint) {
                guard showStartHint else { return }
                try? await Task.sleep(for: .seconds(5))
                dismissStartHint()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: showStartHint)
    }
}

// MARK: - Phase Actions Footer

private struct PhaseActionsFooter: View {
    @Environment(GameViewModel.self) private var vm
    @State private var hasResponded = false

    var body: some View {
        VStack(spacing: 12) {
            switch vm.gamePhase {
            case "player-turn":
                if vm.pendingPlacementIndex != nil {
                    PlacementConfirmFooter()
                } else {
                    PlayerTurnFooter()
                }
            case "song-guess":
                if !vm.isMyTurn {
                    Text("\(vm.currentPlayerName) is deciding whether to guess the song…")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(Color.beatMuted)
                        .multilineTextAlignment(.center)
                }
            case "challenge-window":
                ChallengeWindowFooter(hasResponded: $hasResponded)
            case "challenge":
                if vm.pendingPlacementIndex != nil {
                    PlacementConfirmFooter()
                } else {
                    ChallengeInProgressFooter()
                }
            case "reveal":
                if let result = vm.placementResult {
                    InlineRevealFooter(result: result)
                }
            case "challenge-resolved":
                ChallengeResolvedOverlay()
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
        VStack(spacing: 20) {
            Text(vm.isMyTurn ? "Select a position in the timeline" : "\(vm.currentPlayerName)'s turn")
                .font(.system(.subheadline, design: .rounded).weight(vm.isMyTurn ? .semibold : .regular))
                .foregroundStyle(vm.isMyTurn ? Color.beatText : Color.beatMuted)
                .multilineTextAlignment(.center)

            if vm.isMyTurn && vm.myCredits > 0 {
                Button {
                    vm.skipSong()
                } label: {
                    HStack(spacing: 7) {
                        CoinView(size: 14)
                        Text("New Song · 1 credit")
                            .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Color.beatSurface2)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Color.beatBorder, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(Color.beatText)
                }
                .buttonStyle(PressScaleStyle(haptic: .light))
            }
        }
    }
}

private struct ChallengeWindowFooter: View {
    @Environment(GameViewModel.self) private var vm
    @Binding var hasResponded: Bool

    var body: some View {
        VStack(spacing: 20) {
            Text("Other players can now challenge.")
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(Color.beatText)

            if vm.isMyTurn || hasResponded {
                Text("Waiting for other players…")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
            } else if vm.canChallenge {
                HStack(spacing: 12) {
                    Button {
                        SoundManager.shared.play(.challenge)
                        hasResponded = true; vm.initiateChallenge()
                    } label: {
                        BeatSecondaryLabel(title: "Challenge · 1 credit")
                    }
                    .buttonStyle(PressScaleStyle(haptic: .light))
                    .frame(maxWidth: .infinity)

                    Button {
                        SoundManager.shared.impact(.light)
                        hasResponded = true; vm.skipChallenge()
                    } label: {
                        BeatPrimaryLabel(title: "Pass")
                    }
                    .buttonStyle(PressScaleStyle())
                    .frame(maxWidth: .infinity)
                }
            } else {
                Text("No credits to challenge")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                Button {
                    SoundManager.shared.impact(.light)
                    hasResponded = true; vm.skipChallenge()
                } label: {
                    BeatSecondaryLabel(title: "Pass")
                }
                .buttonStyle(PressScaleStyle(haptic: .light))
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct ChallengeInProgressFooter: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        VStack(spacing: 4) {
            if vm.isChallenger {
                Text("Place where YOU think it goes")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(.white)
            } else {
                Text("\(vm.challengerName) is challenging the placement!")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(.white)
                Text("Waiting for challenger to place their guess…")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct PlacementConfirmFooter: View {
    @Environment(GameViewModel.self) private var vm

    var body: some View {
        HStack(spacing: 12) {
            Button {
                SoundManager.shared.impact(.light)
                vm.cancelPlacement()
            } label: {
                BeatSecondaryLabel(title: "Cancel")
            }
            .buttonStyle(PressScaleStyle(haptic: .light))

            Button {
                vm.confirmPlacement()
            } label: {
                BeatPrimaryLabel(title: "Confirm Placement")
            }
            .buttonStyle(PressScaleStyle())
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.spring(duration: 0.25), value: vm.pendingPlacementIndex != nil)
    }
}

private struct InlineRevealFooter: View {
    @Environment(GameViewModel.self) private var vm
    let result: PlacementResult
    @State private var continued = false

    private var outcomeColor: Color { result.correct ? Color.beatGreen : Color(hex: "EF4444") }
    private var outcomeIcon: String { result.correct ? "checkmark.circle.fill" : "xmark.circle.fill" }

    private var outcomeText: String {
        // Solo: a wrong placement ends the run.
        if vm.isSolo && !result.correct {
            return "Wrong answer — your streak ends here!"
        }
        if vm.isMyTurn {
            return result.correct ? "You were correct!" : "You were wrong!"
        }
        return result.correct ? "\(vm.currentPlayerName) was correct!" : "\(vm.currentPlayerName) was wrong!"
    }

    private var continueTitle: String {
        (vm.isSolo && !result.correct) ? "See Your Score" : "Continue"
    }

    var body: some View {
        VStack(spacing: 20) {
            // Outcome
            HStack(spacing: 8) {
                Spacer()
                Image(systemName: outcomeIcon)
                    .font(.system(size: 18))
                    .foregroundStyle(outcomeColor)
                    .shadow(color: outcomeColor.opacity(0.7), radius: 4)
                Text(outcomeText)
                    .font(.system(.headline, design: .rounded).bold())
                    .foregroundStyle(Color.beatText)
                Spacer()
            }

            if let sg = vm.lastSongGuess {
                Text(sg.correct
                    ? "\(sg.playerName) guessed correctly — bonus credit!"
                    : "\(sg.playerName) guessed wrong — no credit")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(sg.correct ? Color.beatGreen : Color.beatMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            if vm.isCreator {
                Button {
                    continued = true; vm.continueGame()
                } label: {
                    BeatPrimaryLabel(title: continueTitle, isLoading: continued)
                }
                .buttonStyle(PressScaleStyle())
                .disabled(continued)
            } else {
                Text("Waiting for host to continue…")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .onAppear {
            // A correct song/artist guess is celebrated for everyone, overriding
            // the placement right/wrong cue.
            if vm.lastSongGuess?.correct == true {
                SoundManager.shared.play(.casino)
                SoundManager.shared.notification(.success)
                vm.creditAwardTrigger += 1
            } else if result.correct {
                SoundManager.shared.play(.correct)
                SoundManager.shared.notification(.success)
            } else {
                SoundManager.shared.play(.lose)
                SoundManager.shared.notification(.error)
            }
        }
    }
}

// MARK: - Song Guess Overlay

private struct SongGuessSheet: View {
    @Environment(GameViewModel.self) private var vm
    @State private var title = ""
    @State private var artist = ""
    @State private var submitted = false
    @FocusState private var titleFocused: Bool
    @FocusState private var artistFocused: Bool

    var body: some View {
        VStack(spacing: 18) {
            VStack(spacing: 6) {
                Text("Guess the Song")
                    .font(.system(.title2, design: .rounded).bold())
                    .foregroundStyle(Color.beatText)
                Text("Both title and artist must be correct for the bonus!")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                    .multilineTextAlignment(.center)
            }

            VStack(spacing: 10) {
                TextField("", text: $title, prompt: Text("Song title").foregroundStyle(Color.beatDim))
                    .font(.system(.body, design: .rounded))
                    .beatInput(focused: titleFocused)
                    .focused($titleFocused)
                    .submitLabel(.next)
                    .onSubmit { artistFocused = true }
                TextField("", text: $artist, prompt: Text("Artist").foregroundStyle(Color.beatDim))
                    .font(.system(.body, design: .rounded))
                    .beatInput(focused: artistFocused)
                    .focused($artistFocused)
                    .submitLabel(.done)
                    .onSubmit { submitGuess() }
            }

            HStack(spacing: 12) {
                Button {
                    SoundManager.shared.impact(.light)
                    submitted = true; vm.skipSongGuess()
                } label: {
                    BeatSecondaryLabel(title: "Skip")
                }
                .buttonStyle(PressScaleStyle(haptic: .light))
                .disabled(submitted)

                if !title.trimmingCharacters(in: .whitespaces).isEmpty
                    && !artist.trimmingCharacters(in: .whitespaces).isEmpty {
                    Button { submitGuess() } label: {
                        BeatPrimaryLabel(title: "Submit Guess", isLoading: submitted)
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(submitted)
                }
            }

        }
        .padding(.horizontal, 24)
        .padding(.top, 4)
    }

    private func submitGuess() {
        guard !submitted else { return }
        SoundManager.shared.impact(.medium)
        submitted = true
        vm.submitSongGuess(title: title.trimmingCharacters(in: .whitespaces),
                           artist: artist.trimmingCharacters(in: .whitespaces))
    }
}

// MARK: - Confetti

private struct ConfettiPiece: Identifiable {
    let id = UUID()
    let xFraction: CGFloat   // 0…1 across the screen width
    let delay: Double
    let duration: Double
    let color: Color
}

// Falling confetti backdrop (web WinnerView parity): 50 chips drop from above the
// top edge to below the bottom edge, spinning as they fall. Each piece starts
// off-screen and invisible so nothing is parked at the top before its delay.
private struct ConfettiView: View {
    private static let colors: [Color] = [
        Color(hex: "22C55E"), Color(hex: "00CED1"), Color(hex: "9945FF"),
        Color(hex: "FF1493"), Color(hex: "F5C842")
    ]
    @State private var pieces: [ConfettiPiece] = []

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                ForEach(pieces) { piece in
                    ConfettiPieceView(piece: piece, screenHeight: geo.size.height)
                        .position(x: piece.xFraction * geo.size.width, y: 0)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
        .onAppear {
            pieces = (0..<50).map { _ in
                ConfettiPiece(
                    xFraction: .random(in: 0...1),
                    delay: .random(in: 0...2),
                    duration: .random(in: 3...5),
                    color: Self.colors.randomElement()!
                )
            }
        }
    }
}

private struct ConfettiPieceView: View {
    let piece: ConfettiPiece
    let screenHeight: CGFloat
    @State private var fall = false

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(piece.color)
            .frame(width: 8, height: 12)
            .shadow(color: piece.color.opacity(0.33), radius: 3)
            .rotationEffect(.degrees(fall ? 720 : 0))
            .offset(y: fall ? screenHeight + 60 : -60)
            .opacity(fall ? 0.9 : 0)
            .onAppear {
                withAnimation(.linear(duration: piece.duration).delay(piece.delay)) {
                    fall = true
                }
            }
    }
}

// MARK: - Game Over Overlay

private struct GameOverOverlay: View {
    @Environment(GameViewModel.self) private var vm
    @State private var trophyScale: CGFloat = 0.3
    @State private var trophyRotation: Double = -15

    var body: some View {
        ZStack {
            Color.beatBg.ignoresSafeArea()
            RadialGradient(
                colors: [Color.beatPurple.opacity(0.18), .clear],
                center: .center, startRadius: 0, endRadius: 360
            )
            .ignoresSafeArea()

            ConfettiView()

            VStack(spacing: 24) {
                Spacer()

                Text("🏆")
                    .font(.system(size: 80))
                    .scaleEffect(trophyScale)
                    .rotationEffect(.degrees(trophyRotation))
                    .shadow(color: Color.beatMagenta.opacity(0.5), radius: 16)

                VStack(spacing: 8) {
                    Text(vm.gameWinner.map { "\($0.name) wins!" } ?? "Game Over")
                        .font(.system(.largeTitle, design: .rounded).bold())
                        .foregroundStyle(Color.beatText)
                    Text("and shows amazing taste in music.")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(Color.beatMuted)
                        .multilineTextAlignment(.center)
                }

                if vm.gamePlayers.count > 1 {
                    VStack(spacing: 0) {
                        Text("Final Scores")
                            .font(.system(.footnote, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.beatMuted)
                            .padding(.bottom, 10)

                        let sorted = vm.gamePlayers.sorted { $0.score > $1.score }
                        ForEach(Array(sorted.enumerated()), id: \.element.id) { i, player in
                            HStack {
                                Text("#\(i + 1)")
                                    .font(.system(.footnote, design: .rounded).bold())
                                    .foregroundStyle(i == 0 ? Color.beatTeal : Color.beatMuted)
                                    .frame(width: 28, alignment: .leading)
                                Text(player.name)
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(i == 0 ? Color.beatText : Color.beatMuted)
                                Spacer()
                                Text("\(player.score) songs")
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(Color.beatMuted)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(i == 0 ? Color.beatTeal.opacity(0.10) : Color.clear)
                            if i < sorted.count - 1 {
                                Divider().overlay(Color.beatBorder)
                            }
                        }
                    }
                    .padding(.top, 4)
                    .background(Color.beatSurface2)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.beatBorder, lineWidth: 1))
                    .padding(.horizontal, 4)
                }

                Spacer()

                VStack(spacing: 12) {
                    if vm.isCreator {
                        Button { vm.restartGame() } label: {
                            BeatPrimaryLabel(title: "Play Again")
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                    Button { vm.leaveGame() } label: {
                        BeatSecondaryLabel(title: "Return to Lobby")
                    }
                    .buttonStyle(PressScaleStyle(haptic: .light))
                }
                .padding(.bottom, 40)
            }
            .padding(.horizontal, 28)
        }
        .onAppear {
            let iWon = vm.gameWinner.map { !$0.persistentId.isEmpty && $0.persistentId == vm.myPersistentId } ?? false
            if iWon {
                SoundManager.shared.play(.win)
                SoundManager.shared.notification(.success)
            } else {
                SoundManager.shared.play(.lose)
                SoundManager.shared.impact(.soft)
            }
            withAnimation(.spring(duration: 0.6, bounce: 0.4)) {
                trophyScale = 1
                trophyRotation = 5
            }
            withAnimation(.easeInOut(duration: 0.8).delay(0.5).repeatForever(autoreverses: true)) {
                trophyRotation = -5
            }
        }
    }
}

// MARK: - Solo Scoreboard

private struct SoloScoreboardOverlay: View {
    @Environment(GameViewModel.self) private var vm
    let result: SoloResult
    @AppStorage("beatably_solo_best") private var soloBest: Int = 0
    @State private var isPersonalBest = false
    @State private var prevBest = 0
    @State private var trophyScale: CGFloat = 0.3
    @State private var trophyRotation: Double = -15

    private var years: [Int] { result.timeline.map(\.year).filter { $0 > 0 } }

    var body: some View {
        ZStack {
            Color.beatBg.ignoresSafeArea()
            RadialGradient(colors: [Color.beatPurple.opacity(0.18), .clear],
                           center: .center, startRadius: 0, endRadius: 360)
                .ignoresSafeArea()

            ConfettiView()

            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 20) {
                        header
                        statTiles
                        if let mn = years.min(), let mx = years.max() { eraLine(mn, mx) }
                        recap
                        leaderboard
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 32)
                    .padding(.bottom, 24)
                }
                actionsBar
            }
        }
        .onAppear {
            prevBest = soloBest
            if result.score > soloBest { isPersonalBest = true; soloBest = result.score }
            SoundManager.shared.play(.winner)
            SoundManager.shared.notification(.success)
            withAnimation(.spring(duration: 0.6, bounce: 0.4)) { trophyScale = 1; trophyRotation = 5 }
            withAnimation(.easeInOut(duration: 0.8).delay(0.5).repeatForever(autoreverses: true)) { trophyRotation = -5 }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text(isPersonalBest ? "🏆" : "🎵")
                .font(.system(size: 60))
                .scaleEffect(trophyScale)
                .rotationEffect(.degrees(trophyRotation))
                .shadow(color: Color.beatMagenta.opacity(0.5), radius: 16)
            if isPersonalBest {
                Text("New personal best!")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.beatTeal)
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(Capsule().fill(Color.beatTeal.opacity(0.12)))
            } else {
                Text("RUN OVER")
                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.beatMuted)
                    .tracking(1)
            }
            Text(verbatim: String(result.score))
                .font(.system(size: 72, weight: .heavy, design: .rounded))
                .foregroundStyle(Color.beatText)
            Text(result.score == 1 ? "song placed in a row" : "songs placed in a row")
                .font(.system(.body, design: .rounded))
                .foregroundStyle(Color.beatMuted)
            if !isPersonalBest && prevBest > 0 {
                Text("Your best: \(prevBest)")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
            }
        }
    }

    private var statTiles: some View {
        HStack(spacing: 12) {
            statTile(value: result.rank.map { "#\($0)" } ?? "—", label: "Global rank",
                     color: result.rank == 1 ? Color(hex: "F5C842") : ((result.rank ?? 99) <= 10 ? Color.beatTeal : Color.beatText))
            statTile(value: String(result.correctGuesses), label: "Songs named", color: Color.beatTeal)
            statTile(value: String(result.creditsRemaining), label: "Credits left", color: Color(hex: "F5C842"))
        }
    }

    private func statTile(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 6) {
            Text(verbatim: value).font(.system(size: 26, weight: .heavy, design: .rounded)).foregroundStyle(color)
            Text(label).font(.system(.caption2, design: .rounded)).foregroundStyle(Color.beatMuted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.beatSurface2))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.beatBorder, lineWidth: 1))
    }

    private func eraLine(_ mn: Int, _ mx: Int) -> some View {
        (Text("Era spanned ").foregroundStyle(Color.beatMuted)
            + Text("\(String(mn)) – \(String(mx))").foregroundStyle(Color.beatText).fontWeight(.semibold)
            + Text(" · \(mx - mn) yrs").foregroundStyle(Color.beatMuted))
            .font(.system(.subheadline, design: .rounded))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.beatSurface2))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.beatBorder, lineWidth: 1))
    }

    @ViewBuilder private var recap: some View {
        if !result.timeline.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Your timeline")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.beatText)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(result.timeline) { song in
                            VStack(spacing: 4) {
                                recapArt(song)
                                Text(verbatim: String(song.year))
                                    .font(.system(.caption2, design: .rounded).weight(.semibold))
                                    .foregroundStyle(Color.beatText)
                            }
                            .frame(width: 56)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func recapArt(_ song: SoloRecapSong) -> some View {
        Group {
            if let art = song.albumArt, let url = URL(string: art) {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase { img.resizable().aspectRatio(contentMode: .fill) }
                    else { Color.beatSurface2 }
                }
            } else {
                LinearGradient(colors: [Color(hex: "1E1B34"), Color(hex: "2A2547")],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                    .overlay(Image(systemName: "music.note").foregroundStyle(Color.beatMuted))
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.beatBorder, lineWidth: 1))
    }

    private var leaderboard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Global Top 10")
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(Color.beatText)
            VStack(spacing: 0) {
                ForEach(Array(result.top10.enumerated()), id: \.element.id) { i, entry in
                    leaderRow(rank: i + 1, name: entry.name, score: entry.score,
                              highlight: isHighlighted(index: i, entry: entry), top: i == 0)
                    if i < result.top10.count - 1 { Divider().overlay(Color.beatBorder) }
                }
                if let rank = result.rank, rank > 10 {
                    Divider().overlay(Color.beatBorder)
                    leaderRow(rank: rank, name: vm.playerName.isEmpty ? "You" : vm.playerName,
                              score: result.score, highlight: true, top: false)
                }
            }
            .background(Color.beatSurface2)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.beatBorder, lineWidth: 1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func isHighlighted(index: Int, entry: SoloLeaderEntry) -> Bool {
        guard let rank = result.rank, rank <= 10 else { return false }
        return index + 1 == rank && entry.score == result.score && entry.name == vm.playerName
    }

    private func leaderRow(rank: Int, name: String, score: Int, highlight: Bool, top: Bool) -> some View {
        HStack {
            Text("#\(rank)")
                .font(.system(.footnote, design: .rounded).bold())
                .foregroundStyle(top ? Color.beatTeal : Color.beatMuted)
                .frame(width: 34, alignment: .leading)
            Text(name)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(Color.beatText)
                .fontWeight(highlight ? .semibold : .regular)
            Spacer()
            Text("\(score) songs")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(Color.beatMuted)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(highlight ? Color.beatTeal.opacity(0.10) : Color.clear)
    }

    private var actionsBar: some View {
        HStack(spacing: 12) {
            Button { vm.restartGame() } label: { BeatPrimaryLabel(title: "Play Again") }
                .buttonStyle(PressScaleStyle())
            Button { vm.leaveGame() } label: { BeatSecondaryLabel(title: "Exit to Menu") }
                .buttonStyle(PressScaleStyle(haptic: .light))
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity)
        .background(Color(hex: "19162E"))
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.beatBorder), alignment: .top)
    }
}

// MARK: - Event Notification Card

private struct EventNotificationCard: View {
    let icon: String
    let color: Color
    let title: String
    let subtitle: String

    var body: some View {
        VStack {
            Spacer()
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 26))
                    .foregroundStyle(color)
                    .shadow(color: color.opacity(0.6), radius: 6)
                    .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.beatText)
                    Text(subtitle)
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(Color.beatMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.beatSurface)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .strokeBorder(color.opacity(0.35), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.3), radius: 16, y: 4)
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.spring(duration: 0.3), value: title)
        .ignoresSafeArea(edges: .bottom)
        .allowsHitTesting(false)
    }
}

// MARK: - Player Left Banner

// MARK: - Player left alert (centered modal, not top banner)

private struct PlayerLeftAlert: View {
    @Environment(GameViewModel.self) private var vm
    let message: String

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { vm.dismissPlayerLeftMessage() }

            VStack(spacing: 20) {
                Image(systemName: "person.fill.xmark")
                    .font(.system(size: 44))
                    .foregroundStyle(Color.beatMagenta)
                    .shadow(color: Color.beatMagenta.opacity(0.5), radius: 10)

                Text(message)
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(Color.beatText)
                    .multilineTextAlignment(.center)

                Button { vm.dismissPlayerLeftMessage() } label: {
                    BeatPrimaryLabel(title: "OK")
                }
                .buttonStyle(PressScaleStyle())
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 22)
                    .fill(Color.beatSurface)
                    .overlay(
                        RoundedRectangle(cornerRadius: 22)
                            .strokeBorder(Color.beatMagenta.opacity(0.35), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.5), radius: 28)
            )
            .padding(.horizontal, 36)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.92)))
    }
}

// MARK: - Coin payment animation

struct CoinPaymentAnimation: View {
    @State private var offsetY: CGFloat = 0
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 1

    var body: some View {
        CoinView(size: 26)
            .scaleEffect(scale)
            .offset(y: offsetY)
            .opacity(opacity)
            .onAppear {
                // Phase 1: coin pops slightly larger (100ms)
                withAnimation(.easeOut(duration: 0.1)) { scale = 1.7 }
                // Phase 2: accelerates straight up, fades near top
                withAnimation(.easeIn(duration: 0.42).delay(0.08)) {
                    offsetY = -340
                    opacity = 0
                }
            }
            .allowsHitTesting(false)
    }
}

// MARK: - Coin award animation (reverse of the payment: flies in and lands on the card)

struct CoinAwardAnimation: View {
    @State private var offsetY: CGFloat = -340
    @State private var scale: CGFloat = 1.7
    @State private var opacity: Double = 0

    var body: some View {
        CoinView(size: 26)
            .scaleEffect(scale)
            .offset(y: offsetY)
            .opacity(opacity)
            .onAppear {
                // Phase 1: flies down from the top into the stack, fading in
                withAnimation(.easeOut(duration: 0.42)) {
                    offsetY = 0
                    opacity = 1
                }
                // Phase 2: lands — shrinks and fades into the coin stack
                withAnimation(.easeIn(duration: 0.18).delay(0.42)) {
                    scale = 0.7
                    opacity = 0
                }
            }
            .allowsHitTesting(false)
    }
}
