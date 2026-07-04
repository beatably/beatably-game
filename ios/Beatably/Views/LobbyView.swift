import SwiftUI

struct LobbyView: View {
    @Environment(GameViewModel.self) private var vm
    @State private var isStarting = false
    @State private var codeCopied = false
    @State private var startGlowPulse = false

    private var canStart: Bool { vm.players.count >= 2 && vm.players.count <= 4 }
    private var startHint: String? {
        if vm.players.count < 2 { return "Need at least 2 players to start" }
        if vm.players.count > 4 { return "Maximum 4 players allowed" }
        return nil
    }

    var body: some View {
        @Bindable var bvm = vm

        ZStack {
            Color.beatBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Room code header ─────────────────────────────────
                RoomCodeCard(code: vm.roomCode, copied: $codeCopied)

                // ── Scrollable content ───────────────────────────────
                ScrollView {
                    VStack(spacing: 16) {
                        // Players
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader("Players (\(vm.players.count)/4)")
                            VStack(spacing: 6) {
                                ForEach(vm.players) { player in
                                    PlayerRow(player: player, canKick: vm.isCreator && !player.isCreator) {
                                        vm.kickPlayer(id: player.id)
                                    }
                                    .transition(.move(edge: .trailing).combined(with: .opacity))
                                }
                            }
                        }
                        .animation(.spring(duration: 0.3), value: vm.players.count)

                        // Settings
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader("Settings")
                            if vm.isCreator {
                                CreatorSettingsPanel(bvm: bvm)
                            } else {
                                GuestSettingsPanel()
                            }
                        }
                    }
                    .padding(16)
                }

                // ── Footer ───────────────────────────────────────────
                VStack(spacing: 10) {
                    if let hint = startHint, vm.isCreator {
                        Text(hint)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(Color.beatMuted)
                    }

                    if vm.isCreator {
                        Button {
                            isStarting = true
                            SoundManager.shared.impact(.heavy)
                            vm.startGame()
                        } label: {
                            BeatPrimaryLabel(title: "Start Game", isLoading: isStarting)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .strokeBorder(Color.beatTeal, lineWidth: 2)
                                        .scaleEffect(startGlowPulse ? 1.06 : 1.0)
                                        .opacity(startGlowPulse ? 0.0 : 0.6)
                                        .animation(canStart ? .easeOut(duration: 1.2).repeatForever() : .default,
                                                   value: startGlowPulse)
                                )
                        }
                        .buttonStyle(PressScaleStyle(haptic: .heavy))
                        .disabled(!canStart || isStarting)
                        .accessibilityIdentifier("lobby.startGameButton")
                        .onAppear { if canStart { startGlowPulse = true } }
                        .onChange(of: canStart) { _, ready in startGlowPulse = ready }
                    }

                    Button {
                        SoundManager.shared.impact(.light)
                        vm.leaveLobby()
                    } label: {
                        Text("Leave")
                            .font(.system(.body, design: .rounded).weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(Color.beatSurface)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.beatBorder, lineWidth: 1))
                    }
                    .buttonStyle(PressScaleStyle(haptic: .light))
                    .accessibilityIdentifier("lobby.leaveButton")
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                .padding(.top, 10)
                .background(Color.beatBg)
            }
        }
        .accessibilityIdentifier("lobby.screen")
        .alert("Error", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
        .onChange(of: vm.view) { _, newView in if newView == .game { isStarting = false } }
        .overlay(alignment: .top) { if !vm.isConnected { ReconnectingBanner() } }
        .animation(.easeInOut(duration: 0.2), value: vm.isConnected)
    }
}

// MARK: - Room code header (no card — sits on dark bg)

private struct RoomCodeCard: View {
    let code: String
    @Binding var copied: Bool

    var body: some View {
        VStack(spacing: 4) {
            Text("Room Code")
                .font(.system(.caption, design: .rounded).weight(.semibold))
                .foregroundStyle(Color.beatMuted)

            Text(code)
                .font(.system(size: 34, weight: .black, design: .monospaced))
                .foregroundStyle(Color.beatText)
                .textSelection(.enabled)
                .accessibilityIdentifier("lobby.roomCodeValue")

            if copied {
                Text("Copied!")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(Color.beatGreen)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .onTapGesture { copyCode() }
        .accessibilityIdentifier("lobby.roomCodeHeader")
    }

    private func copyCode() {
        UIPasteboard.general.string = code
        SoundManager.shared.impact(.light)
        withAnimation { copied = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { copied = false } }
    }
}

// MARK: - Player row

private struct PlayerRow: View {
    let player: Player
    let canKick: Bool
    let onKick: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(player.isCreator ? Color.beatTeal : Color.beatDim)
                .frame(width: 3, height: 32)

            Text(player.name)
                .font(.system(.body, design: .rounded).weight(player.isCreator ? .bold : .regular))
                .foregroundStyle(Color.beatText)

            if player.isCreator {
                Text("HOST")
                    .font(.system(size: 9, weight: .black, design: .rounded))
                    .foregroundStyle(Color.beatTeal)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color.beatTeal.opacity(0.15))
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(Color.beatTeal.opacity(0.4), lineWidth: 1))
            }

            Spacer()

            if player.isReady {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Color.beatGreen)
            }

            if canKick {
                Button {
                    SoundManager.shared.impact(.light)
                    onKick()
                } label: {
                    Image(systemName: "xmark.circle")
                        .foregroundStyle(Color.beatMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.beatSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.beatBorder, lineWidth: 1))
    }
}

// MARK: - Section header

private struct SectionHeader: View {
    let title: String
    init(_ title: String) { self.title = title }
    var body: some View {
        Text(title)
            .font(.system(.caption, design: .rounded).weight(.bold))
            .foregroundStyle(Color.beatMuted)
            .textCase(.uppercase)
            .tracking(1)
    }
}

// MARK: - Creator settings

private struct CreatorSettingsPanel: View {
    @Bindable var bvm: GameViewModel

    var body: some View {
        VStack(spacing: 10) {
            // Win condition
            SettingRow(label: "Hits to Win") {
                BeatSegmentPicker(
                    options: [(label: "8", value: 8), (label: "10", value: 10), (label: "12", value: 12)],
                    selection: $bvm.gameSettings.winCondition
                )
                .onChange(of: bvm.gameSettings.winCondition) { bvm.updateSettings() }
            }

            // Market
            SettingRow(label: "Market") {
                BeatSegmentPicker(
                    options: [
                        (label: "Intl", value: "international"),
                        (label: "Swedish", value: "se"),
                        (label: "Mix", value: "mix")
                    ],
                    selection: Binding(
                        get: { marketMode },
                        set: { applyMarket($0) }
                    )
                )
                .onChange(of: bvm.gameSettings.markets) { bvm.updateSettings() }
            }

            // Difficulty
            SettingRow(label: "Difficulty") {
                BeatSegmentPicker(
                    options: [(label: "Easy", value: "easy"), (label: "Advanced", value: "advanced")],
                    selection: $bvm.gameSettings.difficulty
                )
                .onChange(of: bvm.gameSettings.difficulty) { bvm.updateSettings() }
            }

            // Year range
            YearRangeRow(min: $bvm.gameSettings.yearMin, max: $bvm.gameSettings.yearMax)
                .onChange(of: bvm.gameSettings.yearMin) { bvm.updateSettings() }
                .onChange(of: bvm.gameSettings.yearMax)  { bvm.updateSettings() }

            // Genres (advanced only)
            if bvm.gameSettings.difficulty == "advanced" {
                GenreRow(genres: $bvm.gameSettings.genres)
                    .onChange(of: bvm.gameSettings.genres) { bvm.updateSettings() }
            }
        }
    }

    private var marketMode: String {
        let m = bvm.gameSettings.markets
        if m.contains("SE") && (m.contains("international") || m.contains("INTL")) { return "mix" }
        if m.contains("SE") { return "se" }
        return "international"
    }

    private func applyMarket(_ mode: String) {
        switch mode {
        case "se":  bvm.gameSettings.markets = ["SE"]
        case "mix": bvm.gameSettings.markets = ["SE", "international"]
        default:    bvm.gameSettings.markets = ["international"]
        }
    }
}

// MARK: - Guest settings (read-only)

private struct GuestSettingsPanel: View {
    @Environment(GameViewModel.self) private var vm

    private var marketLabel: String {
        let m = vm.gameSettings.markets
        if m.contains("SE") && (m.contains("international") || m.contains("INTL")) { return "Mix" }
        if m.contains("SE") { return "Swedish" }
        return "International"
    }

    var body: some View {
        VStack(spacing: 6) {
            GuestSettingRow(label: "Hits to Win", value: "\(vm.gameSettings.winCondition)")
            GuestSettingRow(label: "Market", value: marketLabel)
            GuestSettingRow(label: "Difficulty", value: vm.gameSettings.difficulty.capitalized)
            GuestSettingRow(label: "Years", value: "\(vm.gameSettings.yearMin) – \(vm.gameSettings.yearMax)")
            if vm.gameSettings.difficulty == "advanced" && !vm.gameSettings.genres.isEmpty {
                GuestSettingRow(label: "Genres", value: vm.gameSettings.genres.map { $0.capitalized }.joined(separator: ", "))
            }
        }
    }
}

private struct GuestSettingRow: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label).foregroundStyle(Color.beatMuted)
            Spacer()
            Text(value).foregroundStyle(Color.beatText).fontWeight(.medium)
        }
        .font(.system(.subheadline, design: .rounded))
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(Color.beatSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.beatBorder, lineWidth: 1))
    }
}

// MARK: - Setting row wrapper

private struct SettingRow<Content: View>: View {
    let label: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(.caption, design: .rounded).weight(.semibold))
                .foregroundStyle(Color.beatMuted)
            content
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.beatSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.beatBorder, lineWidth: 1))
    }
}

// MARK: - Beat segment picker (chip style)

private struct BeatSegmentPicker<T: Hashable>: View {
    let options: [(label: String, value: T)]
    @Binding var selection: T

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                let selected = selection == opt.value
                Button {
                    withAnimation(.spring(duration: 0.2)) { selection = opt.value }
                    SoundManager.shared.impact(.light)
                } label: {
                    Text(opt.label)
                        .font(.system(.caption, design: .rounded).weight(.semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background {
                            if selected {
                                Capsule().fill(LinearGradient(
                                    colors: [Color.beatTeal, Color.beatGradientPurple],
                                    startPoint: .leading, endPoint: .trailing
                                ))
                            } else {
                                Capsule().fill(Color.beatSurface2)
                            }
                        }
                        .foregroundStyle(selected ? .white : Color.beatMuted)
                        .clipShape(Capsule())
                        .overlay(Capsule().strokeBorder(selected ? Color.beatTeal : Color.beatBorder, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .animation(.spring(duration: 0.2), value: selected)
            }
            Spacer()
        }
    }
}

// MARK: - Year range (two-knob range slider)

private struct YearRangeRow: View {
    @Binding var min: Int
    @Binding var max: Int
    private let bounds = 1960...2025

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Year Range")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.beatMuted)
                Spacer()
                Text(verbatim: "\(String(min)) – \(String(max))")
                    .font(.system(.caption, design: .rounded).weight(.medium))
                    .foregroundStyle(Color.beatText)
            }
            RangeSlider(low: $min, high: $max, bounds: bounds, step: 5)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.beatSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.beatBorder, lineWidth: 1))
    }
}

private struct RangeSlider: View {
    @Binding var low: Int
    @Binding var high: Int
    let bounds: ClosedRange<Int>
    let step: Int

    @State private var draggingThumb: DragThumb? = nil
    private enum DragThumb { case low, high }

    private let thumbSize: CGFloat = 22

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let span = Double(bounds.upperBound - bounds.lowerBound)
            let lowFrac  = CGFloat(Double(low  - bounds.lowerBound) / span)
            let highFrac = CGFloat(Double(high - bounds.lowerBound) / span)
            let rangeFrac = highFrac - lowFrac

            ZStack {
                // Track background
                Capsule()
                    .fill(Color.beatBorder)
                    .frame(width: w, height: 4)

                // Active range fill
                Capsule()
                    .fill(LinearGradient(
                        colors: [Color.beatTeal, Color.beatGradientPurple],
                        startPoint: .leading, endPoint: .trailing
                    ))
                    .frame(width: max(0, rangeFrac * w), height: 4)
                    .offset(x: (lowFrac + rangeFrac / 2 - 0.5) * w)

                // Low thumb — teal border matching web min-handle
                Circle()
                    .fill(Color.beatSurface)
                    .overlay(Circle().strokeBorder(Color.beatTeal, lineWidth: 2))
                    .frame(width: thumbSize, height: thumbSize)
                    .shadow(color: Color.beatTeal.opacity(0.3), radius: 4)
                    .offset(x: (lowFrac - 0.5) * w)

                // High thumb — purple border matching web max-handle
                Circle()
                    .fill(Color.beatSurface)
                    .overlay(Circle().strokeBorder(Color.beatGradientPurple, lineWidth: 2))
                    .frame(width: thumbSize, height: thumbSize)
                    .shadow(color: Color.beatGradientPurple.opacity(0.3), radius: 4)
                    .offset(x: (highFrac - 0.5) * w)
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        let frac = max(0, min(1, v.location.x / w))
                        if draggingThumb == nil {
                            let dLow  = abs(frac - lowFrac)
                            let dHigh = abs(frac - highFrac)
                            draggingThumb = dLow <= dHigh ? .low : .high
                        }
                        let raw = Double(bounds.lowerBound) + frac * span
                        let val = Int((raw / Double(step)).rounded()) * step
                        let clamped = max(bounds.lowerBound, min(bounds.upperBound, val))
                        switch draggingThumb {
                        case .low:  if clamped + step <= high { low  = clamped }
                        case .high: if clamped - step >= low  { high = clamped }
                        case nil: break
                        }
                    }
                    .onEnded { _ in draggingThumb = nil }
            )
        }
        .frame(height: thumbSize)
    }
}

// MARK: - Genre row

private struct GenreRow: View {
    @Binding var genres: [String]
    private let available: [(id: String, label: String)] = [
        ("pop", "Pop"), ("indie", "Indie"), ("rock", "Rock"),
        ("electronic", "Electronic"), ("hip-hop", "Hip-Hop")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Genres")
                .font(.system(.caption, design: .rounded).weight(.semibold))
                .foregroundStyle(Color.beatMuted)

            FlowLayout(spacing: 8) {
                ForEach(available, id: \.id) { g in
                    let sel = genres.contains(g.id)
                    Button {
                        SoundManager.shared.impact(.light)
                        withAnimation(.spring(duration: 0.2)) {
                            if sel {
                                if genres.count > 1 { genres.removeAll { $0 == g.id } }
                            } else {
                                genres.append(g.id)
                            }
                        }
                    } label: {
                        Text(g.label)
                            .font(.system(.caption, design: .rounded).weight(.medium))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background {
                                if sel {
                                    Capsule().fill(LinearGradient(
                                        colors: [Color.beatTeal, Color.beatGradientPurple],
                                        startPoint: .leading, endPoint: .trailing
                                    ))
                                } else {
                                    Capsule().fill(Color.beatSurface2)
                                }
                            }
                            .foregroundStyle(sel ? .white : Color.beatMuted)
                            .clipShape(Capsule())
                            .overlay(Capsule().strokeBorder(sel ? Color.beatTeal : Color.beatBorder, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.beatSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.beatBorder, lineWidth: 1))
    }
}

// MARK: - Flow layout (re-used from previous implementation)

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxY: CGFloat = 0
        for view in subviews {
            let s = view.sizeThatFits(.unspecified)
            if x + s.width > width && x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            rowH = Swift.max(rowH, s.height); x += s.width + spacing
            maxY = Swift.max(maxY, y + rowH)
        }
        return CGSize(width: width, height: maxY)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for view in subviews {
            let s = view.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX && x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            rowH = Swift.max(rowH, s.height); x += s.width + spacing
        }
    }
}
