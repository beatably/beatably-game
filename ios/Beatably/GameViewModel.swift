import Foundation
import SocketIO

enum AppView { case landing, reconnecting, lobby, game }

struct Player: Identifiable {
    let id: String
    let name: String
    let isCreator: Bool
    let isReady: Bool
}

struct Song: Identifiable, Equatable {
    let id: String
    let title: String
    let artist: String
    let year: Int
    let previewURL: String?
    let albumArt: String?
    var isPreview: Bool = false
    // Challenge-resolved display flags sent by backend
    var challengerCard: Bool = false
    var originalCard: Bool = false
    var isYourGuess: Bool = false
}

struct GamePlayer: Identifiable {
    let id: String
    let persistentId: String
    let name: String
    var score: Int
    var credits: Int
}

struct PlacementResult {
    let id: String
    let correct: Bool
    let year: Int
}

struct LastSongGuess {
    let playerName: String
    let guessTitle: String
    let guessArtist: String
    let correct: Bool
}

struct GameWinner {
    let name: String
    let score: Int
    let persistentId: String
}

struct ChallengeState {
    let challengerPersistentId: String
    let originalPlayerId: String
    // Index in timeline of the original placement — this slot is disabled for the challenger
    let originalCardIndex: Int?
    var result: ChallengeResult?
}

struct ChallengeResult {
    let challengerCorrect: Bool
    let originalCorrect: Bool
    let challengeWon: Bool
}

struct GameSettings {
    var winCondition: Int = 10
    var difficulty: String = "easy"
    var markets: [String] = ["international"]
    var yearMin: Int = 1960
    var yearMax: Int = 2025
    var genres: [String] = ["pop", "rock", "hip-hop", "electronic", "indie"]
}

@Observable
class GameViewModel {
    private static let uiTestResetStateArg = "UITEST_RESET_STATE"

    var view: AppView = .landing
    var isConnected = false
    var players: [Player] = []
    var gameSettings = GameSettings()
    var playerName = ""
    var roomCode = ""
    var isCreator = false
    var errorMessage: String?

    // Game state
    var gamePhase: String = "player-turn"
    var currentPlayerId: String = ""
    var timeline: [Song] = []
    var currentCard: Song? = nil
    var gamePlayers: [GamePlayer] = []
    var placementResult: PlacementResult? = nil
    var gameWinner: GameWinner? = nil
    var myPersistentId: String = ""
    var challengeState: ChallengeState? = nil

    // Song guessing
    var showSongGuess = false
    var songGuessNotification: String? = nil
    var lastSongGuess: LastSongGuess? = nil
    var creditSpendAction: String = ""   // "challenge" or "skip_song"

    // Two-step placement confirmation (mirrors web's pendingDropIndex)
    var pendingPlacementIndex: Int? = nil

    // The acting player's tentative gap, relayed from the server so observers can watch
    // the placement happen in real time before it's confirmed. Only used by non-placers.
    var remotePendingIndex: Int? = nil

    // Music progress for non-creator devices (synced from creator via progress_sync)
    var syncedProgress: Double = 0
    var syncedDuration: Double = 30
    var syncedIsPlaying: Bool = false

    // Transient notifications
    var playerLeftMessage: String? = nil
    var creditSpendMessage: String? = nil
    var placeErrorMessage: String? = nil

    // A join code carried in from a deep link (beatably://join?code=XXXX),
    // consumed by LandingView to prefill the join field.
    var pendingJoinCode: String? = nil

    var isMyTurn: Bool {
        !myPersistentId.isEmpty && currentPlayerId == myPersistentId
    }

    var isChallenger: Bool {
        guard let cs = challengeState else { return false }
        return cs.challengerPersistentId == myPersistentId
    }

    var myCredits: Int {
        gamePlayers.first { $0.persistentId == myPersistentId }?.credits ?? 0
    }

    var canChallenge: Bool {
        myCredits > 0 && !isMyTurn
    }

    var currentPlayerName: String {
        gamePlayers.first { $0.persistentId == currentPlayerId }?.name ?? ""
    }

    var challengerName: String {
        guard let cs = challengeState else { return "" }
        return gamePlayers.first { $0.persistentId == cs.challengerPersistentId }?.name ?? "A player"
    }

    @ObservationIgnored private var manager: SocketManager
    @ObservationIgnored private var socket: SocketIOClient
    @ObservationIgnored private var currentlyPlayingCardId: String?
    @ObservationIgnored private var autoProceedCancelTimer: Timer?
    @ObservationIgnored private var progressSyncTimer: Timer?

    // Stable session ID persisted across launches for reconnection
    private var sessionId: String {
        if let stored = UserDefaults.standard.string(forKey: "beatably_session_id") { return stored }
        let new = UUID().uuidString
        UserDefaults.standard.set(new, forKey: "beatably_session_id")
        return new
    }

    // UserDefaults keys for the active-session info needed to auto-rejoin after
    // the app is killed and relaunched (sessionId persists separately above).
    private static let kPlayerName = "beatably_player_name"
    private static let kRoomCode = "beatably_room_code"
    private static let kIsCreator = "beatably_is_creator"

    static func prepareForUITestsIfNeeded() {
        guard ProcessInfo.processInfo.arguments.contains(uiTestResetStateArg) else { return }
        let d = UserDefaults.standard
        d.removeObject(forKey: "beatably_session_id")
        d.removeObject(forKey: kPlayerName)
        d.removeObject(forKey: kRoomCode)
        d.removeObject(forKey: kIsCreator)
        d.synchronize()
    }

    // Test-only: seed a game state for visual verification, so a screenshot test can
    // render the timeline without orchestrating a live game. Pass the scenario name as
    // the argument immediately after UITEST_SEED_STATE, e.g.:
    //   xcrun simctl launch <udid> app.beatably.ios \
    //     UITEST_RESET_STATE UITEST_SEED_STATE challenge-resolved-won
    // (UITEST_RESET_STATE is required too, so a persisted session doesn't override the seed.)
    //
    // Scenarios cover the states where timeline rendering bugs hide (doubled cards,
    // correct/incorrect colouring, per-card labels). Add cases as coverage grows.
    private static let uiTestSeedArg = "UITEST_SEED_STATE"

    func seedStateForUITestsIfNeeded() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: Self.uiTestSeedArg), i + 1 < args.count else { return }
        let scenario = args[i + 1]

        let originalId = "p-original"
        let challengerId = "p-challenger"
        isCreator = false
        gamePlayers = [
            GamePlayer(id: originalId, persistentId: originalId, name: "Alice", score: 2, credits: 2),
            GamePlayer(id: challengerId, persistentId: challengerId, name: "You", score: 4, credits: 1),
        ]

        func song(_ id: String, _ title: String, _ year: Int,
                  original: Bool = false, challenger: Bool = false) -> Song {
            Song(id: id, title: title, artist: "Artist", year: year, previewURL: nil,
                 albumArt: nil, isPreview: false,
                 challengerCard: challenger, originalCard: original, isYourGuess: challenger)
        }

        // The challenged card (2005) appears twice: once for each player's placement.
        // Timeline order shows original-before-1984 vs challenger-after-1984 so the two
        // copies sit on opposite sides of a confirmed card.
        func challengeResolved(challengerCorrect: Bool, originalCorrect: Bool) {
            myPersistentId = challengerId       // local player is the challenger
            currentPlayerId = originalId        // backend sends original's id in this phase
            // Correct side goes after 1984; wrong side goes before it.
            let originalAfter = originalCorrect
            let orig = song("song-2005", "Test Track", 2005, original: true)
            let chal = song("song-2005", "Test Track", 2005, challenger: true)
            let mid  = song("song-1984", "Confirmed A", 1984)
            timeline = originalAfter
                ? [chal, mid, orig]   // challenger wrong (before), original correct (after)
                : [orig, mid, chal]   // original wrong (before), challenger correct (after)
            currentCard = song("song-2005", "Test Track", 2005)
            challengeState = ChallengeState(
                challengerPersistentId: challengerId, originalPlayerId: originalId,
                originalCardIndex: nil,
                result: ChallengeResult(challengerCorrect: challengerCorrect,
                                        originalCorrect: originalCorrect,
                                        challengeWon: challengerCorrect && !originalCorrect))
            placementResult = PlacementResult(id: "song-2005", correct: originalCorrect, year: 2005)
            gamePhase = "challenge-resolved"
        }

        // A normal turn reveal: local player placed 2005 and the result is shown.
        func reveal(correct: Bool) {
            myPersistentId = originalId
            currentPlayerId = originalId
            timeline = [song("song-1984", "Confirmed A", 1984),
                        song("song-2005", "Test Track", 2005)]
            currentCard = song("song-2005", "Test Track", 2005)
            placementResult = PlacementResult(id: "song-2005", correct: correct, year: 2005)
            challengeState = nil
            gamePhase = "reveal"
        }

        // Song-guess: local player just placed a card (hidden "?") and is now guessing the
        // song. The placed card must remain visible on the timeline as a "?" marker.
        func songGuess() {
            myPersistentId = originalId
            currentPlayerId = originalId
            let placed = song("song-placed", "New Track", 1990)
            timeline = [placed, song("song-2002", "Confirmed A", 2002)]
            currentCard = placed
            placementResult = PlacementResult(id: "song-placed", correct: true, year: 1990)
            challengeState = nil
            gamePhase = "song-guess"
        }

        // Challenge-window: local player just placed a card (hidden "?") and others may
        // challenge. The placed card must stay a pink "?" marker (year hidden, not coloured).
        func challengeWindow() {
            myPersistentId = originalId
            currentPlayerId = originalId
            let placed = song("song-placed", "New Track", 1990)
            timeline = [placed, song("song-2002", "Confirmed A", 2002)]
            currentCard = placed
            placementResult = PlacementResult(id: "song-placed", correct: true, year: 1990)
            challengeState = nil
            gamePhase = "challenge-window"
        }

        // Challenge: local player is the challenger placing on the original's timeline. The
        // backend sends the timeline WITH the challenged card; the challenger's view filters
        // it out and shows a marker at originalCardIndex. Optionally auto-place to reproduce
        // the "tap makes nodes disappear" bug.
        func challenge(autoPlaceAt index: Int? = nil) {
            myPersistentId = challengerId
            currentPlayerId = originalId
            let challenged = song("song-2002", "Test Track", 2002)
            timeline = [song("song-1968", "Confirmed A", 1968), challenged]  // A placed 2002 after 1968
            currentCard = challenged
            placementResult = PlacementResult(id: "song-2002", correct: true, year: 2002)
            challengeState = ChallengeState(
                challengerPersistentId: challengerId, originalPlayerId: originalId,
                originalCardIndex: 1, result: nil)
            gamePhase = "challenge"
            if let index {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { [weak self] in
                    self?.selectPlacement(index: index)
                }
            }
        }

        // Interactive local turn with a single confirmed card (1987). Optionally auto-fire
        // a placement after a delay so the placement animation can be captured via
        // screenshots without a real tap. Placing after 1987 (index 1) recenters 1987 to
        // the left (left-move); placing before it (index 0) shifts 1987 right.
        func playerTurnInteractive(autoPlaceAt index: Int? = nil) {
            myPersistentId = originalId
            currentPlayerId = originalId
            timeline = [song("song-1987", "Confirmed A", 1987)]
            currentCard = song("song-new", "New Track", 2001)  // the card being placed ("?")
            placementResult = nil
            challengeState = nil
            gamePhase = "player-turn"
            if let index {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { [weak self] in
                    self?.selectPlacement(index: index)
                }
            }
        }

        // Observer watching the active player place in real time: local player is NOT the
        // turn-holder, and a relayed preview index drives the pulsating "?" marker + name label.
        func observerPreview() {
            myPersistentId = challengerId       // local player is the observer ("You" is not placing)
            currentPlayerId = originalId         // Alice is the active player
            timeline = [song("song-1987", "Confirmed A", 1987)]
            currentCard = song("song-new", "New Track", 2001)
            placementResult = nil
            challengeState = nil
            gamePhase = "player-turn"
            remotePendingIndex = 1               // Alice tentatively placed after 1987
        }

        switch scenario {
        case "observer-preview":             observerPreview()
        case "song-guess":                   songGuess()
        case "challenge-resolved-won":       challengeResolved(challengerCorrect: true,  originalCorrect: false)
        case "challenge-resolved-defended":  challengeResolved(challengerCorrect: false, originalCorrect: true)
        case "challenge-resolved-both-wrong":challengeResolved(challengerCorrect: false, originalCorrect: false)
        case "reveal-correct":               reveal(correct: true)
        case "reveal-incorrect":             reveal(correct: false)
        case "challenge-window":             challengeWindow()
        case "challenge":                    challenge()
        case "challenge-auto-place":         challenge(autoPlaceAt: 0)
        case "player-turn-interactive":      playerTurnInteractive()
        case "anim-move-left":               playerTurnInteractive(autoPlaceAt: 1)
        case "anim-move-right":              playerTurnInteractive(autoPlaceAt: 0)
        default:
            print("[UITEST] Unknown seed scenario: \(scenario)")
            return
        }
        view = .game
    }

    private func persistSession() {
        let d = UserDefaults.standard
        d.set(playerName, forKey: Self.kPlayerName)
        d.set(roomCode, forKey: Self.kRoomCode)
        d.set(isCreator, forKey: Self.kIsCreator)
        // Flush now: a user may force-quit right after creating/joining, and we
        // need the session on disk to resume on the next launch.
        d.synchronize()
    }

    private func clearPersistedSession() {
        let d = UserDefaults.standard
        d.removeObject(forKey: Self.kPlayerName)
        d.removeObject(forKey: Self.kRoomCode)
        d.removeObject(forKey: Self.kIsCreator)
        d.synchronize()
    }

    init() {
        manager = SocketManager(
            socketURL: URL(string: Config.backendURL)!,
            config: [
                // Deterministic auto-reconnect: keep retrying with a bounded backoff
                // so a dropped/ backgrounded socket comes back on its own.
                .log(Config.socketLogging),
                .compress,
                .reconnects(true),
                .reconnectAttempts(-1),
                .reconnectWait(1),
                .reconnectWaitMax(5),
            ]
        )
        socket = manager.defaultSocket

        // Restore an interrupted session (app was killed mid-game). If we have one,
        // show the reconnecting screen until reconnect_session resolves.
        let d = UserDefaults.standard
        let savedName = d.string(forKey: Self.kPlayerName) ?? ""
        let savedCode = d.string(forKey: Self.kRoomCode) ?? ""
        if !savedName.isEmpty && !savedCode.isEmpty {
            playerName = savedName
            roomCode = savedCode
            isCreator = d.bool(forKey: Self.kIsCreator)
            view = .reconnecting
        }

        setupEventHandlers()
        socket.connect()
    }

    private func setupEventHandlers() {
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            print("[Socket] Connected to \(Config.backendURL)")
            DispatchQueue.main.async {
                self.isConnected = true
                // Attempt to rejoin an active room after a reconnection
                if !self.roomCode.isEmpty && !self.playerName.isEmpty {
                    self.attemptReconnection()
                }
            }
        }

        socket.on(clientEvent: .disconnect) { [weak self] data, _ in
            print("[Socket] Disconnected: \(data)")
            DispatchQueue.main.async { self?.isConnected = false }
        }

        socket.on("lobby_update") { [weak self] data, _ in
            guard let lobby = data.first as? [String: Any] else { return }
            DispatchQueue.main.async { self?.applyLobby(lobby) }
        }

        socket.on("game_started") { [weak self] data, _ in
            guard let game = data.first as? [String: Any] else { return }
            DispatchQueue.main.async {
                self?.applyGameUpdate(game)
                self?.view = .game
            }
        }

        socket.on("game_update") { [weak self] data, _ in
            guard let game = data.first as? [String: Any] else { return }
            DispatchQueue.main.async { self?.applyGameUpdate(game) }
        }

        // The acting player's tentative placement (observers only; the sender is excluded
        // server-side). index null/negative clears the preview marker.
        socket.on("placement_preview") { [weak self] data, _ in
            guard let self, let dict = data.first as? [String: Any] else { return }
            let idx = (dict["index"] as? Int) ?? (dict["index"] as? Double).map { Int($0) }
            DispatchQueue.main.async {
                self.remotePendingIndex = (idx ?? -1) >= 0 ? idx : nil
            }
        }

        socket.on("kicked") { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.errorMessage = "You were removed from the game."
                self?.resetToLanding()
            }
        }

        socket.on("host_left") { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.errorMessage = "The host left the game."
                self?.resetToLanding()
            }
        }

        socket.on("player_left_game") { [weak self] data, _ in
            guard let self else { return }
            let dict = data.first as? [String: Any]
            let name = dict?["playerName"] as? String ?? "A player"
            DispatchQueue.main.async {
                self.playerLeftMessage = "\(name) left the game."
                // Game ends — return to landing after a short delay so the message is visible
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    if self.playerLeftMessage != nil {
                        self.resetToLanding()
                    }
                }
            }
        }

        socket.on("auto_proceed") { [weak self] _, _ in
            // Server auto-advances the phase after a timeout. No client action needed;
            // the next game_update will reflect the new phase.
            print("[Socket] auto_proceed received")
        }

        socket.on("place_card_error") { [weak self] data, _ in
            guard let self else { return }
            let dict = data.first as? [String: Any]
            let reason = dict?["reason"] as? String ?? "unknown"
            print("[Socket] place_card_error: \(reason) — safe to retry")
            let message: String
            switch reason {
            case "not_your_turn": message = "It's not your turn right now."
            case "not_ready": message = "Reconnecting… please try again."
            default: message = "Couldn't place that card. Try again."
            }
            DispatchQueue.main.async {
                self.placeErrorMessage = message
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    if self.placeErrorMessage == message { self.placeErrorMessage = nil }
                }
            }
        }

        socket.on("song_guess_result") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let playerName = dict["playerName"] as? String else { return }
            DispatchQueue.main.async {
                self?.songGuessNotification = "\(playerName)'s guess submitted!"
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    self?.songGuessNotification = nil
                }
            }
        }

        socket.on("credit_spent_for_new_song") { [weak self] data, _ in
            guard let self else { return }
            guard let dict = data.first as? [String: Any],
                  let name = dict["spenderName"] as? String else { return }
            let action = dict["action"] as? String ?? "skip_song"
            let spenderPersistentId = dict["spenderPersistentId"] as? String ?? ""
            let isSelf = !self.myPersistentId.isEmpty && self.myPersistentId == spenderPersistentId
            let actor = isSelf ? "You" : name
            let message: String
            if action == "challenge" {
                message = "\(actor) spent 1 credit to challenge"
            } else {
                message = "\(actor) spent 1 credit for a new song"
            }
            DispatchQueue.main.async {
                self.creditSpendAction = action
                self.creditSpendMessage = message
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    self.creditSpendMessage = nil
                }
            }
        }

        socket.on("stop_music") { [weak self] _, _ in
            DispatchQueue.main.async { AudioPlayer.shared.pause() }
        }

        // Sync playback progress to non-creator devices
        socket.on("progress_sync") { [weak self] data, _ in
            guard let self, !self.isCreator,
                  let dict = data.first as? [String: Any] else { return }
            DispatchQueue.main.async {
                self.syncedProgress = dict["progress"] as? Double ?? 0
                self.syncedDuration = dict["duration"] as? Double ?? 30
                self.syncedIsPlaying = dict["isPlaying"] as? Bool ?? false
            }
        }
    }

    // MARK: - Lobby Actions

    func createLobby(name: String) {
        let code = randomCode()
        playerName = name
        roomCode = code
        isCreator = true

        let payload: [String: Any] = ["name": name, "code": code, "settings": settingsPayload()]

        socket.emitWithAck("create_lobby", payload).timingOut(after: 10) { [weak self] data in
            guard let self else { return }
            guard let response = data.first as? [String: Any] else { return }
            if let error = response["error"] as? String {
                DispatchQueue.main.async { self.errorMessage = error }
                return
            }
            DispatchQueue.main.async {
                if let player = response["player"] as? [String: Any],
                   let pId = player["persistentId"] as? String {
                    self.myPersistentId = pId
                }
                if let lobby = response["lobby"] as? [String: Any] { self.applyLobby(lobby) }
                self.persistSession()
                self.view = .lobby
            }
        }
    }

    func joinLobby(name: String, code: String) {
        playerName = name
        roomCode = code.uppercased()
        isCreator = false

        let payload: [String: Any] = ["name": name, "code": code.uppercased()]

        socket.emitWithAck("join_lobby", payload).timingOut(after: 10) { [weak self] data in
            guard let self else { return }
            guard let response = data.first as? [String: Any] else { return }
            if let error = response["error"] as? String {
                DispatchQueue.main.async { self.errorMessage = error }
                return
            }
            DispatchQueue.main.async {
                if let player = response["player"] as? [String: Any],
                   let pId = player["persistentId"] as? String {
                    self.myPersistentId = pId
                }
                if let lobby = response["lobby"] as? [String: Any] { self.applyLobby(lobby) }
                self.persistSession()
                self.view = .lobby
            }
        }
    }

    func updateSettings() {
        socket.emit("update_settings", ["code": roomCode, "settings": settingsPayload()] as [String: Any])
    }

    func kickPlayer(id: String) {
        socket.emit("kick_player", ["code": roomCode, "playerId": id] as [String: Any])
    }

    func startGame() {
        guard let url = URL(string: Config.backendURL + "/api/curated/select") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "musicPreferences": [
                "markets": gameSettings.markets,
                "yearRange": ["min": gameSettings.yearMin, "max": gameSettings.yearMax],
                "genres": gameSettings.genres
            ],
            "difficulty": gameSettings.difficulty,
            "playerCount": max(players.count, 1),
            "previewMode": true
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let self else { return }
            var tracks: [[String: Any]] = []
            if let data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let t = json["tracks"] as? [[String: Any]] { tracks = t }
            let payload: [String: Any] = ["code": self.roomCode, "realSongs": tracks]
            DispatchQueue.main.async { self.socket.emit("start_game", payload) }
        }.resume()
    }

    func leaveLobby() {
        socket.emit("leave_lobby", ["code": roomCode] as [String: Any])
        resetToLanding()
    }

    // MARK: - Game Actions

    func selectPlacement(index: Int) {
        guard (gamePhase == "player-turn" && isMyTurn) || (gamePhase == "challenge" && isChallenger) else { return }
        pendingPlacementIndex = index
        socket.emit("preview_placement", ["code": roomCode, "index": index] as [String: Any])
    }

    func confirmPlacement() {
        guard let index = pendingPlacementIndex else { return }
        pendingPlacementIndex = nil
        if gamePhase == "player-turn" && isMyTurn {
            socket.emit("place_card", ["code": roomCode, "index": index] as [String: Any])
        } else if gamePhase == "challenge" && isChallenger {
            socket.emit("challenge_place_card", ["code": roomCode, "index": index] as [String: Any])
        }
    }

    func cancelPlacement() {
        let had = pendingPlacementIndex != nil
        pendingPlacementIndex = nil
        // Tell observers the preview marker is gone.
        if had { socket.emit("preview_placement", ["code": roomCode, "index": -1] as [String: Any]) }
    }

    func placeCard(index: Int) {
        if gamePhase == "player-turn" && isMyTurn {
            socket.emit("place_card", ["code": roomCode, "index": index] as [String: Any])
        } else if gamePhase == "challenge" && isChallenger {
            socket.emit("challenge_place_card", ["code": roomCode, "index": index] as [String: Any])
        }
    }

    func continueGame() {
        if gamePhase == "challenge-resolved" {
            socket.emit("continue_after_challenge", ["code": roomCode] as [String: Any])
        } else {
            socket.emit("continue_game", ["code": roomCode] as [String: Any])
        }
    }

    func skipChallenge() {
        socket.emit("skip_challenge", ["code": roomCode] as [String: Any])
    }

    func initiateChallenge() {
        socket.emit("initiate_challenge", ["code": roomCode] as [String: Any])
    }

    func skipSong() {
        guard isMyTurn, myCredits > 0 else { return }
        socket.emit("use_token", ["code": roomCode, "action": "skip_song"] as [String: Any])
    }

    func submitSongGuess(title: String, artist: String) {
        socket.emit("guess_song", ["code": roomCode, "title": title, "artist": artist] as [String: Any])
        showSongGuess = false
    }

    func skipSongGuess() {
        socket.emit("skip_song_guess", ["code": roomCode] as [String: Any])
        showSongGuess = false
    }

    func restartGame() {
        guard isCreator else { return }
        startGame()
    }

    func leaveGame() {
        socket.emit("leave_lobby", ["code": roomCode] as [String: Any])
        resetToLanding()
    }

    func dismissPlayerLeftMessage() {
        playerLeftMessage = nil
    }

    // MARK: - Private

    private func applyGameUpdate(_ game: [String: Any]) {
        let phase = game["phase"] as? String ?? "player-turn"

        // Clear pending placement on any phase update — server now owns the state
        pendingPlacementIndex = nil
        remotePendingIndex = nil

        // Show song-guess UI for the active player; non-active players just wait
        if phase == "song-guess" {
            if isMyTurn && !showSongGuess {
                showSongGuess = true
            }
        } else {
            showSongGuess = false
        }

        gamePhase = phase
        currentPlayerId = game["currentPlayerId"] as? String ?? ""

        if let playersData = game["players"] as? [[String: Any]] {
            gamePlayers = playersData.compactMap { p in
                guard let id = p["id"] as? String, let name = p["name"] as? String else { return nil }
                return GamePlayer(
                    id: id,
                    persistentId: p["persistentId"] as? String ?? id,
                    name: name,
                    score: p["score"] as? Int ?? 0,
                    credits: p["tokens"] as? Int ?? 0
                )
            }
        }

        timeline = parseSongs(game["timeline"] as? [[String: Any]])

        if let deck = game["deck"] as? [[String: Any]], let first = deck.first {
            currentCard = parseSong(first)
        }

        // Track the placed card ID independently of feedback — needed for timeline filtering.
        // feedback may be absent during challenge-window / challenge phase updates.
        if let result = GameViewModel.parsePlacementResult(from: game) {
            placementResult = result
            let fb = game["feedback"] as? [String: Any]

            if let fb, let sg = fb["lastSongGuess"] as? [String: Any],
               let pn = sg["playerName"] as? String {
                lastSongGuess = LastSongGuess(
                    playerName: pn,
                    guessTitle: sg["guessTitle"] as? String ?? "",
                    guessArtist: sg["guessArtist"] as? String ?? "",
                    correct: sg["correct"] as? Bool ?? false
                )
            } else {
                lastSongGuess = nil
            }
        } else if phase == "player-turn" {
            placementResult = nil
            lastSongGuess = nil
        }

        if let w = game["winner"] as? [String: Any] {
            gameWinner = GameWinner(
                name: w["name"] as? String ?? "Unknown",
                score: w["score"] as? Int ?? 0,
                persistentId: w["persistentId"] as? String ?? ""
            )
        }

        // Parse challenge state; find the disabled index (original placement slot)
        if let challengeData = game["challenge"] as? [String: Any],
           let cpId = challengeData["challengerPersistentId"] as? String,
           phase == "challenge" || phase == "challenge-resolved" || phase == "challenge-window" {
            let result: ChallengeResult? = {
                guard let r = challengeData["result"] as? [String: Any] else { return nil }
                return ChallengeResult(
                    challengerCorrect: r["challengerCorrect"] as? Bool ?? false,
                    originalCorrect: r["originalCorrect"] as? Bool ?? false,
                    challengeWon: r["challengeWon"] as? Bool ?? false
                )
            }()
            // originalIndex is the gap index the original player clicked — use it directly
            // as disabledIndex so challenger cannot pick the same slot. Since we filter the
            // last-placed card from the visual timeline during challenge, these gap indices
            // match exactly what the backend recorded.
            // Socket.IO may deliver the number as Double, so try both.
            let originalIndex: Int? = (challengeData["originalIndex"] as? Int)
                ?? (challengeData["originalIndex"] as? Double).map { Int($0) }
            challengeState = ChallengeState(
                challengerPersistentId: cpId,
                originalPlayerId: challengeData["originalPlayerId"] as? String ?? "",
                originalCardIndex: originalIndex,
                result: result
            )
        } else if phase == "player-turn" {
            challengeState = nil
        }

        // Manage challenge-phase auto-proceed cancellation
        if phase == "challenge" {
            startCancelAutoProceed()
        } else {
            stopCancelAutoProceed()
        }

        // Audio: creator-only. Load on new card (don't autoplay — user presses play).
        // Music keeps playing through song-guess/challenge phases; only stops on stop_music
        // event or when a new card loads (which teardown()s the old player).
        if isCreator {
            if phase == "player-turn", let card = currentCard, let url = card.previewURL {
                if card.id != currentlyPlayingCardId {
                    currentlyPlayingCardId = card.id
                    AudioPlayer.shared.load(url: url)
                    startProgressSync()
                }
            }
        }
    }

    // Called when the app returns to the foreground. iOS suspends the socket in
    // the background; make sure we're connected (which triggers reconnect_session
    // via the .connect handler), or resync if we already are.
    func handleForeground() {
        guard !roomCode.isEmpty, !playerName.isEmpty else { return }
        if isConnected {
            attemptReconnection()
        } else {
            socket.connect()
        }
    }

    // Manual "Retry" from the reconnecting UI.
    func forceReconnect() {
        if isConnected {
            attemptReconnection()
        } else {
            socket.connect()
        }
    }

    // User gives up on resuming an interrupted session.
    func cancelReconnect() {
        resetToLanding()
    }

    // Pure parser (testable): extract a room code from a join deep link.
    // Accepts beatably://join?code=1234 and beatably://1234.
    static func parseJoinCode(from url: URL) -> String? {
        if let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let c = comps.queryItems?.first(where: { $0.name == "code" })?.value,
           !c.trimmingCharacters(in: .whitespaces).isEmpty {
            return c.trimmingCharacters(in: .whitespaces).uppercased()
        }
        let host = url.host ?? ""
        if !host.isEmpty && host != "join" { return host.uppercased() }
        let last = url.lastPathComponent
        if !last.isEmpty && last != "/" && last != "join" { return last.uppercased() }
        return nil
    }

    // Handle a join deep link: stash the code for LandingView to prefill.
    // Ignored while already in a lobby/game so it can't yank the player out.
    func handleDeepLink(_ url: URL) {
        guard let c = Self.parseJoinCode(from: url) else { return }
        DispatchQueue.main.async {
            if self.view != .lobby && self.view != .game {
                self.pendingJoinCode = c
                self.view = .landing
            }
        }
    }

    private func attemptReconnection() {
        let payload: [String: Any] = [
            "sessionId": sessionId,
            "roomCode": roomCode,
            "playerName": playerName
        ]
        socket.emitWithAck("reconnect_session", payload).timingOut(after: 10) { [weak self] data in
            guard let self, let response = data.first as? [String: Any] else { return }
            if let error = response["error"] as? String {
                print("[Reconnect] Failed: \(error)")
                // Session expired or room gone — go back to landing
                DispatchQueue.main.async { self.resetToLanding() }
                return
            }
            guard response["success"] as? Bool == true else { return }
            let returnView = response["view"] as? String ?? "lobby"
            DispatchQueue.main.async {
                if returnView == "game", let gameState = response["gameState"] as? [String: Any] {
                    self.applyGameUpdate(gameState)
                    self.view = .game
                } else if returnView == "waiting" || returnView == "lobby" {
                    self.view = .lobby
                }
                print("[Reconnect] Restored to view: \(returnView)")
            }
        }
    }

    private func startProgressSync() {
        guard progressSyncTimer == nil else { return }
        progressSyncTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.emitProgressUpdate()
        }
    }

    private func stopProgressSync() {
        progressSyncTimer?.invalidate()
        progressSyncTimer = nil
    }

    private func emitProgressUpdate() {
        guard isCreator, !roomCode.isEmpty else { return }
        let audio = AudioPlayer.shared
        socket.emit("progress_update", [
            "code": roomCode,
            "progress": audio.currentTime,
            "duration": audio.duration,
            "isPlaying": audio.isPlaying
        ] as [String: Any])
    }

    private func startCancelAutoProceed() {
        guard autoProceedCancelTimer == nil else { return }
        autoProceedCancelTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.socket.emit("cancel_auto_proceed", ["code": self.roomCode] as [String: Any])
        }
        // Send immediately too
        socket.emit("cancel_auto_proceed", ["code": roomCode] as [String: Any])
    }

    private func stopCancelAutoProceed() {
        autoProceedCancelTimer?.invalidate()
        autoProceedCancelTimer = nil
    }

    /// Extracted for unit testing — parses PlacementResult from a game_update dictionary.
    /// Does NOT require feedback to be present; only lastPlaced.id is mandatory.
    static func parsePlacementResult(from game: [String: Any]) -> PlacementResult? {
        guard let lp = game["lastPlaced"] as? [String: Any],
              let lpId = lp["id"] as? String else { return nil }
        let correct = lp["correct"] as? Bool ?? false
        let fb = game["feedback"] as? [String: Any]
        let year = fb?["year"] as? Int
            ?? (fb?["year"] as? Double).map { Int($0) }
            ?? 0
        return PlacementResult(id: lpId, correct: correct, year: year)
    }

    private func parseSong(_ dict: [String: Any]) -> Song? {
        guard let id = dict["id"] as? String,
              let title = dict["title"] as? String,
              let artist = dict["artist"] as? String else { return nil }
        let year: Int
        if let y = dict["year"] as? Int { year = y }
        else if let y = dict["year"] as? Double { year = Int(y) }
        else { return nil }
        return Song(
            id: id, title: title, artist: artist, year: year,
            previewURL: dict["preview_url"] as? String,
            albumArt: dict["album_art"] as? String,
            isPreview: dict["preview"] as? Bool ?? false,
            challengerCard: dict["challengerCard"] as? Bool ?? false,
            originalCard: dict["originalCard"] as? Bool ?? false,
            isYourGuess: dict["isYourGuess"] as? Bool ?? false
        )
    }

    private func parseSongs(_ array: [[String: Any]]?) -> [Song] {
        array?.compactMap { parseSong($0) } ?? []
    }

    private func applyLobby(_ lobby: [String: Any]) {
        if let playersData = lobby["players"] as? [[String: Any]] {
            players = playersData.compactMap { p in
                guard let id = p["id"] as? String, let name = p["name"] as? String else { return nil }
                return Player(id: id, name: name,
                              isCreator: p["isCreator"] as? Bool ?? false,
                              isReady: p["isReady"] as? Bool ?? false)
            }
        }
        if let settings = lobby["settings"] as? [String: Any] {
            if let win = settings["winCondition"] as? Int { gameSettings.winCondition = win }
            if let diff = settings["difficulty"] as? String { gameSettings.difficulty = diff }
            if let prefs = settings["musicPreferences"] as? [String: Any] {
                if let markets = prefs["markets"] as? [String] { gameSettings.markets = markets }
                if let yr = prefs["yearRange"] as? [String: Any],
                   let mn = yr["min"] as? Int, let mx = yr["max"] as? Int {
                    gameSettings.yearMin = mn; gameSettings.yearMax = mx
                }
                if let genres = prefs["genres"] as? [String] { gameSettings.genres = genres }
            }
        }
    }

    private func settingsPayload() -> [String: Any] {
        [
            "difficulty": gameSettings.difficulty,
            "winCondition": gameSettings.winCondition,
            "musicPreferences": [
                "markets": gameSettings.markets,
                "yearRange": ["min": gameSettings.yearMin, "max": gameSettings.yearMax],
                "genres": gameSettings.genres
            ] as [String: Any]
        ]
    }

    private func randomCode() -> String {
        String(Int.random(in: 1000...9999))
    }

    private func resetToLanding() {
        stopCancelAutoProceed()
        stopProgressSync()
        AudioPlayer.shared.stop()
        clearPersistedSession()
        currentlyPlayingCardId = nil
        playerName = ""; roomCode = ""; isCreator = false; players = []
        gamePhase = "player-turn"; currentPlayerId = ""; timeline = []
        currentCard = nil; gamePlayers = []; placementResult = nil
        gameWinner = nil; myPersistentId = ""; challengeState = nil
        showSongGuess = false; songGuessNotification = nil; playerLeftMessage = nil; creditSpendMessage = nil
        lastSongGuess = nil; pendingPlacementIndex = nil
        syncedProgress = 0; syncedDuration = 30; syncedIsPlaying = false
        view = .landing
    }
}
