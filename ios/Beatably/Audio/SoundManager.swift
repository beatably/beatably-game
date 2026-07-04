import AVFoundation
import UIKit

enum GameSound {
    case placement    // place.mp3      — card dropped on the timeline
    case correct      // correct.mp3    — placement right / challenge revealed (quick positive chime)
    case challenge    // challenge.mp3  — a challenge is initiated
    case credit       // credit.mp3     — a credit spent by another player (coin win)
    case bonus        // bonus.mp3      — you spent a credit (bonus earned)
    case casino       // casino.mp3     — someone guessed the song correctly (casino bling)
    case win          // win.mp3        — you won the game
    case lose         // lose.mp3       — placement wrong / someone else won (losing)

    fileprivate var resource: String {
        switch self {
        case .placement: return "place"
        case .correct:   return "correct"
        case .challenge: return "challenge"
        case .credit:    return "credit"
        case .bonus:     return "bonus"
        case .casino:    return "casino"
        case .win:       return "win"
        case .lose:      return "lose"
        }
    }

    fileprivate var volume: Float {
        switch self {
        case .placement: return 0.45
        case .correct:   return 0.5
        case .challenge: return 0.55
        case .credit:    return 0.6
        case .bonus:     return 0.6
        case .casino:    return 0.6
        case .win:       return 0.6
        case .lose:      return 0.5
        }
    }
}

@MainActor
final class SoundManager {
    static let shared = SoundManager()
    private var players: [String: AVAudioPlayer] = [:]

    private init() {}

    func preload() {
        let names = ["place", "correct", "challenge", "credit", "bonus", "casino", "win", "lose"]
        for name in names {
            guard
                let url = Bundle.main.url(forResource: name, withExtension: "mp3"),
                let player = try? AVAudioPlayer(contentsOf: url)
            else { continue }
            player.prepareToPlay()
            players[name] = player
        }
    }

    func play(_ sound: GameSound) {
        guard let p = players[sound.resource] else { return }
        p.volume = sound.volume
        if p.isPlaying { p.currentTime = 0 } else { p.play() }
    }

    // MARK: Haptics

    func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }
}
