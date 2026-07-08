import SwiftUI

/// Compact popup shown when a player taps a revealed album-art node on the
/// timeline. Doubles as the "Listen on Apple Music" affordance (attribution +
/// link) and a convenience for players who missed the song's title/year.
struct SongDetailView: View {
    let song: Song

    var body: some View {
        VStack(spacing: 16) {
            ArtworkImage(urlString: song.albumArt)
                .frame(width: 180, height: 180)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color.white.opacity(0.15), lineWidth: 1))
                .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
                .padding(.top, 28)

            VStack(spacing: 4) {
                Text(song.title)
                    .font(.system(.title3, design: .rounded).weight(.bold))
                    .foregroundStyle(Color.beatText)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text(song.artist)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatText.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
            }
            .padding(.horizontal, 24)

            Text(String(song.year))
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(Color.beatTeal)

            Spacer(minLength: 0)

            if let urlString = song.appleMusicURL, let url = URL(string: urlString) {
                Link(destination: url) {
                    Image("ListenOnAppleMusic")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 46)
                        .accessibilityLabel("Listen on Apple Music")
                }
                .padding(.bottom, 28)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
