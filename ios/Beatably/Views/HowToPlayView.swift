import SwiftUI

struct HowToPlayView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    ForEach(sections) { section in
                        VStack(alignment: .leading, spacing: 12) {
                            Label(section.title, systemImage: section.icon)
                                .font(.headline)
                                .foregroundStyle(Color.accentColor)

                            ForEach(section.items, id: \.self) { item in
                                HStack(alignment: .top, spacing: 10) {
                                    Circle()
                                        .fill(Color.accentColor.opacity(0.3))
                                        .frame(width: 6, height: 6)
                                        .padding(.top, 6)
                                    Text(item)
                                        .font(.subheadline)
                                        .foregroundStyle(.primary)
                                }
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding()
            }
            .navigationTitle("How to Play")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private struct Section: Identifiable {
        let id = UUID()
        let title: String
        let icon: String
        let items: [String]
    }

    private let sections: [Section] = [
        Section(
            title: "Goal",
            icon: "trophy",
            items: [
                "Be the first player to correctly place the target number of songs on your timeline.",
                "The default target is 10 songs. The host can change it in settings."
            ]
        ),
        Section(
            title: "On Your Turn",
            icon: "music.note",
            items: [
                "A song plays (30-second preview). Listen and figure out what year it's from.",
                "Tap a gap on your timeline to place the song where you think it fits chronologically.",
                "After placing, you'll see if you were right and what year the song is actually from.",
                "Correct placement adds the song to your timeline — wrong placement does not."
            ]
        ),
        Section(
            title: "Guess the Song",
            icon: "text.bubble",
            items: [
                "After placing a card, you can guess the song's title and artist for a bonus credit.",
                "You can also skip the guess if you don't know it."
            ]
        ),
        Section(
            title: "Credits",
            icon: "circle.fill",
            items: [
                "Credits are the in-game currency shown as dots under your score.",
                "Earn credits by correctly guessing the song title and artist.",
                "Spend 1 credit to skip a song you don't want to place.",
                "Spend 1 credit to challenge another player's placement."
            ]
        ),
        Section(
            title: "Challenges",
            icon: "bolt",
            items: [
                "After any player places a card, a short challenge window opens.",
                "Spend 1 credit to challenge the placement — you'll place the same card where YOU think it goes.",
                "If the challenger is right and the original player was wrong, the challenger steals the card.",
                "If the original player was right, they keep the card. If both are wrong, the card is discarded.",
                "You cannot challenge your own placement."
            ]
        ),
        Section(
            title: "Tips",
            icon: "lightbulb",
            items: [
                "Save credits for challenges — stealing a card is more powerful than earning one.",
                "Easy mode uses chart hits. Advanced mode opens the full catalog across all genres.",
                "The host controls the music. Everyone hears it from one device."
            ]
        )
    ]
}
