import AVFoundation

@Observable
final class AudioPlayer {
    static let shared = AudioPlayer()

    var isPlaying = false
    var currentTime: Double = 0
    var duration: Double = 0
    // URL loaded but not yet started — play() will use this if called with no url argument
    private(set) var pendingURL: String? = nil

    @ObservationIgnored private var player: AVPlayer?
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var endObserver: Any?
    @ObservationIgnored private var statusObserver: NSKeyValueObservation?
    // Fade the preview out over its final seconds (mirrors the web client).
    @ObservationIgnored private let fadeOutSeconds: Double = 5

    private init() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[Audio] Session setup failed: \(error)")
        }
    }

    // Load and immediately start playing
    func play(url: String) {
        guard let u = URL(string: url) else { return }
        teardown()
        pendingURL = url

        let item = AVPlayerItem(url: u)
        let newPlayer = AVPlayer(playerItem: item)
        player = newPlayer

        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .readyToPlay else { return }
            DispatchQueue.main.async {
                let d = item.duration.seconds
                self?.duration = d.isFinite ? d : 0
            }
        }

        timeObserver = newPlayer.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            let t = time.seconds
            if t.isFinite {
                self.currentTime = t
                self.applyFade(at: t)
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
            self?.currentTime = 0
        }

        newPlayer.play()
        isPlaying = true
        currentTime = 0
        duration = 0
    }

    // Load but do NOT start playing — user must press play
    func load(url: String) {
        guard let u = URL(string: url) else { return }
        teardown()
        pendingURL = url

        let item = AVPlayerItem(url: u)
        let newPlayer = AVPlayer(playerItem: item)
        player = newPlayer

        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .readyToPlay else { return }
            DispatchQueue.main.async {
                let d = item.duration.seconds
                self?.duration = d.isFinite ? d : 0
            }
        }

        timeObserver = newPlayer.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            let t = time.seconds
            if t.isFinite {
                self.currentTime = t
                self.applyFade(at: t)
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
            self?.currentTime = 0
        }

        // Don't call play() — wait for user input
        isPlaying = false
        currentTime = 0
        duration = 0
    }

    // Start playing whatever is loaded
    func startLoaded() {
        player?.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func resume() {
        player?.play()
        isPlaying = true
    }

    func seek(to time: Double) {
        player?.seek(to: CMTime(seconds: time, preferredTimescale: 600))
    }

    func stop() {
        teardown()
        isPlaying = false
        currentTime = 0
        duration = 0
        pendingURL = nil
    }

    // Ramp volume down over the last `fadeOutSeconds` so the clip doesn't cut
    // off abruptly. Full volume otherwise.
    private func applyFade(at t: Double) {
        guard let p = player, duration > 0 else { return }
        let remaining = duration - t
        p.volume = remaining < fadeOutSeconds ? Float(max(0, remaining / fadeOutSeconds)) : 1.0
    }

    private func teardown() {
        if let observer = timeObserver { player?.removeTimeObserver(observer) }
        if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
        statusObserver = nil
        timeObserver = nil
        endObserver = nil
        player?.pause()
        player = nil
    }
}
