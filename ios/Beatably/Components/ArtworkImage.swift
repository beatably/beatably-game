import SwiftUI

// In-memory album-art cache. Timeline node views are recreated constantly during
// layout recompute and the placement animation, so a plain AsyncImage would re-fetch
// (and flicker) on every rebuild. Caching decoded images keeps nodes stable.
enum ArtworkCache {
    static let images = NSCache<NSString, UIImage>()
}

/// Album art for a timeline node. Renders a decoded image edge-to-edge (caller clips
/// the shape); falls back to a purple gradient + music-note glyph on nil/bad URL or
/// load failure. A cache hit renders synchronously so there's no pop-in on rebuild.
struct ArtworkImage: View {
    let urlString: String?

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image = image ?? cachedImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                LinearGradient(
                    colors: [Color.beatPurple, Color(hex: "5A2BA8")],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                .overlay(
                    Image(systemName: "music.note")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                )
            }
        }
        .task(id: urlString) { await load() }
    }

    private var cachedImage: UIImage? {
        guard let key = urlString as NSString? else { return nil }
        return ArtworkCache.images.object(forKey: key)
    }

    private func load() async {
        guard image == nil, cachedImage == nil,
              let s = urlString, let url = URL(string: s) else { return }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let img = UIImage(data: data) else { return }
        ArtworkCache.images.setObject(img, forKey: s as NSString)
        image = img
    }
}
