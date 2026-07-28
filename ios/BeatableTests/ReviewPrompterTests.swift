import XCTest
@testable import Beatably

// MARK: - App Store review prompt gate
//
// Key strings are duplicated here on purpose: changing one in ReviewPrompter
// resets every player's counters, so a failure here is a useful heads-up.

final class ReviewPrompterTests: XCTestCase {

    private let kGamesPlayed = "beatably_games_played"
    private let kLastDate = "beatably_review_last_request_date"
    private let kLastVersion = "beatably_review_last_request_version"

    private var saved: [String: Any?] = [:]

    override func setUp() {
        super.setUp()
        let d = UserDefaults.standard
        for k in [kGamesPlayed, kLastDate, kLastVersion] {
            saved[k] = d.object(forKey: k)
            d.removeObject(forKey: k)
        }
    }

    override func tearDown() {
        let d = UserDefaults.standard
        for (k, v) in saved {
            if let v { d.set(v, forKey: k) } else { d.removeObject(forKey: k) }
        }
        saved = [:]
        super.tearDown()
    }

    private var currentVersion: String {
        Bundle(for: GameViewModel.self).infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
    }

    // MARK: Volume gate

    func test_notEligible_beforeThreeGames() {
        XCTAssertFalse(ReviewPrompter.isEligible, "fresh install must never be asked")
        ReviewPrompter.recordGamePlayed()
        ReviewPrompter.recordGamePlayed()
        XCTAssertFalse(ReviewPrompter.isEligible, "two games is not enough experience")
    }

    func test_eligible_onThirdGame() {
        for _ in 0..<3 { ReviewPrompter.recordGamePlayed() }
        XCTAssertTrue(ReviewPrompter.isEligible)
    }

    // MARK: Cooldown gates

    func test_notEligible_twiceInSameVersion() {
        UserDefaults.standard.set(9, forKey: kGamesPlayed)
        UserDefaults.standard.set(currentVersion, forKey: kLastVersion)
        XCTAssertFalse(ReviewPrompter.isEligible, "one ask per app version at most")
    }

    func test_notEligible_withinCooldown_evenAfterUpdate() {
        UserDefaults.standard.set(9, forKey: kGamesPlayed)
        UserDefaults.standard.set("0.1", forKey: kLastVersion)   // different (older) version
        UserDefaults.standard.set(Date().addingTimeInterval(-30 * 86_400), forKey: kLastDate)
        XCTAssertFalse(ReviewPrompter.isEligible, "30 days is inside the 120-day cooldown")
    }

    func test_eligibleAgain_afterCooldownAndNewVersion() {
        UserDefaults.standard.set(9, forKey: kGamesPlayed)
        UserDefaults.standard.set("0.1", forKey: kLastVersion)
        UserDefaults.standard.set(Date().addingTimeInterval(-200 * 86_400), forKey: kLastDate)
        XCTAssertTrue(ReviewPrompter.isEligible)
    }

    // MARK: Moment gate

    func test_multiplayerWin_isHighPoint() {
        XCTAssertTrue(ReviewPrompter.Moment.multiplayerWin.isHighPoint)
    }

    func test_soloPersonalBest_needsARunThatWentSomewhere() {
        XCTAssertFalse(ReviewPrompter.Moment.soloPersonalBest(score: 1).isHighPoint)
        XCTAssertFalse(ReviewPrompter.Moment.soloPersonalBest(score: 4).isHighPoint)
        XCTAssertTrue(ReviewPrompter.Moment.soloPersonalBest(score: 5).isHighPoint)
        XCTAssertTrue(ReviewPrompter.Moment.soloPersonalBest(score: 12).isHighPoint)
    }
}
