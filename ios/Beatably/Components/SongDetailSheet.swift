import SwiftUI

/// Shared close-cross header for the bottom-sheet cards (song detail, guess).
/// Keeps dismissal consistent across sheets.
struct SheetCloseHeader: View {
    let onClose: () -> Void
    var body: some View {
        HStack {
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.beatMuted)
                    .padding(9)
                    .background(Circle().fill(Color.beatSurface2))
            }
            .buttonStyle(PressScaleStyle(haptic: .light))
        }
        .padding(.top, 14)
        .padding(.horizontal, 18)
    }
}

/// Bottom-sheet card shown when a player taps a revealed album-art node on the
/// timeline. Doubles as the "Listen on Apple Music" attribution/link, and lets
/// players look up a title/year they missed.
struct SongDetailSheet: View {
    let song: Song
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            SheetCloseHeader(onClose: onClose)

            ArtworkImage(urlString: song.albumArt)
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
            }

            Spacer(minLength: 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 12)
    }
}
