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
