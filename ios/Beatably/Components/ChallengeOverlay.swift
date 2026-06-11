import SwiftUI

// MARK: - Challenge Window Panel
// Shown during "challenge-window" phase. Non-active players choose to challenge or pass.

struct ChallengeWindowPanel: View {
    @Environment(GameViewModel.self) private var vm
    @State private var hasResponded = false

    var body: some View {
        VStack {
            Spacer()

            VStack(spacing: 16) {
                if vm.isMyTurn {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Waiting — others can challenge")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                } else if hasResponded {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Waiting for other players…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    VStack(spacing: 8) {
                        Text("Challenge the placement?")
                            .font(.headline)

                        Text("Spend 1 credit to place the card yourself. If you're right and \(vm.currentPlayerName) is wrong, you steal the card!")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    if vm.canChallenge {
                        HStack(spacing: 12) {
                            Button("Pass") {
                                hasResponded = true
                                vm.skipChallenge()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.large)

                            Button("Challenge · 1 credit") {
                                hasResponded = true
                                vm.initiateChallenge()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .tint(.orange)
                        }
                    } else {
                        VStack(spacing: 8) {
                            Text("No credits to challenge")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Button("Pass") {
                                hasResponded = true
                                vm.skipChallenge()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.15), radius: 16, y: -4)
            )
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
        .ignoresSafeArea(edges: .bottom)
    }
}

// MARK: - Challenge Resolved Overlay
// Shown during "challenge-resolved" phase with the outcome.

struct ChallengeResolvedOverlay: View {
    @Environment(GameViewModel.self) private var vm
    @State private var continued = false

    private var result: ChallengeResult? { vm.challengeState?.result }

    private var title: String {
        guard let r = result else { return "Challenge resolved" }
        if r.challengeWon {
            return "\(vm.challengerName) won the challenge!"
        } else if r.originalCorrect && !r.challengerCorrect {
            return "\(vm.currentPlayerName) defended!"
        } else if r.challengerCorrect && r.originalCorrect {
            return "Both correct — \(vm.currentPlayerName) keeps it"
        } else {
            return "Both wrong — card discarded"
        }
    }

    private var subtitle: String {
        guard let r = result else { return "" }
        if r.challengeWon {
            return "\(vm.challengerName) placed it correctly and steals the card."
        } else if r.originalCorrect && !r.challengerCorrect {
            return "The original placement was right. \(vm.challengerName)'s challenge failed."
        } else if r.challengerCorrect && r.originalCorrect {
            return "Both placements were correct, but \(vm.currentPlayerName) went first."
        } else {
            return "Neither placement was correct."
        }
    }

    private var icon: String {
        guard let r = result else { return "questionmark.circle" }
        if r.challengeWon { return "trophy.fill" }
        if r.originalCorrect { return "shield.fill" }
        return "xmark.circle.fill"
    }

    private var iconColor: Color {
        guard let r = result else { return .gray }
        if r.challengeWon { return .orange }
        if r.originalCorrect { return .green }
        return .red
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: icon)
                    .font(.system(size: 60))
                    .foregroundStyle(iconColor)

                VStack(spacing: 6) {
                    Text(title)
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }

                // Song guess result (if someone guessed during the round)
                if let sg = vm.lastSongGuess {
                    let guessText = sg.correct
                        ? "\(sg.playerName) guessed correctly — bonus credit earned!"
                        : "\(sg.playerName) guessed \(sg.guessTitle) / \(sg.guessArtist) — wrong, no credit"
                    Text(guessText)
                        .font(.caption)
                        .foregroundStyle(sg.correct ? Color.green : Color.secondary)
                        .multilineTextAlignment(.center)
                }

                if vm.isCreator {
                    Button("Continue to Next Turn") {
                        continued = true
                        vm.continueGame()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(continued)
                    .padding(.top, 4)
                } else {
                    Text("Waiting for host to continue…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                }
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.2), radius: 20)
            )
            .padding(.horizontal, 32)
        }
    }
}
