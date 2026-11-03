# Reject checks that cannot run twice

Slug: k-setup-check-not-repeatable
Model: not applicable — bounded command verification/filtering has no independent persistent state machine; real filesystem regression scenarios cover the same-copy dependency.
Acceptance:
- .kogen/intents/k-setup-check-not-repeatable/acceptance.feature
- features/steps/k-setup-check-not-repeatable__verify.js

In setup/init.go's initVerify checks loop, replace single-run eligibility with two-run verification on the same copy. For every check whose first run exits 0 without timeout and changes no tracked file, run it again without resetting the copy (including untracked artifacts). Keep only checks passing existing eligibility rules and both executions. First-run failures and tracked mutations retain their existing rejection and restoration behavior and are not retried. Retain existing no-tests rejection. Apply existing tracked-mutation rejection/restoration and no-tests rules to the second execution too, so repeating cannot admit a mutating or empty test check.

Second-run nonzero status omits the check with `<name> (<command>) is not repeatable: its second run failed with status <n>`. Second-run timeout omits it with `<name> (<command>) is not repeatable: its second run timed out after 10m`, even if a termination handler exits zero. Show failing output through the existing output mechanism. Keep first-run progress unchanged; add `kogen: running <name> again: <command>` before the retry. No reset between executions, no extra retries. Fixers, setup behavior, Init exit codes, and stdout of other lines remain unchanged. Do not add production abstractions, new settings or dependencies. Existing init tests remain green; update expectations only where the new check execution legitimately changes them.

## Decisions
- Omit nonrepeatable checks rather than failing Init; preserve the existing Left out summary style. (source: request)
- Run twice on the same copy, preserving first-run artifacts; stable checks remain configured. (source: request)
- Retain first-failure reporting and never retry an ineligible first execution. (source: request)

## Source comparison
- Addressed: request owning file setup/init.go, initVerify checks loop: outcome prose and executable scenarios replace single-run verification, not the already-double-run setup loop.
- Addressed: synthetic `once = test ! -e .ran && touch .ran`, `stable = test -f README.md`, omitted once and retained stable in project.yaml: first scenario observes Init's summary and parsed saved configuration.
- Addressed: first-run failure unchanged/not repeated: first scenario uses `exit 7` and exact progress list. Second-run failure status and timeout have explicit wording and separate scenarios.
- Addressed: fixers/setup/exit codes/other stdout remain unchanged through existing init regression coverage and required configured checks. No request behavior is intentionally omitted or superseded. Additional second-run mutation/no-tests handling preserves existing check eligibility rather than permitting a new bypass.

## Tests
- A fresh-only check must be omitted after its second execution while a stable check remains saved: README fixture Init scenario with exact commands and saved check names (regression)
- First-run nonzero checks keep existing wording and have no second progress line: combined Init fixture scenario (scenario)
- Second-run timeout must omit the check as nonrepeatable, including successful TERM handling: bounded local Init fixture with test-only shortened timeout (integration)
- Checks must still reject tracked mutations and empty test runs on either execution: add focused init fixture cases for second-run changes and no-tests output during implementation (integration)
- Setup, fixers, exit codes and unrelated summary output retain their behavior: existing setup and contract tests, plus configured format/build/vet/go-test checks (existing)

## Feasibility
- evidence: {"id":"repeat-observer","kind":"observer","inputs":["features/steps/k-setup-check-not-repeatable__verify.js"],"observers":["features/steps/k-setup-check-not-repeatable__verify.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-not-repeatable__verify.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-not-repeatable__verify.js --control bad","exit":1,"output":"rejected\n"}]}
