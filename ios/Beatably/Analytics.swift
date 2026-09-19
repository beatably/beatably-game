import Foundation

/// Fire-and-forget product analytics for the app.
///
/// Deliberately minimal: it posts a named event to the same `/api/track`
/// endpoint the web client uses, and sends **no device identifier**. The app
/// has no consent prompt yet, so nothing here reads or writes anything on the
/// device — these are anonymous counts of an action, not a profile.
enum Analytics {

    /// Record that the player tapped a share button. `placement` says which one.
    static func share(_ placement: String) {
        send(event: "share", target: placement)
    }

    private static func send(event: String, target: String) {
        guard let url = URL(string: Config.backendURL + "/api/track") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "event": event,
            "target": target,
            "site": "game",
            "path": "/ios",
        ])

        // No completion handling: analytics must never affect the player.
        URLSession.shared.dataTask(with: request).resume()
    }
}

/// Wording for the share sheet. Kept in step with frontend/src/utils/share.js.
///
/// The URL is folded into the text rather than shared as a separate item:
/// hand the sheet a URL and most targets show only the link and drop the
/// message, which is how the score went missing.
enum ShareText {
    static let url = "https://beatably.app"

    /// A bad run still deserves a shareable line, so a zero becomes a dare
    /// rather than a boast, and the rank is only named when it is worth naming.
    static func solo(score: Int, rank: Int?) -> String {
        let body: String
        if score <= 0 {
            body = "I got zero songs right on Beatably 🎵 Surely you can do better?"
        } else if score == 1 {
            body = "I managed exactly 1 song on Beatably 🎵 Think you can beat me?"
        } else {
            let place = (rank.map { $0 <= 10 } ?? false) ? " I'm #\(rank!) in the world right now." : ""
            body = "I placed \(score) songs in a row on Beatably 🎵\(place) Think you can beat me?"
        }
        return "\(body)\n\n\(url)"
    }

    static func multiplayer(iWon: Bool, winnerName: String?, score: Int?) -> String {
        let body: String
        if iWon {
            let detail = score.map { " \($0) songs in the right order." } ?? ""
            body = "I just won a game of Beatably 🏆\(detail) Think you can beat me?"
        } else if let name = winnerName, !name.isEmpty {
            body = "\(name) just won our game of Beatably 🎵 Can you do better?"
        } else {
            body = "We just played Beatably 🎵 Can you do better?"
        }
        return "\(body)\n\n\(url)"
    }

    static let invite = "Beatably — hear it, place it, steal it. The music timeline party game.\n\n\(url)"
}
