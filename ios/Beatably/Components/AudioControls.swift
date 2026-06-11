import SwiftUI

struct AudioControls: View {
    private let audio = AudioPlayer.shared

    var body: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(.systemFill))
                        .frame(height: 4)
                    let progress = audio.duration > 0 ? min(audio.currentTime / audio.duration, 1) : 0
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.accentColor)
                        .frame(width: geo.size.width * progress, height: 4)
                }
            }
            .frame(height: 4)

            HStack {
                Text(formatTime(audio.currentTime))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)

                Spacer()

                Button {
                    if audio.isPlaying {
                        audio.pause()
                    } else {
                        // First press after load: startLoaded(); subsequent presses: resume()
                        audio.currentTime == 0 ? audio.startLoaded() : audio.resume()
                    }
                } label: {
                    Image(systemName: audio.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(Color.accentColor)
                }

                Spacer()

                Text(formatTime(audio.duration))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 20)
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite && !seconds.isNaN && seconds >= 0 else { return "0:00" }
        let s = Int(seconds)
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }
}
