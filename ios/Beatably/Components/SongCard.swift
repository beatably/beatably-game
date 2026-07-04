import SwiftUI

struct SongCard: View {
    let song: Song
    var showInfo: Bool = false
    var showYear: Bool = false

    @State private var artLoaded = false

    var body: some View {
        HStack(spacing: 14) {
            // Album art (cross-fades in on reveal)
            if showInfo, let art = song.albumArt, let url = URL(string: art) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .opacity(artLoaded ? 1 : 0)
                            .onAppear {
                                withAnimation(.easeIn(duration: 0.35)) { artLoaded = true }
                            }
                    default:
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.beatSurface2)
                    }
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(Color.beatBorder, lineWidth: 1)
                )
                .shadow(color: Color.beatPurple.opacity(0.4), radius: 8)
            } else if showInfo {
                // No album art placeholder
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.beatSurface2)
                    .frame(width: 72, height: 72)
                    .overlay(
                        Image(systemName: "music.note")
                            .font(.title)
                            .foregroundStyle(Color.beatDim)
                    )
            }

            VStack(alignment: .leading, spacing: 5) {
                if showInfo {
                    Text(song.artist)
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(Color.beatMuted)
                        .lineLimit(1)
                    Text(song.title)
                        .font(.system(.title3, design: .rounded).bold())
                        .foregroundStyle(Color.beatText)
                        .lineLimit(2)
                } else {
                    // Mystery state
                    Text("♪")
                        .font(.largeTitle)
                        .foregroundStyle(Color.beatDim)
                        .shadow(color: Color.beatPurple.opacity(0.5), radius: 8)
                }

                Text(verbatim: showYear ? String(song.year) : "????")
                    .font(.system(.title, design: .rounded).bold())
                    .foregroundStyle(showYear ? Color.beatGreen : Color.beatDim)
                    .contentTransition(.numericText())
                    .shadow(color: showYear ? Color.beatGreen.opacity(0.5) : .clear, radius: 6)
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.beatSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(
                            LinearGradient(
                                colors: [Color.beatPurple.opacity(0.6), Color.beatCyan.opacity(0.3)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
        )
        .shadow(color: Color.beatPurple.opacity(0.2), radius: 10, y: 4)
    }
}
