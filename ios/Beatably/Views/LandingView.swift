import SwiftUI

struct LandingView: View {
    @Environment(GameViewModel.self) private var vm
    @State private var name = ""
    @State private var showJoin = false
    @State private var showHowToPlay = false
    @State private var joinCode = ""
    // Whether the join sheet must collect a name itself (deep-link path only)
    @State private var joinSheetNeedsName = false
    @FocusState private var nameFocused: Bool

    private var nameIsEmpty: Bool { name.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        ZStack {
            // ── Video background ────────────────────────────────────
            VideoBackground(resource: "ghost5")
                .ignoresSafeArea()
                .accessibilityHidden(true)

            // Dim the video so foreground content stays legible
            Color.black.opacity(0.3)
                .ignoresSafeArea()
                .accessibilityHidden(true)

            // ── Content ─────────────────────────────────────────────
            VStack(spacing: 0) {
                // ── Top: Logo + connection status ────────────────────
                VStack(spacing: 10) {
                    Image("BeatableLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 56)
                        .foregroundStyle(.white)
                        .shadow(color: Color.beatPurple.opacity(0.9), radius: 8)
                        .shadow(color: Color.beatPurple.opacity(0.5), radius: 20)
                        .shadow(color: Color.beatPurple.opacity(0.2), radius: 40)

                    HStack(spacing: 6) {
                        Circle()
                            .fill(vm.isConnected ? Color.beatGreen : Color.orange)
                            .frame(width: 7, height: 7)
                            .scaleEffect(vm.isConnected ? connectedScale : 1)
                            .animation(
                                vm.isConnected
                                    ? .easeInOut(duration: 1.4).repeatForever(autoreverses: true)
                                    : .default,
                                value: connectedScale
                            )
                        Text(vm.isConnected ? "Connected" : "Connecting…")
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(Color.beatMuted)
                    }
                }
                .padding(.top, 60)
                .padding(.horizontal, 24)

                Spacer()

                // ── Input + buttons ──────────────────────────────────
                VStack(spacing: 12) {
                    // Encouraging heading — everyone starts by entering a name
                    Text("What should we call you?")
                        .font(.system(.title3, design: .rounded).bold())
                        .foregroundStyle(Color.beatText)

                    // Name field — brighter placeholder for contrast
                    TextField("", text: $name, prompt: Text("Your nickname or team name").foregroundStyle(Color.beatMuted))
                        .font(.system(.body, design: .rounded))
                        .accessibilityIdentifier("landing.nameField")
                        .beatInput(focused: nameFocused)
                        .focused($nameFocused)
                        .textInputAutocapitalization(.words)
                        .disableAutocorrection(true)
                        // Make the whole padded box tappable, not just the text baseline
                        .contentShape(Rectangle())
                        .onTapGesture { nameFocused = true }

                    // Create + Join appear side by side once a name is entered
                    if !nameIsEmpty {
                        HStack(spacing: 12) {
                            Button {
                                let trimmed = name.trimmingCharacters(in: .whitespaces)
                                guard !trimmed.isEmpty else { return }
                                SoundManager.shared.impact(.medium)
                                vm.createLobby(name: trimmed)
                            } label: {
                                BeatPrimaryLabel(title: "Create Game")
                            }
                            .buttonStyle(PressScaleStyle(haptic: .medium))
                            .accessibilityIdentifier("landing.createGameButton")

                            Button {
                                SoundManager.shared.impact(.light)
                                joinSheetNeedsName = nameIsEmpty
                                showJoin = true
                            } label: {
                                BeatSecondaryLabel(title: "Join Game")
                            }
                            .buttonStyle(PressScaleStyle(haptic: .light))
                            .accessibilityIdentifier("landing.joinGameButton")
                        }
                        .opacity(!vm.isConnected ? 0.55 : 1)
                        .disabled(!vm.isConnected)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }

                    // How to play button
                    Button {
                        showHowToPlay = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "questionmark.circle")
                            Text("What is Beatably and how to play?")
                        }
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(Color.beatMuted)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 12)
                }
                .animation(.easeInOut(duration: 0.25), value: nameIsEmpty)
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
        // Tap anywhere outside the field to dismiss the keyboard
        .contentShape(Rectangle())
        .onTapGesture { nameFocused = false }
        .onAppear {
            startConnectedPulse()
            KeyboardPrewarmer.prewarm()
            // Test hook: auto-present How to Play for screenshot verification.
            if ProcessInfo.processInfo.arguments.contains("UITEST_SHOW_HOWTOPLAY") {
                showHowToPlay = true
            }
        }
        .sheet(isPresented: $showHowToPlay) { HowToPlayView() }
        .accessibilityIdentifier("landing.screen")
        .sheet(isPresented: $showJoin) {
            JoinSheet(name: $name, code: $joinCode, showNameField: joinSheetNeedsName, onJoin: { joinName, code in
                vm.joinLobby(name: joinName, code: code)
            })
            // Hug the content — a .medium detent leaves a large dead gap above the keyboard.
            // Compact when it's just the code (auto-submits); taller when a name is needed.
            .presentationDetents([.height(joinSheetNeedsName ? 380 : 230)])
        }
        .onAppear { consumePendingJoinCode() }
        .onChange(of: vm.pendingJoinCode) { _, _ in consumePendingJoinCode() }
        .alert("Error", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // Pulse scale state for the connection dot
    @State private var connectedScale: CGFloat = 1.0

    private func startConnectedPulse() {
        connectedScale = 1.4
    }

    private func consumePendingJoinCode() {
        if let c = vm.pendingJoinCode {
            joinCode = c
            joinSheetNeedsName = nameIsEmpty
            showJoin = true
            vm.pendingJoinCode = nil
        }
    }
}

// MARK: - Join sheet

private struct JoinSheet: View {
    @Binding var name: String
    @Binding var code: String
    // True only when opened without a name (deep link) — the landing flow
    // guarantees a name before the Join button appears.
    let showNameField: Bool
    let onJoin: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @FocusState private var nameFocused: Bool

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }
    private var isReady: Bool { !trimmedName.isEmpty && code.count == 4 }

    private func submit() {
        guard isReady else { return }
        SoundManager.shared.impact(.medium)
        onJoin(trimmedName, code)
        dismiss()
    }

    var body: some View {
        ZStack {
            Color.beatBg.ignoresSafeArea()

            VStack(spacing: 20) {
                Text("Join a Game")
                    .font(.system(.title2, design: .rounded).bold())
                    .foregroundStyle(Color.beatText)
                    .padding(.top, 28)

                if showNameField {
                    TextField("", text: $name, prompt: Text("Your nickname or team name").foregroundStyle(Color.beatDim))
                        .font(.system(.body, design: .rounded))
                        .accessibilityIdentifier("join.nameField")
                        .beatInput(focused: nameFocused)
                        .focused($nameFocused)
                        .textInputAutocapitalization(.words)
                        .disableAutocorrection(true)
                        .contentShape(Rectangle())
                        .onTapGesture { nameFocused = true }
                        .padding(.horizontal, 24)
                }

                VStack(spacing: 8) {
                    Text("Room Code")
                        .font(.system(.caption, design: .rounded).weight(.medium))
                        .foregroundStyle(Color.beatMuted)
                        .frame(maxWidth: .infinity, alignment: .center)

                    FourDigitCodeField(code: $code)
                        .padding(.horizontal, 24)
                        .accessibilityIdentifier("join.roomCodeField")
                }

                // The code field auto-submits on the 4th digit, so the Join button
                // is only needed for the deep-link case where a name is still required
                // (and may be entered after the code, which auto-proceed can't detect).
                if showNameField {
                    Button {
                        submit()
                    } label: {
                        BeatPrimaryLabel(title: "Join")
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(!isReady)
                    .padding(.horizontal, 24)
                    .accessibilityIdentifier("join.submitButton")
                }

                Spacer(minLength: 0)
            }
        }
        // Auto-proceed once the final digit is entered (name already filled).
        .onChange(of: code) { _, newValue in
            if newValue.count == 4 && isReady {
                submit()
            }
        }
    }
}

// MARK: - 4-digit code field

private struct FourDigitCodeField: View {
    @Binding var code: String
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            // Hidden text field captures actual keyboard input
            TextField("", text: Binding(
                get: { code },
                set: { raw in
                    code = String(raw
                        .filter { $0.isNumber }
                        .prefix(4))
                }
            ))
            .focused($focused)
            .keyboardType(.numberPad)
            .disableAutocorrection(true)
            .opacity(0.001)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Visual 4-box display — narrow, centered boxes (~70% of full width)
            HStack(spacing: 12) {
                let chars = Array(code)
                ForEach(0..<4, id: \.self) { i in
                    let char = i < chars.count ? String(chars[i]) : ""
                    let isActive = focused && i == min(chars.count, 3)
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.beatSurface2)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(
                                    isActive ? Color.beatTeal : Color.beatBorder,
                                    lineWidth: isActive ? 2 : 1.5
                                )
                        )
                        .overlay(
                            Text(char)
                                .font(.system(size: 24, weight: .bold, design: .monospaced))
                                .foregroundStyle(Color.beatText)
                        )
                        .frame(width: 52, height: 58)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .frame(height: 58)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear {
            // Slight delay so the sheet has settled before focus
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
                focused = true
            }
        }
    }
}

// MARK: - Keyboard prewarming

/// The iOS text-input system loads lazily on the first `becomeFirstResponder`,
/// which makes the very first tap on a text field feel sluggish. Briefly focusing
/// an off-screen field at launch warms that subsystem so the first real tap is instant.
enum KeyboardPrewarmer {
    private static var didPrewarm = false

    static func prewarm() {
        guard !didPrewarm else { return }
        didPrewarm = true

        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) else { return }

        let field = UITextField(frame: .zero)
        field.alpha = 0
        window.addSubview(field)
        field.becomeFirstResponder()
        // Resign on the next runloop turn — long enough to kick off the input
        // system load, short enough that the keyboard never visibly appears.
        DispatchQueue.main.async {
            field.resignFirstResponder()
            field.removeFromSuperview()
        }
    }
}

