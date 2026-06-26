import XCTest
@testable import Beatably

// MARK: - PlacementResult parsing tests

final class PlacementResultParsingTests: XCTestCase {

    func test_parsesId_withFeedback() {
        let game: [String: Any] = [
            "lastPlaced": ["id": "card-1", "correct": true],
            "feedback": ["year": 1998]
        ]
        let result = GameViewModel.parsePlacementResult(from: game)
        XCTAssertEqual(result?.id, "card-1")
        XCTAssertEqual(result?.year, 1998)
        XCTAssertEqual(result?.correct, true)
    }

    func test_parsesId_withoutFeedback() {
        // This is the critical case: challenge phase often sends lastPlaced without feedback
        let game: [String: Any] = [
            "lastPlaced": ["id": "card-2", "correct": false]
        ]
        let result = GameViewModel.parsePlacementResult(from: game)
        XCTAssertNotNil(result, "placementResult must be set even when feedback is absent")
        XCTAssertEqual(result?.id, "card-2")
        XCTAssertEqual(result?.year, 0)
    }

    func test_parsesYear_asDouble() {
        // Socket.IO can deliver JSON numbers as Double
        let game: [String: Any] = [
            "lastPlaced": ["id": "card-3", "correct": false],
            "feedback": ["year": 1981.0]
        ]
        let result = GameViewModel.parsePlacementResult(from: game)
        XCTAssertEqual(result?.year, 1981)
    }

    func test_returnsNil_whenNoLastPlaced() {
        let game: [String: Any] = ["feedback": ["year": 2000]]
        XCTAssertNil(GameViewModel.parsePlacementResult(from: game))
    }
}

// MARK: - Deep link parsing tests

final class DeepLinkParsingTests: XCTestCase {
    func test_queryParam() {
        XCTAssertEqual(GameViewModel.parseJoinCode(from: URL(string: "beatably://join?code=1234")!), "1234")
    }
    func test_queryParam_lowercased_isUppercased() {
        XCTAssertEqual(GameViewModel.parseJoinCode(from: URL(string: "beatably://join?code=ab12")!), "AB12")
    }
    func test_hostAsCode() {
        XCTAssertEqual(GameViewModel.parseJoinCode(from: URL(string: "beatably://5678")!), "5678")
    }
    func test_noCode_returnsNil() {
        XCTAssertNil(GameViewModel.parseJoinCode(from: URL(string: "beatably://join")!))
        XCTAssertNil(GameViewModel.parseJoinCode(from: URL(string: "beatably://join?code=")!))
    }
}

// MARK: - Timeline filter tests

final class TimelineFilterTests: XCTestCase {

    // MARK: - Helpers

    private func song(id: String, year: Int = 2000) -> Song {
        Song(id: id, title: "T", artist: "A", year: year, previewURL: nil, albumArt: nil)
    }

    // MARK: - filterDisplayCards

    func test_playerTurn_noFilter() {
        let cards = [song(id: "a"), song(id: "b"), song(id: "c")]
        let result = TimelineView.filterDisplayCards(cards, lastPlacedId: "b", gamePhase: "player-turn")
        XCTAssertEqual(result.map(\.id), ["a", "b", "c"])
    }

    func test_songGuess_placedCardHidden() {
        let cards = [song(id: "a"), song(id: "b"), song(id: "c")]
        let result = TimelineView.filterDisplayCards(cards, lastPlacedId: "b", gamePhase: "song-guess")
        XCTAssertEqual(result.map(\.id), ["a", "c"])
    }

    func test_challengeWindow_placedCardHidden() {
        let cards = [song(id: "a"), song(id: "b"), song(id: "c")]
        let result = TimelineView.filterDisplayCards(cards, lastPlacedId: "b", gamePhase: "challenge-window")
        XCTAssertEqual(result.map(\.id), ["a", "c"])
    }

    func test_challenge_placedCardHidden() {
        let cards = [song(id: "a"), song(id: "b"), song(id: "c")]
        let result = TimelineView.filterDisplayCards(cards, lastPlacedId: "b", gamePhase: "challenge")
        XCTAssertEqual(result.map(\.id), ["a", "c"])
    }

    func test_reveal_noFilter() {
        let cards = [song(id: "a"), song(id: "b"), song(id: "c")]
        let result = TimelineView.filterDisplayCards(cards, lastPlacedId: "b", gamePhase: "reveal")
        XCTAssertEqual(result.map(\.id), ["a", "b", "c"])
    }

    func test_nilLastPlacedId_noFilter() {
        let cards = [song(id: "a"), song(id: "b")]
        let result = TimelineView.filterDisplayCards(cards, lastPlacedId: nil, gamePhase: "challenge")
        XCTAssertEqual(result.map(\.id), ["a", "b"])
    }

    // MARK: - Gap index alignment after filter

    /// After filtering the placed card, gap indices must still align with originalIndex.
    /// Scenario: timeline [1981, 2025, 1998(placed at index 2)] during challenge.
    /// After filter: [1981, 2025]. Gap 0=before-1981, 1=between, 2=after-2025.
    /// originalIndex=2 → gap 2 must be disabled.
    func test_gapIndexAlignment_afterFilter() {
        let s1981 = song(id: "s1981", year: 1981)
        let s2025 = song(id: "s2025", year: 2025)
        let placed = song(id: "placed", year: 1998)
        let cards = [s1981, s2025, placed]
        let originalIndex = 2

        let displayCards = TimelineView.filterDisplayCards(
            cards, lastPlacedId: "placed", gamePhase: "challenge"
        )

        XCTAssertEqual(displayCards.map(\.id), ["s1981", "s2025"],
                       "Placed card should be hidden during challenge")

        // Gap count = displayCards.count + 1
        let gapCount = displayCards.count + 1
        XCTAssertEqual(gapCount, 3, "Should have 3 gaps: before-1981, between, after-2025")

        // The gap at originalIndex should be the one to disable
        XCTAssertTrue(originalIndex < gapCount,
                      "originalIndex \(originalIndex) must be within valid gap range 0..<\(gapCount)")
    }

    // MARK: - Single-card timeline

    /// Scenario: timeline [1992]. Card placed at gap 1 (after 1992).
    /// During challenge: displayCards = [1992], disabledIndex = 1.
    func test_singleCard_placedAfter_gapAlignment() {
        let s1992 = song(id: "s1992", year: 1992)
        let placed = song(id: "placed", year: 1998)
        let cards = [s1992, placed]
        let originalIndex = 1

        let displayCards = TimelineView.filterDisplayCards(
            cards, lastPlacedId: "placed", gamePhase: "challenge"
        )

        XCTAssertEqual(displayCards.map(\.id), ["s1992"])
        let gapCount = displayCards.count + 1
        XCTAssertEqual(gapCount, 2)
        XCTAssertTrue(originalIndex < gapCount,
                      "Disabled index \(originalIndex) must be a valid gap")
    }
}
