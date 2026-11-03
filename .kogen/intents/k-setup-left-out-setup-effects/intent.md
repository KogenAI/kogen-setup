# Restore effects of omitted setup entries

Slug: k-setup-left-out-setup-effects
Model: .kogen/intents/k-setup-left-out-setup-effects/model.qnt invariants=Clean seed=17 samples=100 steps=20
Acceptance:
- .kogen/intents/k-setup-left-out-setup-effects/acceptance.feature
- features/steps/setup_tracked.js
- features/steps/setup_omission.js

Fix setup/init.go's initVerify setup loop so every omitted entry leaves the verification copy exactly as it was before that entry. Restore tracked content and remove created files/directories, including ignored install artifacts. Preserve effects of earlier kept entries. Complete restoration before another setup entry, runner, check or fixer can run. This replaces the current leakage of failed or nonrepeatable setup effects; kept entries retain today's behavior. Do not change proposal policy, public Init interfaces, diagnostics, or the real checkout's files. A restoration failure must stop verification rather than verify a contaminated tree.

## Decisions
- Keep existing omission reasons and repeatability rules; correct only the resulting copy state (source: request).
- Use synthetic local Init fixtures and fake model commands, not live providers (source: request).

## Source comparison
- Addressed: request Problem and Need, owning file setup/init.go initVerify: restore the pre-entry copy on every omission, including first/second-run failure, timeout, nonrepeatability and tracked-file mutation; preserve kept setup effects. Covered by outcome prose, Tests and acceptance scenarios.
- Addressed: all three Synthetic acceptance examples retain their exact shell commands and check expressions in acceptance.feature, with exact kept lists.
- Addressed: existing init tests stay green through configured go-test and README's full regression command. Additional regression coverage below establishes restoration before each downstream consumer.
- Omitted: no requested behavior. No scope change or superseded product requirement.

## Tests
- Failed setup must leave no generated artifacts and its dependent check must be omitted: failed-directory acceptance scenario plus focused Init regression (regression).
- Nonrepeatable setup must restore its pre-entry tree: append acceptance scenario and second-run failure regression (regression).
- Repeatable setup retains its effects and remains selected: repeatable-directory acceptance scenario (integration).
- Rollback restores committed tracked content and preserves prior kept artifacts before the next setup: ordered rollback acceptance scenario (regression).
- Every omission route, including first/second-run timeout and tracked mutation, restores ignored and untracked artifacts before the runner, checks and fixers: add local initVerify/Init regressions using existing timeout test seams and fake commands (integration).
- Existing Init behavior remains green: go build ./... && go vet ./... && go test -race -count=1 ./... and configured checks (existing).

## Feasibility
- Existing setup_tracked.js supplies an Init-level synthetic fixture through contract helpers; the new step only compares selected public observations, without creating another driver. No external dependency changes.
- Quint model typechecked and ran 100 samples of 20 steps successfully in a scratch probe (exit 0). It abstracts entry execution, keep and rollback; Clean requires settled copy state to equal the cumulative kept state. An earlier tool-path check with a nonexistent input exited 1 and supplied no capability evidence.
