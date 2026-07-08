import SwiftUI

/// Content of the song detail card (wrapped by BottomCard). Shown when a player
/// taps a revealed album-art node. Doubles as the "Listen on Apple Music"
/// attribution/link, and lets players look up a title/year they missed.
struct SongDetailSheet: View {
    let song: Song

    // Apple artwork URLs end in /{W}x{H}bb.jpg — request a larger render for the
    // enlarged card so it isn't upscaled/blurry, regardless of the stored size.
    private var highResArt: String? {
        song.albumArt?.replacingOccurrences(
            of: #"/\d+x\d+bb\.jpg$"#,
            with: "/1200x1200bb.jpg",
            options: .regularExpression
        )
    }

    var body: some View {
        VStack(spacing: 16) {
            ArtworkImage(urlString: highResArt)
                .frame(width: 176, height: 176)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color.white.opacity(0.15), lineWidth: 1))
                .shadow(color: .black.opacity(0.4), radius: 12, y: 6)

            VStack(spacing: 4) {
                Text(song.title)
                    .font(.system(.title3, design: .rounded).weight(.bold))
                    .foregroundStyle(Color.beatText)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text(song.artist)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
            }
            .padding(.horizontal, 24)

            Text(String(song.year))
                .font(.system(size: 38, weight: .bold, design: .rounded))
                .foregroundStyle(Color.beatTeal)

            if let urlString = song.appleMusicURL, let url = URL(string: urlString) {
                Link(destination: url) {
                    Image("ListenOnAppleMusic")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 46)
                        .accessibilityLabel("Listen on Apple Music")
                }
                .padding(.top, 2)
            }
        }
        .padding(.horizontal, 24)
    }
}
