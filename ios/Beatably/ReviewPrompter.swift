import Foundation
import StoreKit
import SwiftUI   // RequestReviewAction lives in the StoreKit↔SwiftUI overlay — needs both

/// Decides when it's worth spending an App Store review prompt.
///
/// iOS silently caps `requestReview` at ~3 prompts per user per year and gives no
/// feedback about whether anything was shown, so a request spent at a bad moment
/// is simply lost. Two rules follow from that: only ask on a genuine high point
/// (a multiplayer win, or a solo run that beat the player's own record), and only
/// once the player has enough games behind them to have an opinion worth leaving.
enum ReviewPrompter {
    /// Finished games (any mode) required before we ever ask.
    private static let minGamesPlayed = 3
    /// Cooldown between asks, even across app updates.
    private static let minDaysBetweenRequests = 120.0

    private static let kGamesPlayed = "beatably_games_played"
    private static let kLastRequestDate = "beatably_review_last_request_date"
    private static let kLastRequestVersion = "beatably_review_last_request_version"

    /// A celebration the app is already showing, which may be worth asking on.
    enum Moment {
        case multiplayerWin
        case soloPersonalBest(score: Int)

        var isHighPoint: Bool {
            switch self {
            case .multiplayerWin:
                return true
            case .soloPersonalBest(let score):
                // Early runs are trivially personal bests (the record starts at 0),
                // so require a run that actually went somewhere.
                return score >= 5
            }
        }
    }

    /// Call once per finished game, whatever the outcome.
    static func recordGamePlayed() {
        guard !isUITest else { return }
        let d = UserDefaults.standard
        d.set(d.integer(forKey: kGamesPlayed) + 1, forKey: kGamesPlayed)
    }

    /// Ask for a review if `moment` is a high point and the player is eligible.
    @MainActor
    static func requestIfEligible(_ request: RequestReviewAction, after moment: Moment) {
        guard moment.isHighPoint, !isUITest, isEligible else { return }
        // Record before asking: the system never reports whether it actually showed
        // the prompt, so an attempt has to count as one either way.
        let d = UserDefaults.standard
        d.set(Date(), forKey: kLastRequestDate)
        d.set(appVersion, forKey: kLastRequestVersion)
        request()
    }

    /// Internal rather than private so ReviewPrompterTests can drive it directly.
    static var isEligible: Bool {
        let d = UserDefaults.standard
        guard d.integer(forKey: kGamesPlayed) >= minGamesPlayed else { return false }
        // At most one ask per app version...
        if d.string(forKey: kLastRequestVersion) == appVersion { return false }
        // ...and never inside the cooldown window.
        if let last = d.object(forKey: kLastRequestDate) as? Date,
           Date().timeIntervalSince(last) < minDaysBetweenRequests * 86_400 {
            return false
        }
        return true
    }

    private static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
    }

    /// Seeded/UI-test runs render celebration screens for screenshots — a system
    /// alert on top of those would both corrupt the shots and burn a real prompt.
    private static var isUITest: Bool {
        ProcessInfo.processInfo.arguments.contains { $0.hasPrefix("UITEST") }
    }
}
