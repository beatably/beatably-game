import SwiftUI
import AVFoundation

// Looping video player for the landing background.
// Uses AVQueuePlayer + AVPlayerLooper for gapless looping.
struct VideoBackground: UIViewRepresentable {
    let resource: String
    var ext: String = "mp4"

    func makeUIView(context: Context) -> LoopingVideoView {
        LoopingVideoView(resource: resource, ext: ext)
    }

    func updateUIView(_ uiView: LoopingVideoView, context: Context) {}
}

final class LoopingVideoView: UIView {
    private let player: AVQueuePlayer
    private var looper: AVPlayerLooper?
    private let layer_: AVPlayerLayer

    init(resource: String, ext: String) {
        player = AVQueuePlayer()
        layer_ = AVPlayerLayer(player: player)
        super.init(frame: .zero)
        backgroundColor = UIColor(Color.beatBg)
        layer.addSublayer(layer_)
        layer_.videoGravity = .resizeAspectFill

        guard let url = Bundle.main.url(forResource: resource, withExtension: ext) else { return }
        let item = AVPlayerItem(url: url)
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.isMuted = true
        player.play()
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer_.frame = bounds
    }
}
