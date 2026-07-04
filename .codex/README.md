# Beatably Codex App Setup

This folder holds stable scripts for the Codex app's **Local environments**
feature.

Open Codex app settings and configure this project with:

1. A setup script that runs:
   `.codex/setup/setup-worktree.sh`
2. Actions that run:
   `.codex/actions/start-stack.sh`
   `.codex/actions/run-ios-unit-tests.sh`
   `.codex/actions/run-ios-ui-tests.sh`
   `.codex/actions/open-dual-sim.sh`

Why these wrappers exist:

- the commands stay short and consistent in the Codex app top bar,
- the repo owns the workflow instead of each machine retyping commands,
- Codex can run the same scripts from the integrated terminal, shell, or follow-up prompts.

Recommended action labels in the Codex app:

- `Stack`
- `iOS Unit`
- `iOS UI`
- `Dual Sim`

Recommended usage:

- Use `Stack` before browser or simulator testing.
- Use `iOS Unit` for fast XCTest checks.
- Use `iOS UI` for simulator UI tests that launch the real app.
- Use `Dual Sim` before asking Codex to use Computer Use on two Simulator windows.
