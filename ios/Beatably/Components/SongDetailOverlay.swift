import SwiftUI

/// Song detail card shown when a player taps a revealed album-art node on the
/// timeline. Uses the same branded card treatment as SongGuessOverlay (dimmed
/// backdrop + beatSurface card with gradient border and glow) for consistency.
/// Doubles as the "Listen on Apple Music" attribution/link, and lets players
/// look up a title/year they missed.
struct SongDetailOverlay: View {
    let song: Song
    let onClose: () -> Void

    var body: some View {
        ZStack {
            // Dimmed backdrop — tap anywhere outside the card to dismiss.
            Color.beatBg.opacity(0.88)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { onClose() }

            VStack(spacing: 16) {
                ArtworkImage(urlString: song.albumArt)
                    .frame(width: 168, height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(Color.white.opacity(0.15), lineWidth: 1))
                    .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
                    .padding(.top, 4)

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
            .padding(28)
            .background(
                RoundedRectangle(cornerRadius: 24)
                    .fill(Color.beatSurface)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .strokeBorder(
                                LinearGradient(
                                    colors: [Color.beatPurple.opacity(0.5), Color.beatCyan.opacity(0.2)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
                    .shadow(color: Color.beatPurple.opacity(0.3), radius: 24)
            )
            // Close cross — explicit dismiss (backdrop tap also dismisses).
            .overlay(alignment: .topTrailing) {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.beatMuted)
                        .padding(10)
                        .background(Circle().fill(Color.beatBg.opacity(0.6)))
                }
                .buttonStyle(PressScaleStyle(haptic: .light))
                .padding(12)
            }
            .padding(.horizontal, 40)
        }
    }
}
