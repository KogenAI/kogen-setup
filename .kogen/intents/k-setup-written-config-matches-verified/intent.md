# Preserve verified commands before init commits

Slug: k-setup-written-config-matches-verified
Model: .kogen/intents/k-setup-written-config-matches-verified/model.qnt invariants=Safe seed=42 samples=100 steps=20
Acceptance:
- .kogen/intents/k-setup-written-config-matches-verified/acceptance.feature
- features/steps/k-setup-written-config-matches-verified__roundtrip.js
- features/steps/k-setup-written-config-matches-verified__existing.js

Guard init's existing write/commit lifecycle in setup/init.go. Before committing or printing success, reload the rendered, written configuration through project.LoadConfig and compare it to the verified configuration. Compare setup and fix strings, check names and run strings, protect paths, and acceptance Run and StepsDir exactly, preserving list order and string bytes (empty lists may be represented as nil). Acceptance absence must also agree. This replaces the post-commit display-only reload as the first integrity check; reuse the validated configuration for subsequent display.

On parse failure or the first difference, return a nonzero Init exit and an error identifying the affected list/entry and command where available. Traverse setup, fix, checks, protect, acceptance deterministically; a parse failure must identify the configuration and command context, without pretending the parser identified a specific entry if it did not. Remove files newly written by this attempt, restore preexisting files it changed, leave HEAD and index unchanged, and do not print Initialized Kogen or Commit success. Do not change the existing commit-failure recovery policy. Ordinary successful init still produces its existing single commit and output.

Validate must reject any setup, fix, or check run string containing a Unicode control character (unicode.IsControl, including LF, CR, tab and DEL). Its problem must name the list and entry (check name for checks), represent the offending command safely, and instruct the model to put one command per entry. Do not normalize commands to make them pass. Separate entries `set -e` and `npm ci` remain valid; the single entry `set -e\nnpm ci` does not.

## Decisions
- Refuse control-bearing command entries instead of silently folding or rewriting them; retain ordinary single-line shell quoting. (source: request)
- Fail before committing and remove this attempt's written files on parse/equality failure. (source: request)

## Source comparison
- Addressed: request Problem and Need, including setup/init.go initConfigure ordering and Validate's permissive command strings, by the precommit normal-parser equality guard, cleanup and command validation above; acceptance exercises real Init and Validate.
- Addressed: synthetic multiline setup, split commands, check tab/CR, ordinary `mix deps.get` and `test` = `mix test`, and setup `echo 'it''s'` are executable inputs in the step driver. Quoting is tested directly through render/reload because existing Validate intentionally refuses echo-only setup. Stubbed parser changes each compared field or returns a parse error; Init failure, missing written files, unchanged HEAD and clean status are observed.
- Addressed: existing init tests remain required unchanged except tests deliberately describing replaced behavior; the second scenario runs go test ./setup -count=1. README build/vet/race tests and configured checks remain required. No protected production path requires editing.
- Omitted: no requested feature behavior. Historical provider/Studio/cache notes in testing rules do not request changes to these unrelated systems; no external service or provider transport changes are in scope.

## Tests
- Reject control characters in setup, fix and checks with actionable entry-specific problems: focused Validate cases including LF, CR, tab and DEL and the adjacent valid split-entry proposal (unit)
- Preserve every verified field and ordered string through normal YAML loading, including apostrophe quoting and ordinary Mix commands: real Init fixture plus focused render/reload regression tests (regression)
- Parse failure or any first changed command/field stops before commit and rolls back this attempt's writes: local Git Init fixtures with a parser stub and checks of error, HEAD, index, files and absence of success output (integration)
- Existing successful init, commit-failure recovery and display behavior outside the new guard: existing init tests and go build ./..., go vet ./..., go test -race -count=1 ./... (existing)

The protected acceptance uses a scratch copy and existing synthetic init fixtures. Only in that copy it routes production project.LoadConfig calls through a test wrapper that delegates to the real parser then changes one field (or returns a synthetic parse error). No production mocking abstraction is required. The Go test writes observations; the JavaScript observer checks every named obligation. Builder must also add focused maintained Go regression tests. No live provider is used.

## Feasibility
- Existing synthetic Init fixture runs successfully with `go test ./setup -run '^TestInitConfiguresAProjectWithoutChecksAndAddsTheBridge$' -count=1`. (probe: exit 0, 1.1 s)
- Existing setup suite runs successfully with `go test ./setup -count=1`. (probe: exit 0, 7.0 s)
- Quint model typechecks with the bundled Quint. (probe: exit 0, 0.4 s)
- evidence: {"id":"roundtrip-observer","kind":"observer","inputs":["features/steps/k-setup-written-config-matches-verified__roundtrip.js"],"observers":["features/steps/k-setup-written-config-matches-verified__roundtrip.js"],"checks":[{"name":"good","command":"node features/steps/k-setup-written-config-matches-verified__roundtrip.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/k-setup-written-config-matches-verified__roundtrip.js bad","exit":1,"output":"rejected each corrupted obligation\n"}]}
