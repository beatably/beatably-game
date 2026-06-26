import SwiftUI

struct TimelineView: View {
    let cards: [Song]
    let isInteractive: Bool
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

    // Mirrors web: hide the just-placed card during phases where its gap slot must
    // stay open for (re)placement, so gap indices match what the backend recorded
    // as originalIndex.
    private var displayCards: [Song] {
        TimelineView.filterDisplayCards(cards, lastPlacedId: lastPlacedId, gamePhase: gamePhase)
    }

    /// Extracted for unit testing — pure function, no SwiftUI dependency.
    ///
    /// Phase behavior (matches web CurvedTimeline):
    /// - `song-guess`: hide the placed card. It's the active player's own pending
    ///   placement; the board belongs to them and they're deciding whether to guess.
    ///   The backend still sends it as a preview, but web renders it greyed; we keep
    ///   it hidden here since there's no challenge decision to inform yet.
    /// - `challenge`: hide the placed card. The challenger RE-PLACES on this timeline,
    ///   so the placed slot must be an open gap. The backend keeps lastPlaced.index
    ///   aligned to the committed (placed-card-removed) timeline, so filtering keeps
    ///   gap indices matching originalIndex.
    /// - `challenge-window`: SHOW the placed card. The challenger is only DECIDING
    ///   whether to challenge and must see where the active player placed it. The
    ///   backend inserts it into the broadcast timeline at lastPlaced.index flagged
    ///   { preview: true, challengeCard: true }; we render it as a mystery (year
    ///   hidden) outlined card so position is visible without revealing the answer.
    static func filterDisplayCards(_ cards: [Song], lastPlacedId: String?, gamePhase: String) -> [Song] {
        let hidesPlacedCard = gamePhase == "song-guess" || gamePhase == "challenge"
        guard hidesPlacedCard, let lastId = lastPlacedId else { return cards }
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
                if showGap0 {
                    PlaceGap(index: 0,
                             disabled: disabledIndex == 0,
                             label: disabledIndex == 0 ? disabledLabel : nil,
                             selected: pendingIndex == 0,
                             onPlace: isInteractive ? onPlace : { _ in })
                }

                ForEach(Array(displayCards.enumerated()), id: \.element.id) { i, card in
                    // During challenge-window the active player's placed card is shown
                    // as a mystery marker (year hidden, outlined) so the challenger sees
                    // WHERE it was placed without learning the answer. Matches web.
                    let isChallengeWindowMarker = gamePhase == "challenge-window"
                        && card.id == lastPlacedId
                    TimelineCard(song: card,
                                 colorState: cardColor(card),
                                 label: isChallengeWindowMarker ? (disabledLabel ?? cardLabels[card.id]) : cardLabels[card.id],
                                 hideYear: isChallengeWindowMarker,
                                 outlined: isChallengeWindowMarker)

                    let idx = i + 1
                    let showGapN = isInteractive || pendingIndex == idx
                    if showGapN {
                        PlaceGap(index: idx,
                                 disabled: disabledIndex == idx,
                                 label: disabledIndex == idx ? disabledLabel : nil,
                                 selected: pendingIndex == idx,
                                 onPlace: isInteractive ? onPlace : { _ in })
                    }
                }

                if displayCards.isEmpty && isInteractive {
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
    /// Hide the year (mystery state) — used for the challenge-window placement marker.
    var hideYear: Bool = false
    /// Draw an accent outline — distinguishes the challenge-window placement marker.
    var outlined: Bool = false

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
                    .foregroundStyle(outlined ? Color.accentColor : .secondary)
                    .lineLimit(1)
            } else {
                // Reserve space so cards with/without labels stay same height
                Text(" ").font(.system(size: 9))
            }
            Text(hideYear ? "?" : "\(song.year)")
                .font(.caption.bold())
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(bg)
                        .overlay(
                            Capsule().strokeBorder(outlined ? Color.accentColor : Color.clear, lineWidth: 2)
                        )
                )
        }
        .padding(.horizontal, 4)
    }
}
