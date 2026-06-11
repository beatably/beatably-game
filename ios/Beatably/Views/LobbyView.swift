import SwiftUI

struct LobbyView: View {
    @Environment(GameViewModel.self) private var vm
    @State private var isStarting = false

    private var canStart: Bool { vm.players.count >= 2 && vm.players.count <= 4 }
    private var startHint: String? {
        if vm.players.count < 2 { return "Need at least 2 players to start" }
        if vm.players.count > 4 { return "Maximum 4 players allowed" }
        return nil
    }

    var body: some View {
        @Bindable var bvm = vm

        VStack(spacing: 0) {
            // Header: room code
            VStack(spacing: 4) {
                Text("Room Code")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(vm.roomCode)
                    .font(.system(size: 40, weight: .black, design: .monospaced))
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(Color(.secondarySystemBackground))

            // Players list
            List {
                Section("Players (\(vm.players.count)/4)") {
                    ForEach(vm.players) { player in
                        HStack {
                            Text(player.name)
                                .fontWeight(player.isCreator ? .bold : .regular)
                            if player.isCreator {
                                Text("HOST")
                                    .font(.caption2.bold())
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color(.tertiarySystemBackground))
                                    .clipShape(Capsule())
                            }
                            Spacer()
                            if player.isReady {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                            }
                            // Host can kick any non-host player
                            if vm.isCreator && !player.isCreator {
                                Button {
                                    vm.kickPlayer(id: player.id)
                                } label: {
                                    Image(systemName: "xmark.circle")
                                        .foregroundStyle(.red)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                if vm.isCreator {
                    Section("Settings") {
                        // Win condition
                        HStack {
                            Text("Hits to Win")
                            Spacer()
                            Picker("Hits to Win", selection: $bvm.gameSettings.winCondition) {
                                Text("8").tag(8)
                                Text("10").tag(10)
                                Text("12").tag(12)
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 160)
                        }
                        .onChange(of: vm.gameSettings.winCondition) { vm.updateSettings() }

                        // Market
                        Picker("Market", selection: Binding(
                            get: { marketMode },
                            set: { applyMarket($0) }
                        )) {
                            Text("International").tag("international")
                            Text("Swedish").tag("se")
                            Text("Mix").tag("mix")
                        }
                        .onChange(of: vm.gameSettings.markets) { vm.updateSettings() }

                        // Difficulty
                        Picker("Difficulty", selection: $bvm.gameSettings.difficulty) {
                            Text("Easy").tag("easy")
                            Text("Advanced").tag("advanced")
                        }
                        .onChange(of: vm.gameSettings.difficulty) { vm.updateSettings() }

                        // Year range
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Year Range")
                                Spacer()
                                Text("\(vm.gameSettings.yearMin) – \(vm.gameSettings.yearMax)")
                                    .foregroundStyle(.secondary)
                                    .font(.subheadline)
                            }
                            YearRangeSlider(
                                min: $bvm.gameSettings.yearMin,
                                max: $bvm.gameSettings.yearMax,
                                bounds: 1960...2025
                            )
                            .onChange(of: vm.gameSettings.yearMin) { vm.updateSettings() }
                            .onChange(of: vm.gameSettings.yearMax) { vm.updateSettings() }
                        }
                        .padding(.vertical, 4)

                        // Genre selection — advanced only
                        if vm.gameSettings.difficulty == "advanced" {
                            GenrePickerRow(genres: $bvm.gameSettings.genres)
                                .onChange(of: vm.gameSettings.genres) { vm.updateSettings() }
                        }
                    }
                } else {
                    Section("Settings") {
                        LabeledContent("Hits to Win", value: "\(vm.gameSettings.winCondition)")
                        LabeledContent("Market", value: marketLabel)
                        LabeledContent("Difficulty", value: vm.gameSettings.difficulty.capitalized)
                        LabeledContent("Years", value: "\(vm.gameSettings.yearMin) – \(vm.gameSettings.yearMax)")
                        if vm.gameSettings.difficulty == "advanced" && !vm.gameSettings.genres.isEmpty {
                            LabeledContent("Genres", value: vm.gameSettings.genres.map { $0.capitalized }.joined(separator: ", "))
                        }
                    }
                }
            }

            // Footer
            VStack(spacing: 8) {
                if let hint = startHint, vm.isCreator {
                    Text(hint)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if vm.isCreator {
                    Button {
                        isStarting = true
                        vm.startGame()
                    } label: {
                        Group {
                            if isStarting {
                                ProgressView().tint(.white)
                            } else {
                                Text("Start Game")
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(canStart ? Color.accentColor : Color.gray)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(!canStart || isStarting)
                }

                Button(role: .destructive) {
                    vm.leaveLobby()
                } label: {
                    Text("Leave")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color(.secondarySystemBackground))
                        .foregroundStyle(.red)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding()
        }
        .alert("Error", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
        .onChange(of: vm.view) { _, newView in
            if newView == .game { isStarting = false }
        }
    }

    private var marketMode: String {
        let m = vm.gameSettings.markets
        if m.contains("SE") && (m.contains("international") || m.contains("INTL")) { return "mix" }
        if m.contains("SE") { return "se" }
        return "international"
    }

    private var marketLabel: String {
        switch marketMode {
        case "se": return "Swedish"
        case "mix": return "Mix"
        default: return "International"
        }
    }

    private func applyMarket(_ mode: String) {
        switch mode {
        case "se": vm.gameSettings.markets = ["SE"]
        case "mix": vm.gameSettings.markets = ["SE", "international"]
        default: vm.gameSettings.markets = ["international"]
        }
    }
}

// MARK: - Year Range Slider

private struct YearRangeSlider: View {
    @Binding var min: Int
    @Binding var max: Int
    let bounds: ClosedRange<Int>

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Text("From")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(width: 32, alignment: .leading)
                Slider(
                    value: Binding(
                        get: { Double(min) },
                        set: { min = Swift.min(Int($0), max - 5) }
                    ),
                    in: Double(bounds.lowerBound)...Double(bounds.upperBound),
                    step: 5
                )
            }
            HStack {
                Text("To")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(width: 32, alignment: .leading)
                Slider(
                    value: Binding(
                        get: { Double(max) },
                        set: { max = Swift.max(Int($0), min + 5) }
                    ),
                    in: Double(bounds.lowerBound)...Double(bounds.upperBound),
                    step: 5
                )
            }
        }
    }
}

// MARK: - Genre Picker Row

private struct GenrePickerRow: View {
    @Binding var genres: [String]

    private let available: [(id: String, label: String)] = [
        ("pop", "Pop"), ("indie", "Indie"), ("rock", "Rock"),
        ("electronic", "Electronic"), ("hip-hop", "Hip-Hop")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Genres")
                .font(.subheadline.weight(.medium))
            FlowLayout(spacing: 8) {
                ForEach(available, id: \.id) { genre in
                    let selected = genres.contains(genre.id)
                    Button {
                        if selected {
                            // Keep at least one genre selected
                            if genres.count > 1 { genres.removeAll { $0 == genre.id } }
                        } else {
                            genres.append(genre.id)
                        }
                    } label: {
                        Text(genre.label)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(selected ? Color.accentColor : Color(.tertiarySystemBackground))
                            .foregroundStyle(selected ? .white : .primary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Flow Layout (wrapping HStack)

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxY: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width && x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            rowH = Swift.max(rowH, size.height)
            x += size.width + spacing
            maxY = Swift.max(maxY, y + rowH)
        }
        return CGSize(width: width, height: maxY)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            rowH = Swift.max(rowH, size.height)
            x += size.width + spacing
        }
    }
}
