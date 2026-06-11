import SwiftUI

struct TimelineView: View {
    let cards: [Song]
    let isInteractive: Bool
    /// Show all gaps non-interactively (challenge-window: reveals opponent's placement marker)
    var showGapsForContext: Bool = false
    var pendingIndex: Int? = nil
    var lastPlacedId: String? = nil
    var gamePhase: String = "player-turn"
    var disabledIndex: Int? = nil
    var disabledLabel: String? = nil
    /// Labels shown above year cards keyed by card ID (reveal + challenge-resolved)
    var cardLabels: [String: String] = [:]
    var placementResult: PlacementResult? = nil
    var challengeResult: ChallengeResult? = nil
    let onPlace: (Int) -> Void

    // Mirrors web: hide the just-placed card during adjudication phases so year isn't
    // visible and gap indices match what the backend recorded as originalIndex.
    private var displayCards: [Song] {
        TimelineView.filterDisplayCards(cards, lastPlacedId: lastPlacedId, gamePhase: gamePhase)
    }

    /// Extracted for unit testing — pure function, no SwiftUI dependency.
    static func filterDisplayCards(_ cards: [Song], lastPlacedId: String?, gamePhase: String) -> [Song] {
        let adjudicating = gamePhase == "song-guess"
            || gamePhase == "challenge-window"
            || gamePhase == "challenge"
        guard adjudicating, let lastId = lastPlacedId else { return cards }
        return cards.filter { $0.id != lastId }
    }

    // Card color state — mirrors web's getYearState
    private func cardColor(_ card: Song) -> CardColorState {
        // challenge-resolved: challenger/original cards show green/red
        if gamePhase == "challenge-resolved", let r = challengeResult {
            if card.challengerCard { return r.challengerCorrect ? .correct : .incorrect }
            if card.originalCard   { return r.originalCorrect  ? .correct : .incorrect }
        }
        // reveal: last-placed card shows green/red
        if gamePhase == "reveal", card.id == lastPlacedId, let r = placementResult {
            return r.correct ? .correct : .incorrect
        }
        return .normal
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                // Before-first gap
                let showGap0 = isInteractive || pendingIndex == 0
                    || (showGapsForContext && disabledIndex == 0)
                if showGap0 {
                    PlaceGap(index: 0,
                             disabled: disabledIndex == 0,
                             label: disabledIndex == 0 ? disabledLabel : nil,
                             selected: pendingIndex == 0,
                             onPlace: isInteractive ? onPlace : { _ in })
                }

                ForEach(Array(displayCards.enumerated()), id: \.element.id) { i, card in
                    TimelineCard(song: card,
                                 colorState: cardColor(card),
                                 label: cardLabels[card.id])

                    let idx = i + 1
                    let showGapN = isInteractive || pendingIndex == idx
                        || (showGapsForContext && disabledIndex == idx)
                    if showGapN {
                        PlaceGap(index: idx,
                                 disabled: disabledIndex == idx,
                                 label: disabledIndex == idx ? disabledLabel : nil,
                                 selected: pendingIndex == idx,
                                 onPlace: isInteractive ? onPlace : { _ in })
                    }
                }

                if displayCards.isEmpty && (isInteractive || showGapsForContext) {
                    Text("Tap a gap →")
                        .font(.caption).foregroundStyle(.tertiary).padding(.horizontal, 8)
                }
            }
            .padding(.horizontal, 16)
            .animation(.spring(duration: 0.3), value: cards.count)
        }
    }
}

// MARK: - Card color state

enum CardColorState { case normal, correct, incorrect }

// MARK: - PlaceGap

private struct PlaceGap: View {
    let index: Int
    var disabled: Bool = false
    var label: String? = nil
    var selected: Bool = false
    let onPlace: (Int) -> Void

    var body: some View {
        Button { onPlace(index) } label: {
            VStack(spacing: 2) {
                if let label {
                    Text(label)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                ZStack {
                    if selected {
                        Circle()
                            .fill(Color.accentColor.opacity(0.2))
                            .frame(width: 28, height: 28)
                    }
                    Image(systemName: disabled ? "minus.circle" :
                                      selected ? "checkmark.circle.fill" : "plus.circle.fill")
                        .font(.title3)
                        .foregroundStyle(disabled ? Color.secondary.opacity(0.4) : Color.accentColor)
                }
            }
            .frame(width: 36, height: 80)
        }
        .buttonStyle(.plain)
        .disabled(disabled || selected)
    }
}

// MARK: - TimelineCard

private struct TimelineCard: View {
    let song: Song
    var colorState: CardColorState = .normal
    var label: String? = nil

    private var bg: Color {
        switch colorState {
        case .normal:    return Color(.tertiarySystemFill)
        case .correct:   return Color.green
        case .incorrect: return Color.red
        }
    }

    var body: some View {
        VStack(spacing: 2) {
            if let label {
                Text(label)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                // Reserve space so cards with/without labels stay same height
                Text(" ").font(.system(size: 9))
            }
            Text("\(song.year)")
                .font(.caption.bold())
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(bg))
        }
        .padding(.horizontal, 4)
    }
}
