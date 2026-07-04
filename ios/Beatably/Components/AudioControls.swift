import SwiftUI

struct AudioControls: View {
    private let audio = AudioPlayer.shared
    @State private var pulseGlow = false

    var body: some View {
        HStack(spacing: 10) {
            // Restart button — small, teal icon, surface background
            Button {
                audio.seek(to: 0)
                if !audio.isPlaying { audio.startLoaded() }
            } label: {
                ZStack {
                    Circle().fill(Color.beatSurface2)
                    Circle().strokeBorder(Color.beatBorder, lineWidth: 1)
                    Image(systemName: "backward.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.beatTeal)
                        .offset(x: -0.5)
                }
                .frame(width: 32, height: 32)
            }
            .buttonStyle(PressScaleStyle(haptic: .light))

            // Play/pause — fixed 46pt frame so the pulse ring never shifts layout
            ZStack {
                Circle()
                    .strokeBorder(Color.beatTeal.opacity(audio.isPlaying ? 0 : (pulseGlow ? 0.0 : 0.35)), lineWidth: 5)
                    .scaleEffect((!audio.isPlaying && pulseGlow) ? 1.35 : 1.0)
                    .animation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true), value: pulseGlow)
                Button {
                    if audio.isPlaying { audio.pause() }
                    else { audio.currentTime == 0 ? audio.startLoaded() : audio.resume() }
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color.beatTeal)
                            .frame(width: 38, height: 38)
                            .shadow(color: Color.beatTeal.opacity(0.6), radius: 8)
                        Image(systemName: audio.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .offset(x: audio.isPlaying ? 0 : 1.5)
                    }
                }
                .buttonStyle(PressScaleStyle(haptic: .light))
            }
            .frame(width: 46, height: 46)

            // Progress bar with inline time labels
            HStack(spacing: 6) {
                Text(formatTime(audio.currentTime))
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                    .frame(width: 28, alignment: .trailing)
                    .monospacedDigit()

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.beatBorder)
                            .frame(height: 9)
                        let pct = audio.duration > 0 ? min(audio.currentTime / audio.duration, 1) : 0
                        RoundedRectangle(cornerRadius: 4)
                            .fill(LinearGradient(
                                colors: [Color.beatTeal, Color.beatGradientPurple],
                                startPoint: .leading, endPoint: .trailing
                            ))
                            .frame(width: geo.size.width * pct, height: 9)
                            .shadow(color: Color.beatTeal.opacity(0.6), radius: 4)
                    }
                }
                .frame(height: 9)

                Text(formatTime(audio.duration))
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                    .frame(width: 28, alignment: .leading)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .onAppear { if !audio.isPlaying { pulseGlow = true } }
        .onChange(of: audio.isPlaying) { _, playing in
            withAnimation { pulseGlow = !playing }
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite && !seconds.isNaN && seconds >= 0 else { return "0:00" }
        let s = Int(seconds)
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }
}
