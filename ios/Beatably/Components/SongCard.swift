import SwiftUI

struct SongCard: View {
    let song: Song
    /// Whether to reveal title, artist, and album art (false during active gameplay)
    var showInfo: Bool = false
    /// Whether to reveal the year
    var showYear: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            // Album art — only on reveal
            if showInfo, let art = song.albumArt, let url = URL(string: art) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        Color(.tertiarySystemFill)
                    }
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            VStack(alignment: .leading, spacing: 4) {
                if showInfo {
                    Text(song.artist)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(song.title)
                        .font(.title3.bold())
                        .lineLimit(2)
                } else {
                    // Mystery state — title/artist hidden during active gameplay
                    Text("♪")
                        .font(.largeTitle)
                        .foregroundStyle(Color(.tertiaryLabel))
                }

                Text(showYear ? "\(song.year)" : "????")
                    .font(.title.bold())
                    .foregroundStyle(showYear ? Color.accentColor : Color(.tertiaryLabel))
                    .contentTransition(.numericText())
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(.secondarySystemBackground))
        )
    }
}
