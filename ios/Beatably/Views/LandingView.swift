import SwiftUI

struct LandingView: View {
    @Environment(GameViewModel.self) private var vm
    @State private var name = ""
    @State private var showJoin = false
    @State private var joinCode = ""

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Text("Beatably")
                    .font(.system(size: 48, weight: .black))
                HStack(spacing: 6) {
                    Circle()
                        .fill(vm.isConnected ? Color.green : Color.orange)
                        .frame(width: 8, height: 8)
                    Text(vm.isConnected ? "Connected" : "Connecting…")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            VStack(spacing: 16) {
                TextField("Your name", text: $name)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.words)
                    .disableAutocorrection(true)
                    .font(.title3)
                    .padding(.horizontal)

                Button {
                    guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                    vm.createLobby(name: name.trimmingCharacters(in: .whitespaces))
                } label: {
                    Text("Create Game")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || !vm.isConnected)
                .padding(.horizontal)

                Button {
                    showJoin = true
                } label: {
                    Text("Join Game")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color(.secondarySystemBackground))
                        .foregroundStyle(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || !vm.isConnected)
                .padding(.horizontal)
            }

            Spacer()
        }
        .sheet(isPresented: $showJoin) {
            JoinSheet(name: name, code: $joinCode, onJoin: { code in
                vm.joinLobby(name: name.trimmingCharacters(in: .whitespaces), code: code)
            })
            .presentationDetents([.medium])
        }
        .alert("Error", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }
}

private struct JoinSheet: View {
    let name: String
    @Binding var code: String
    let onJoin: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 24) {
            Text("Join a Game")
                .font(.title2.bold())
                .padding(.top)

            TextField("Room code", text: $code)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.characters)
                .disableAutocorrection(true)
                .font(.title2.monospaced())
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                let trimmed = code.trimmingCharacters(in: .whitespaces).uppercased()
                guard !trimmed.isEmpty else { return }
                onJoin(trimmed)
                dismiss()
            } label: {
                Text("Join")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.horizontal)

            Spacer()
        }
    }
}
