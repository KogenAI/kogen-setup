# Report time and result of init verification runs

Slug: setup-init-verification-runs-report-time
Model: not applicable — progress output only, no state machine
Acceptance:
- .kogen/intents/setup-init-verification-runs-report-time/acceptance.feature
- features/steps/setup-init-verification-runs-report-time__runs.js

Every verification run of `kogen init` prints an end line on stderr (progress) with its elapsed time and result, and a stop caused by the init verification budget prints one more line naming the longest runs. Only progress output changes: which commands are kept or left out, the budget limit, the per-command limit, the left-out wording, exit codes, written configuration and the commit stay unchanged. The stdout summary lines (`Setup:`, `Fix:`, `Checks:`, `Replaced:`, `Protect:`, `Left out:`, `Acceptance:`, `Commit:`) and the existing start lines stay exactly as they are. There is no new configuration, flag or environment variable. The acceptance-runner check (`kogen: checking the acceptance runner`) is not run by `initExec` and is out of scope (it is run by `verify.RunnerCheck`); kogen-verification, kogen-loop and the kogen CLI do not change.

End lines. One helper in the setup package runs a verification command through `initExec` and prints the end line (through `s.Progress`) right after the command returns and before any failure output the existing code prints; all six `initExec` calls and the `initRerunCheck` call in `initVerify` go through it. `initExec` returns a `sys.Result` with `TimedOut`, `Status` and `Output`. The end line uses the label of the matching start line, without the command: `setup-1`, `setup-1 again`, a check name such as `test`, `test again`, `fix-1`, `fix-1 again`, and for a kept check re-run after a fixer `test after fix-1`. When the command ended: `kogen: <label> finished in <elapsed> (status <exit status>)`. When it timed out: `kogen: <label> timed out after <elapsed>`. Elapsed is the command's wall time truncated to whole seconds and written as Go prints a duration (`0s`, `3s`, `2m5s`); a command under one second reads `0s`.

Budget line. When the verification budget stops init (a command is cut by the remaining budget, or a command is not started because no budget is left, the `unverified` case of `initBudget`), init prints exactly one progress line after the last verification step and before the summary: `kogen: init time budget of <budget> used up; longest runs: <entries>`, where `<budget>` is the budget as `initDurationText` writes it and `<entries>` are up to three `label elapsed` entries separated by `, `, longest first (equal times keep run order), each written as in the end lines. A timeout from the per-command limit alone is not a budget stop. A pure function builds the line from the runs and the budget text so a test can pass fixed durations. Its interface is fixed: `type initRunTime struct { label string; elapsed time.Duration }` and `func initBudgetLine(runs []initRunTime, budget string) string`, with runs given in run order.

Existing tests that compare whole stderr or whole progress lines may be updated only to allow the new end lines.

## Decisions
- The end line and the budget line are progress (stderr) lines, printed through the session's Progress like the start lines. (decision: D1, round 1) (evidence: setup/init.go) (source: request)
- A budget stop is a command capped by the remaining budget that timed out, or a command not started because no budget is left; one line is printed at the end of verification, not per command. (decision: D2, round 1) (evidence: setup/init.go; setup/init_budget_test.go) (source: request)
- The pure budget-line function is named `initBudgetLine(runs []initRunTime, budget string) string` over `initRunTime{label, elapsed}`, because the request names no identifiers and acceptance must call it; the name `initRun` is already taken in the package. (decision: D3, round 1) (evidence: setup/init.go) (assumption: the identifier names are a test seam and may be confirmed or renamed by the caller) (source: request)
- Elapsed is truncated to whole seconds once, when the run is recorded, so ordering and display of runs use the same value. (decision: D4, round 1) (source: request)
- Acceptance drives the real init through the existing setup test fixtures (initNewFx, initSubmit, initCheckList) from a driver test file the step writes into a scratch copy of the repository; the Build's own new Go test file (TestInitRunEnd*) is separate and not run by acceptance. (decision: D5, round 1) (evidence: setup/init_test.go; setup/init_budget_test.go; features/steps/command_timeout.js) (source: request)

## Source comparison
- Addressed: end line for setup, setup again, checks, checks again, fixers, fixers again and kept-check rechecks (scenarios 1-3).
- Addressed: timed-out run prints `timed out after` and no `finished` line (scenario 4); a wrong implementation would print `kogen: slow finished in 3s (status 0)` for it.
- Addressed: budget line with the three longest runs, longest first, equal times in run order (scenario 5) and printed once per stop after the timeout line (scenario 6).
- Observed in live adopt runs (evidence only, unchanged start lines): `ok: .kogen/models.yaml from kogen init runs shape, build and review on claude-code`; `kogen: init claude-sonnet-5-5/high input=55710 cached=36301 output=708 reasoning=0 wall_ms=9734`; `kogen: running setup-1: (cd cli && go mod download)`; `kogen: running setup-1 again: (cd cli && go mod download)`; `kogen: checking go-test: (cd cli && go test ./...)`; `kogen: running go-test again: (cd cli && go test ./...)`; `kogen: checking go-vet after fix-1: (cd cli && go vet ./...)`; `kogen: checking test after fix-1: mix test`; and the shape phase's existing progress format `kogen: running fix-1: mix format (53 s)`.
- Observed budget-stop left-out entries, unchanged: `slow (sleep 30) timed out: init time budget of 3s used up` and `later (echo later >> "$RUN_LOG") not verified: init time budget of 3s used up`.
- Unchanged by request: stdout summary lines, start lines, left-out wording, budget and per-command limits, exit codes, configuration, commit, the acceptance-runner check.

## Tests
- Setup commands report both runs: TestInitRunEndSetupBothRuns in setup (integration)
- A passing and a failing check report their own status: TestInitRunEndCheckStatus in setup (integration)
- A fixer and the kept checks report their end lines: TestInitRunEndFixerAndRecheck in setup (integration)
- A timed-out command reports the timeout and not a status: TestInitRunEndTimedOut in setup (integration)
- The budget line lists the longest runs, longest first: TestInitRunEndBudgetLineLongestFirst in setup (unit)
- A budget stop prints the budget line once: TestInitRunEndBudgetLineOncePerStop in setup (integration)
- Existing init tests keep passing, updated only to allow end lines: setup/init_test.go and setup/init_budget_test.go (existing)

## Feasibility
- none
