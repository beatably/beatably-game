import SwiftUI

// MARK: - Challenge Resolved Overlay (bottom slide-up panel)

struct ChallengeResolvedOverlay: View {
    @Environment(GameViewModel.self) private var vm
    @State private var continued = false

    private var result: ChallengeResult? { vm.challengeState?.result }

    private var title: String {
        guard let r = result else { return "Challenge resolved" }
        if r.challengeWon                            { return "\(vm.challengerName) won the challenge!" }
        if r.originalCorrect && !r.challengerCorrect { return "\(vm.currentPlayerName) defended!" }
        if r.challengerCorrect && r.originalCorrect  { return "Both correct — \(vm.currentPlayerName) keeps it" }
        return "Both wrong — card discarded"
    }

    private var subtitle: String {
        guard let r = result else { return "" }
        if r.challengeWon                            { return "\(vm.challengerName) placed it correctly and steals the card." }
        if r.originalCorrect && !r.challengerCorrect { return "The original placement was right. Challenge failed." }
        if r.challengerCorrect && r.originalCorrect  { return "Both placements were correct, but \(vm.currentPlayerName) went first." }
        return "Neither placement was correct."
    }

    private var icon: String {
        guard let r = result else { return "questionmark.circle" }
        if r.challengeWon    { return "trophy.fill" }
        if r.originalCorrect { return "shield.fill" }
        return "xmark.circle.fill"
    }

    private var iconColor: Color {
        guard let r = result else { return Color.beatMuted }
        if r.challengeWon    { return Color.beatMagenta }
        if r.originalCorrect { return Color.beatGreen }
        return Color.beatMagenta
    }

    var body: some View {
        VStack(spacing: 20) {
            // Outcome — centered, matching InlineRevealFooter
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    Spacer()
                    Image(systemName: icon)
                        .font(.system(size: 18))
                        .foregroundStyle(iconColor)
                        .shadow(color: iconColor.opacity(0.7), radius: 6)
                    Text(title)
                        .font(.system(.headline, design: .rounded).bold())
                        .foregroundStyle(Color.beatText)
                    Spacer()
                }
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(Color.beatMuted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
            }

            if let sg = vm.lastSongGuess {
                Text(sg.correct
                    ? "\(sg.playerName) guessed correctly — bonus credit!"
                    : "\(sg.playerName) guessed wrong — no credit")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(sg.correct ? Color.beatGreen : Color.beatMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            if vm.isCreator {
                Button {
                    continued = true
                    vm.continueGame()
                } label: {
                    BeatPrimaryLabel(title: "Continue to Next Turn", isLoading: continued)
                }
                .buttonStyle(PressScaleStyle())
                .disabled(continued)
            } else {
                Text("Waiting for host to continue…")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(Color.beatMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .onAppear {
            SoundManager.shared.play(.correct)
            SoundManager.shared.notification(.success)
            // A correct song guess earns the placer a bonus credit — fly a coin into their card.
            if vm.lastSongGuess?.correct == true {
                vm.creditAwardTrigger += 1
            }
        }
    }
}
