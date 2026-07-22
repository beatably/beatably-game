import SwiftUI

struct HowToPlayView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
        ZStack {
            Color.beatBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(sections) { section in
                        VStack(alignment: .leading, spacing: 10) {
                            Label(section.title, systemImage: section.icon)
                                .font(.system(.headline, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.beatTeal)

                            ForEach(section.items, id: \.self) { item in
                                HStack(alignment: .top, spacing: 10) {
                                    Circle()
                                        .fill(Color.beatTeal.opacity(0.5))
                                        .frame(width: 5, height: 5)
                                        .padding(.top, 7)
                                    Text(item)
                                        .font(.system(.subheadline, design: .rounded))
                                        .foregroundStyle(Color.beatText)
                                }
                            }
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.beatSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.beatBorder, lineWidth: 1))
                    }

                    // Apple Music attribution — previews and album art come from the
                    // Apple Music catalog (MusicKit); shown as the content source for
                    // App Review and per MusicKit attribution guidance.
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Music", systemImage: "music.note.list")
                            .font(.system(.headline, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.beatTeal)
                        Text("Song previews and album artwork are provided by Apple Music.")
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(Color.beatText)
                        Link(destination: URL(string: "https://music.apple.com")!) {
                            Image("ListenOnAppleMusic")
                                .resizable()
                                .scaledToFit()
                                .frame(height: 44)
                                .accessibilityLabel("Listen on Apple Music")
                        }
                        .padding(.top, 2)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.beatSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.beatBorder, lineWidth: 1))

                    Text(Self.versionString)
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(Color.beatMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 4)
                }
                .padding(16)
                .padding(.top, 8)
            }
            .defaultScrollAnchor(
                ProcessInfo.processInfo.arguments.contains("UITEST_SHOW_HOWTOPLAY") ? .bottom : .top
            )
        }
        .navigationTitle("How to Play")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.beatBg, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
                    .foregroundStyle(Color.beatTeal)
            }
        }
        } // NavigationStack
    }

    // "Version 1.0 (254)" — read live from the bundle so it always reflects the
    // shipped build (MARKETING_VERSION) and git-stamped build number (CFBundleVersion).
    private static var versionString: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "Version \(version) (\(build))"
    }

    private struct Section: Identifiable {
        let id = UUID()
        let title: String
        let icon: String
        let items: [String]
    }

    private let sections: [Section] = [
        Section(title: "Goal", icon: "trophy", items: [
            "Be the first player to correctly place the target number of songs on your timeline.",
            "The default target is 10 songs. The host can change it in settings."
        ]),
        Section(title: "On Your Turn", icon: "music.note", items: [
            "A song plays (30-second preview). Listen and figure out what year it's from.",
            "Tap a gap on your timeline to place the song where you think it fits chronologically.",
            "After placing, you'll see if you were right and what year the song is actually from.",
            "Correct placement adds the song to your timeline — wrong placement does not."
        ]),
        Section(title: "Guess the Song", icon: "text.bubble", items: [
            "After placing a card, you can guess the song's title and artist for a bonus credit.",
            "You can also skip the guess if you don't know it."
        ]),
        Section(title: "Credits", icon: "circle.fill", items: [
            "Credits are the in-game currency shown as coins under your score.",
            "Earn credits by correctly guessing the song title and artist.",
            "Spend 1 credit to skip a song you don't want to place.",
            "Spend 1 credit to challenge another player's placement."
        ]),
        Section(title: "Challenges", icon: "bolt", items: [
            "After any player places a card, a short challenge window opens.",
            "Spend 1 credit to challenge the placement — you'll place the same card where YOU think it goes.",
            "If the challenger is right and the original player was wrong, the challenger steals the card.",
            "If the original player was right, they keep the card. If both are wrong, the card is discarded.",
            "You cannot challenge your own placement."
        ]),
        Section(title: "Solo Mode", icon: "flame", items: [
            "Playing on your own? Every run becomes a survival streak.",
            "Songs come one at a time and get harder as your streak grows.",
            "Keep placing correctly to extend your streak — your first wrong placement ends the run.",
            "Your score is your streak: how many songs you placed in the right spot.",
            "No challenges in solo, but credits still work — guess a song for a bonus, or spend one to skip.",
            "Beat your best and climb the global Top 10 leaderboard."
        ]),
        Section(title: "Tips", icon: "lightbulb", items: [
            "Save credits for challenges — stealing a card is more powerful than earning one.",
            "Easy mode uses chart hits. Advanced mode opens the full catalog across all genres.",
            "The host controls the music. Everyone hears it from one device."
        ])
    ]
}
