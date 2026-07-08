import XCTest
import Darwin

// Output dir for screenshots captured during visual verification tests
private let screenshotDir = "/Users/tim/Game/ios/screenshots"

final class BeatableUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments.append("UITEST_RESET_STATE")
        try? FileManager.default.createDirectory(atPath: screenshotDir, withIntermediateDirectories: true)
    }

    // MARK: - Visual verification

    /// Navigates landing → lobby and saves screenshots to ios/screenshots/.
    @MainActor
    func testVisualScreenshots() throws {
        try FileManager.default.createDirectory(atPath: screenshotDir, withIntermediateDirectories: true)
        app.launch()

        // ── Landing ──────────────────────────────────────────────────
        sleep(6) // let app fully settle

        // Dump the accessibility tree for debugging
        let treeFile = "\(screenshotDir)/accessibility_tree.txt"
        try? app.debugDescription.write(toFile: treeFile, atomically: true, encoding: .utf8)

        // Find the name TextField by placeholder (ZStack identifier propagation means
        // .accessibilityIdentifier on children isn't visible via identifier queries)
        let nameField = app.textFields.matching(
            NSPredicate(format: "placeholderValue == 'Your nickname or team name'")
        ).firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 12), "Landing screen did not appear")
        save(screenshot: "01_landing")

        nameField.tap()
        nameField.typeText("Tim")

        let createBtn = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Create'")
        ).firstMatch
        let enabled = NSPredicate(format: "isEnabled == true")
        expectation(for: enabled, evaluatedWith: createBtn)
        waitForExpectations(timeout: 10)
        save(screenshot: "02_landing_ready")

        createBtn.tap()

        // ── Lobby ─────────────────────────────────────────────────────
        // Wait for the "Start Game" button to appear (it's on the lobby screen)
        let startBtn = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Start'")
        ).firstMatch
        XCTAssertTrue(startBtn.waitForExistence(timeout: 12), "Lobby screen did not appear")
        save(screenshot: "03_lobby")

        sleep(2)
        save(screenshot: "04_lobby_settled")
    }

    // MARK: - Gameplay visual verification

    /// Creates a game, joins a bot as the second player, starts the game,
    /// and saves screenshots of the gameplay view. Requires the local backend on port 3001.
    @MainActor
    func testGameplayScreenshot() throws {
        app.launch()

        // ── Landing → Lobby ───────────────────────────────────────────────
        let nameField = app.textFields.matching(
            NSPredicate(format: "placeholderValue == 'Your nickname or team name'")
        ).firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 10), "Landing screen did not appear")
        nameField.tap()
        nameField.typeText("Tim")

        let createBtn = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Create'")
        ).firstMatch
        expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: createBtn)
        waitForExpectations(timeout: 10)
        createBtn.tap()

        let startBtn = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Start'")
        ).firstMatch
        XCTAssertTrue(startBtn.waitForExistence(timeout: 12), "Lobby did not appear")

        // ── Read room code (4-digit number like "5081") ───────────────────
        let allLabels = app.staticTexts.allElementsBoundByIndex.map(\.label)
        let roomCode = allLabels.first { $0.count == 4 && $0.allSatisfy(\.isNumber) } ?? ""
        XCTAssertFalse(roomCode.isEmpty, "Could not find 4-digit room code in labels: \(allLabels)")

        // ── Launch bot as second player via posix_spawn ───────────────────
        let nodePath = "/Users/tim/.nvm/versions/node/v20.18.1/bin/node"
        let scriptPath = "/Users/tim/Game/backend/_bot.mjs"
        let nodeStr   = strdup(nodePath)
        let scriptStr = strdup(scriptPath)
        let codeStr   = strdup(roomCode)
        let botName   = strdup("Bot")
        defer { free(nodeStr); free(scriptStr); free(codeStr); free(botName) }
        var argv: [UnsafeMutablePointer<CChar>?] = [nodeStr, scriptStr, codeStr, botName, nil]
        var botPid: pid_t = 0
        posix_spawn(&botPid, nodeStr, nil, nil, &argv, nil)

        // ── Wait for bot to join → Start becomes enabled ──────────────────
        expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: startBtn)
        waitForExpectations(timeout: 15)
        save(screenshot: "05_lobby_with_bot")

        startBtn.tap()

        // ── Game view ─────────────────────────────────────────────────────
        sleep(4) // let game initialise and timeline animate in
        save(screenshot: "06_game_start")

        sleep(3)
        save(screenshot: "07_game_settled")

        // Clean up bot process
        if botPid > 0 { kill(botPid, SIGTERM) }
    }

    // MARK: - Helper

    private func save(screenshot name: String) {
        let shot = XCUIScreen.main.screenshot()
        let url = URL(fileURLWithPath: "\(screenshotDir)/\(name).png")
        try? shot.pngRepresentation.write(to: url)
    }

    // MARK: - Functional tests

    @MainActor
    func testCreateGameShowsLobby() throws {
        app.launch()

        let nameField = app.textFields.matching(
            NSPredicate(format: "placeholderValue == 'Your nickname or team name'")
        ).firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 10))
        nameField.tap()
        nameField.typeText("Alice UI")

        let createButton = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Create'")
        ).firstMatch
        let enabledPredicate = NSPredicate(format: "isEnabled == true")
        expectation(for: enabledPredicate, evaluatedWith: createButton)
        waitForExpectations(timeout: 10)

        createButton.tap()

        try waitForLobby(afterTapping: createButton)

        let roomCode = app.staticTexts["lobby.roomCodeValue"]
        if roomCode.exists {
            XCTAssertEqual(roomCode.label.count, 4, "Expected a four-character room code.")
        } else {
            // fallback: find any 4-char text that looks like a room code (uppercase letters)
            let allTexts = app.staticTexts.allElementsBoundByIndex.map(\.label)
            let codeText = allTexts.first { $0.count == 4 && $0 == $0.uppercased() && $0.allSatisfy(\.isLetter) }
            XCTAssertNotNil(codeText, "Expected a four-character room code, got: \(allTexts)")
        }

        let startButton = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Start'")
        ).firstMatch
        XCTAssertTrue(startButton.waitForExistence(timeout: 5))
        XCTAssertFalse(startButton.isEnabled, "Start should stay disabled until a second player joins.")
    }

    @MainActor
    func testJoinGameOpensJoinSheet() throws {
        app.launch()

        let nameField = app.textFields.matching(
            NSPredicate(format: "placeholderValue == 'Your nickname or team name'")
        ).firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 10))
        nameField.tap()
        nameField.typeText("Bob UI")

        let joinButton = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Join'")
        ).firstMatch
        let enabledPredicate = NSPredicate(format: "isEnabled == true")
        expectation(for: enabledPredicate, evaluatedWith: joinButton)
        waitForExpectations(timeout: 10)

        joinButton.tap()

        // After tapping Join, a compact sheet appears with just the room code boxes —
        // it auto-submits on the 4th digit, so there is no name field or Join button
        // (the name was entered on the landing page).
        let sheetTitle = app.staticTexts.matching(
            NSPredicate(format: "label == 'Join a Game'")
        ).firstMatch
        if !sheetTitle.waitForExistence(timeout: 10) {
            // Dump tree to diagnose what's visible
            let tree = app.debugDescription
            try? tree.write(toFile: "/tmp/join_failure_tree.txt", atomically: true, encoding: .utf8)
            let shot = XCUIScreen.main.screenshot()
            try? shot.pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/join_failure.png"))
        }
        XCTAssertTrue(sheetTitle.exists, "Join sheet did not appear")
        XCTAssertFalse(
            app.buttons.matching(NSPredicate(format: "label == 'Join'")).firstMatch.exists,
            "Normal-flow join sheet should have no Join button (auto-submits on 4th digit)"
        )

        // The code field auto-focuses → keyboard appears. With a fixed-height sheet the
        // risk is the keyboard covering the code boxes; assert the "Room Code" label
        // (just above the boxes) stays hittable, i.e. the sheet floats above the keyboard.
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3), "Keyboard should appear")
        let roomCodeLabel = app.staticTexts.matching(NSPredicate(format: "label == 'Room Code'")).firstMatch
        XCTAssertTrue(roomCodeLabel.isHittable, "Code boxes must not be hidden behind the keyboard")

        sleep(2) // let the sheet settle and the numeric keyboard appear
        save(screenshot: "08_join_sheet")
    }

    @MainActor
    private func waitForLobby(afterTapping _: XCUIElement) throws {
        let startButton = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Start'")
        ).firstMatch
        if startButton.waitForExistence(timeout: 10) {
            return
        }

        if app.alerts["Error"].waitForExistence(timeout: 1) {
            let alert = app.alerts["Error"]
            let message = alert.staticTexts.allElementsBoundByIndex
                .map(\.label)
                .filter { !$0.isEmpty && $0 != "Error" }
                .joined(separator: " | ")
            XCTFail("Create Game showed an error alert instead of the lobby: \(message)")
            return
        }

        XCTFail("""
        Create Game did not reach the lobby.
        Current screen dump:
        \(app.debugDescription)
        """)
    }
}
