# Reject no-op setup and fix commands

Slug: k-setup-setup-fix-run-nothing
Model: not applicable — pure validation wiring has no meaningful state
Acceptance:
- .kogen/intents/k-setup-setup-fix-run-nothing/acceptance.feature
- features/steps/k-setup-setup-fix-run-nothing__validate.js

Apply the existing literal initRunsNothing test in setup/init.go Validate to every setup and fix command. Refuse the proposal with `setup command <command> runs nothing` or `fix command <command> runs nothing`. Previously these no-ops passed twice and could enter project.yaml, misleadingly reporting preparation or fixing. Keep the existing one-correction opportunity; do not alter checks, protect paths, command execution, or other validation. No shell commands in these fixtures are executed: acceptance calls the exported Validate boundary.

## Decisions
- Reuse exactly the check test's recognized subset, splitting, quoting and exclusions for redirection, $(...) and backticks; do not broaden the parser or infer whether arbitrary commands do useful work. (source: request)
- Preserve existing correction flow and existing check diagnostic text. (source: request)

## Source comparison
- Addressed: request Problem and Need — the setup and fix loops in setup/init.go currently omit the predicate already used by checks. This contract adds only those missing validations and exact kind/command diagnostics.
- Addressed: synthetic acceptance — feature cases include setup true, echo ready, mix deps.get, mkdir -p tmp; fix :, gofmt -w ., echo x > formatted.txt; and check true with its existing text.
- Addressed: request examples and exclusions — executable cases cover exit 0, echo done, fix true, test -f x, echo hi > out.txt, go mod download && echo done, substitutions and compound literal no-ops for both command kinds.
- Superseded: TestInitValidateRunsNothing's final assertion that setup true and fix echo ok are accepted; update that assertion while retaining detected-check semantics and all other useful coverage.
- Addressed: caller can correct once — preserve initAsk's existing bounded correction behavior; add regression coverage with the existing init fixture for setup and fix invalid proposals followed by a valid correction. No workflow redesign or additional retries is requested.
- Omitted: no requested behavior; no provider or prompt changes are needed.

## Tests
- Reject literal no-op setup and fix commands with exact diagnostics: add focused Validate regression cases and acceptance outlines (regression).
- Preserve allowed real commands and literal-parser exclusions: extend Validate table coverage and acceptance outlines (unit).
- Preserve check diagnostics and protect/rest-of-Validate behavior: retain existing init coverage, updating only obsolete no-op acceptance expectations (existing).
- Preserve the single correction opportunity for newly invalid proposals: extend existing init fixture correction tests for setup and fix, asserting the diagnostic reaches the correction and invalid commands do not enter configuration (integration).

## Feasibility
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":["features/steps/k-setup-setup-fix-run-nothing__validate.js"],"observers":["features/steps/k-setup-setup-fix-run-nothing__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-setup-fix-run-nothing__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-setup-fix-run-nothing__validate.js --control bad","exit":1,"output":"rejected\n"}]}
