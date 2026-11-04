# Report kept fix commands and protected paths

Slug: k-setup-summary-reports-fix-and-protect
Model: not applicable — this adds two summary lines derived from the already-verified result; no new state or rules
Acceptance:
- .kogen/intents/k-setup-summary-reports-fix-and-protect/acceptance.feature
- features/steps/k-setup-summary-reports-fix-and-protect__summary.js

`kogen init` writes setup commands, fix commands, checks and protected paths into `.kogen/project.yaml` and commits it, but the summary that `initConfigure` in `setup/init.go` prints today reports only `Setup:`, `Checks:`, `Replaced:`, `Dropped:`, `Left out:` and `Acceptance:`. Kept fix commands and kept protected paths are written and committed without being shown, so the reader approves a commit holding commands and protection rules the output never mentions (for example, that a formatter such as `gofmt -w .` will rewrite files on every build).

The summary of a configuring run (`initConfigure`) gains two lines in the same style as `Setup:`:

- `Fix: <kept fix commands joined with "; ">`, or `Fix: none` when no fix command was kept. The list is exactly `res.fix`, the fix commands that passed verification and are written to `commands.fix`, in that order.
- `Protect: <kept protected paths joined with "; ">`, or `Protect: none` when no path was kept. The list is exactly `res.protect` after `filterProtect`, the paths written to `protect`, in that order.

The complete line order of a configuring run becomes: `Initialized Kogen in <root>`, `Setup:`, `Fix:`, `Checks:`, any `Replaced:` lines, any `Dropped:` lines, `Protect:`, `Left out:` (when anything was left out), `Acceptance:`, the optional `Note:` about instruction files, `Commit:`, then the existing `Next:` lines. `Fix:` therefore sits directly after `Setup:` (following the configuration's order setup, fix, checks, protect), and `Protect:` directly before `Left out:` (or directly before `Acceptance:` when nothing was left out), so kept paths sit next to the line that reports omitted ones. Example for a kept fix `gofmt -w .`, a passing check `ok` and a kept protected path `Makefile`:

```
Initialized Kogen in <root>
Setup: none
Fix: gofmt -w .
Checks: ok
Protect: Makefile
Acceptance: Cucumber bridge added in features/steps
Commit: <sha8> Add Kogen configuration
```

A fix command that fails verification stays out of `Fix:` and keeps its existing `Left out:` entry (for example `Left out: fix-1 (gofmt -w .) failed with status 5`); a protected path that `filterProtect` leaves out stays out of `Protect:` and keeps its existing `Left out:` entry.

Boundaries: existing lines keep their wording and their order relative to each other; nothing else printed changes. The rendered and committed `.kogen/project.yaml`, `.kogen/models.yaml`, the commit, verification, merging, validation, stderr progress, the prompt and tool definition, and exit codes are unchanged. The other output paths are unchanged: the first commit of an empty repository, the "Kogen is already initialized" repeat run and committing a left-over configuration (`initCommitLeftover`) print no `Fix:` or `Protect:` line. Existing Go tests that compare the whole output are updated by inserting only the two new lines.

The acceptance step builds the `setup` test binary from a copy of the checkout with one extra driver test it writes itself (`TestSummaryFixProtectIntentCapture`), which uses the existing `setup` test fixture helpers `initNewFx`, `initSubmit`, `initScrub` and the `initFx` methods `program`, `write`, `commitAll`, `run` and `git`; keep those helpers and their signatures.

## Decisions
- Add `Fix:` and `Protect:` lines listing the kept fix commands and kept protected paths, `none` when empty, in the same style as `Setup:` (entries joined with `; `). (source: request)
- Existing lines, their order relative to each other and the committed content do not change; the two lines are inserted at the positions stated above without moving any existing line. (source: request)
- Only the configuring run's summary (`initConfigure`, the owning code the request names) changes; the empty-repository first commit, the already-initialized report and the left-over commit keep their output. (source: request)

## Source comparison
- Addressed: Problem and Need (kept fix commands and protected paths shown; `none` when empty; same style as `Setup:`) in the prose, the decisions and every acceptance scenario.
- Addressed: synthetic example "fix `gofmt -w .` that passes and protect `Makefile` that is eligible: output contains `Fix: gofmt -w .` and `Protect: Makefile`, and the committed configuration contains both" in scenario Kept fix and protected path, which compares the whole stdout and parses the committed `HEAD:.kogen/project.yaml`.
- Addressed: synthetic example "no fix and no protect: `Fix: none` and `Protect: none`" in scenario Nothing to fix or protect.
- Addressed: synthetic example "a fix command that fails verification is left out: `Fix: none` and the existing `Left out:` entry" in scenario Failing fix is left out (`Left out: fix-1 (gofmt -w .) failed with status 5`).
- Addressed: "in the same style as `Setup:`" for several entries in scenario Several entries, joined with `; `.
- Addressed: "Existing lines, their order relative to each other and the committed content do not change" by whole-stdout comparisons in all scenarios and the existing project.yaml tests; "Existing init tests that compare the whole output are updated for the two new lines only" in Tests.
- Exact placement of the two lines is not stated by the request; it is fixed in the prose (Fix after Setup, Protect before Left out) within the request's constraints and pinned by the scenarios.
- Grounded fixture facts (scratch probe of the unchanged tree with the same driver): Protect is kept only when at least one check passes, so every scenario proposes the passing check `ok` (`test -f Makefile`); `Makefile` and `README.md` are eligible tracked paths; the repository has no detected commands; the unchanged output lacks both new lines.
- Omitted: no other output, configuration, prompt or detection change was requested.

## Tests
- A kept fix command and a kept protected path are reported as `Fix: gofmt -w .` and `Protect: Makefile` in their positions, and the committed configuration holds both: acceptance scenario Kept fix and protected path (scenario)
- With no kept fix and no kept protected path the summary prints `Fix: none` and `Protect: none`: acceptance scenario Nothing to fix or protect (scenario)
- A fix command that fails verification is not listed (`Fix: none`) and keeps its `Left out:` entry, while the kept path is listed before `Left out:`: acceptance scenario Failing fix is left out (scenario)
- Several kept fix commands and protected paths are joined with `; ` in kept order: acceptance scenario Several entries (scenario)
- Existing whole-output comparisons gain only the two new lines: update every `initWantLines` expectation in setup/init_test.go, setup/init_no_tests_test.go, setup/init_check_isolation_test.go and setup/init_output_test.go, and the configuring-run `wantLines` expectations in contract/files_test.go (TestInitWritesTheConfigurationAndTheBridgeInOneCommit, TestInitRendersTheCommandsThatPassed and the other configuring-run comparison there); the first-commit and already-initialized comparisons stay as they are (existing)
- The committed configuration, the empty-repository, repeat-run and left-over outputs do not change: the existing project.yaml, first-commit, repeat-output and left-over tests pass without other edits (existing)

## Feasibility
- Scratch probe outside the checkout: copied the tree, added the driver test, `go test -c -o <bin> ./setup` (about 7 s) and ran it with `-test.run '^TestSummaryFixProtectIntentCapture$'` for the four proposals. All exited 0; the committed fix/protect were ["gofmt -w ."]/["Makefile"], []/[], []/["Makefile"] and ["gofmt -w .","test -f README.md"]/["Makefile","README.md"]; the failing fake gofmt gave `Left out: fix-1 (gofmt -w .) failed with status 5`; stdout had no `Fix:` or `Protect:` line on the unchanged tree. Go is go1.27.2; the scripted local provider and fake programs reuse setup's test fixture; no external service is called.
- evidence: {"id":"summary-observer","kind":"observer","inputs":["features/steps/k-setup-summary-reports-fix-and-protect__summary.js"],"observers":["features/steps/k-setup-summary-reports-fix-and-protect__summary.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-summary-reports-fix-and-protect__summary.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-summary-reports-fix-and-protect__summary.js --control bad","exit":1,"output":"rejected\n"}]}
