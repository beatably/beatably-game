import Foundation
import SocketIO

enum AppView { case landing, lobby, game }

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

    // Two-step placement confirmation (mirrors web's pendingDropIndex)
    var pendingPlacementIndex: Int? = nil

    // Music progress for non-creator devices (synced from creator via progress_sync)
    var syncedProgress: Double = 0
    var syncedDuration: Double = 30
    var syncedIsPlaying: Bool = false

    // Transient notifications
    var playerLeftMessage: String? = nil
    var creditSpendMessage: String? = nil

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

    init() {
        manager = SocketManager(
            socketURL: URL(string: Config.backendURL)!,
            config: [.log(false), .compress]
        )
        socket = manager.defaultSocket
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
            let dict = data.first as? [String: Any]
            let reason = dict?["reason"] as? String ?? "unknown"
            print("[Socket] place_card_error: \(reason) — safe to retry")
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
        pendingPlacementIndex = nil
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
                score: w["score"] as? Int ?? 0
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
