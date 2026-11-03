# Verify fix commands on the copy during init

Slug: k-setup-fix-command-unverified
Model: not applicable — init runs each fix command once, in order, and keeps or leaves it out by its exit status; there is no state that persists or interacts between runs
Acceptance:
- .kogen/intents/k-setup-fix-command-unverified/acceptance.feature
- features/steps/init_fix_steps.js
- features/steps/testdata/init_harness.go
- features/steps/testdata/observe.sh
- features/steps/testdata/observer-good.feature
- features/steps/testdata/observer-bad.feature

`kogen init` (`setup.Init`, workflow in `setup/init.go`) already runs setup entries and checks on a copy of the committed tree before keeping them. Fix commands (the formatters or auto-fixers that detection and the model propose) are not run at all: `initVerify` sets `res.fix = candidates.Fix` (~line 801), and `initConfigure` writes `Fix: res.fix` into `.kogen/project.yaml`. A fixer that does not exist on this machine, needs a missing dependency, or fails on the project's own files is therefore committed as configuration and only fails later, inside a Build.

This change replaces that copy-through. In `initVerify`, after the checks loop has finished (so after setup, the acceptance-runner check and every check), init runs each candidate fix command once on the copy, in the order of the merged fix list (`candidates.Fix`: detected fixers first, then proposed ones, duplicates removed by `Merge` as today). It runs them the same way as a check: through `initExec` with the copy (`clone`) as the working directory, the same environment (the session's environment plus `KOGEN_NODE`, `KOGEN_QUINT`, `KOGEN_CUCUMBER` from `InitInput.Tools`) and the same process-group handling (`KillGroupOnExit`). An error from running it (for example an interrupted session) ends init exactly as it does for a check.

- Before running fix number `n` (1-based position in the merged fix list, counting kept and left-out fixers alike), init prints the progress line `kogen: running fix-<n>: <command>` to stderr.
- A fix that exits 0 is kept: `project.yaml`'s `fix` lists the passing fixers in their original order.
- A fix that exits non-zero is left out: it is not written to `project.yaml`, and the entry `fix-<n> (<command>) failed with status <code>` is appended to the `Left out:` list. Because fixers run last, their entries follow every setup and check entry, joined with `; ` as today, e.g. `Left out: bad (exit 7) failed with status 7; fix-1 (exit 5) failed with status 5`. When every fixer fails, `fix` is written as the empty list (`fix: []`).
- A fixer runs exactly once. Fixers are not required to be repeatable (no second run, no tree-state comparison). They may change the copy; the copy is discarded as today, and nothing they do reaches the repository's working tree.
- Because fixers run after the checks, a fixer that rewrites a tracked file cannot change which checks are kept.

Unchanged: the result lines' wording and order (`Initialized Kogen in`, `Setup:`, `Checks:`, `Left out:`, `Acceptance:`, `Note:`, `Commit:`, `Next:`), exit codes, setup and check handling, `protect` (still kept only when at least one check passed), the `Checks:` rule (`none found` only when nothing at all was left out, otherwise `none passed`; a left-out fixer counts like any other Left out entry), the bridge, the one model request and the one commit. When there are no fix commands, or every fix command passes, stdout and `project.yaml` are byte-identical to today's.

## Decisions
- A failing fixer is left out with the `Left out:` entry `fix-<n> (<command>) failed with status <code>`, and a passing one is kept as today (source: request)
- Fixers run once each, after the checks, on the discarded copy, with the same environment, working directory and process-group handling as a check (source: request)
- Each fixer run is announced on stderr as `kogen: running fix-<n>: <command>`, matching the existing `kogen: running setup-<n>: <command>` progress line, because the request says fixers run the same way as checks and every check run prints a progress line; stdout result lines do not change (source: request)

## Source comparison
- Request "After the checks have run, init runs each fix command once on the copy (the same way as a check: same environment, working directory and process-group handling)": addressed in the prose and the scenario "Fixers run once, last, on the copy". That scenario's fixers write to the fix log only when the working directory has no `.git` and `KOGEN_NODE` is set, and they must each write exactly once and in order. The stderr ordering check (`kogen: checking ok: true` before `kogen: running fix-1: true`) is in the first scenario.
- Request "A fix that exits non-zero is left out, with a `Left out:` entry of the form `fix-<n> (<command>) failed with status <code>`; a fix that exits 0 is kept as today": addressed by the scenario "A failing fixer is left out and a passing one is kept", using the request's synthetic example literally: fix `["true", "exit 3"]` and check `ok` (`true`) on a README.md-only fixture repository. `Left out:` contains `fix-2 (exit 3) failed with status 3` and not `fix-1`, project.yaml `fix` holds only `true`, and `Checks:` lists `ok`.
- Request "Running fixers must not influence earlier results (they run last, after checks)" and "a fix that rewrites a tracked file does not change which checks were kept": the scenario "Fixers run once, last, on the copy" has a fixer that rewrites README.md and a check `same` (`grep -qx '# notes' README.md`) that is still kept. The ordering of Left out entries after check entries is the scenario "Left-out fixers follow the left-out checks".
- Request "they may change the copy, which is discarded as today" and "Fixers are not required to be repeatable": the same scenario checks that the repository still has README.md `# notes` and a clean working tree, and that the appending fixer (`echo run >> runs.txt`) is kept after a single run.
- Request "Output lines, exit codes, setup and checks handling do not change when every fix passes or there are none" and "With no fix proposed, output is byte-identical to today": the scenario "Without a proposed fixer the output is what it is today" pins the exact stdout observed on the unchanged tree (also the stdout of the all-passing-fixers scenario) and `fix: []` in project.yaml. Existing setup tests stay as they are.
- Request "The existing test that keeps `echo fixer` stays green": `TestInitSetupThatFailsIsLeftOut` in `setup/init_test.go` keeps its assertions (`echo fixer` exits 0). Its comment "fixers are kept untested" becomes wrong and is updated.
- Consequence for an existing test, not stated in the request: `TestInitLeavesOutAFailingCheckOnTheCommittedTree` proposes the detected fixer `mix format`, and its fake `mix` program exits 3 for `format`. With fixers verified, that test would gain `fix-1 (mix format) failed with status 3` and lose `- 'mix format'` from project.yaml. The fake `mix` in that test gains a `"format") exit 0;;` case so the test keeps asserting a kept detected fixer and its current output.
- Owning file and lines named by the request: `setup/init.go` `initVerify` (`res.fix = candidates.Fix`) and `initConfigure` (`Fix: res.fix`). Only `initVerify` needs to change; `initConfigure` keeps writing `res.fix`.
- Not in scope: the contract suite (`contract/`) and its README. No exported interface changes, and its fixtures propose no fixers (verified: `go test ./contract/` passes with fixers verified).

## Tests
- A fix command that exits non-zero is left out with `fix-<n> (<command>) failed with status <code>` and one that exits 0 is kept in project.yaml: new test in `setup/init_test.go` proposing fix `["true", "exit 3"]` and check `ok` (`true`), asserting the exact stdout lines and `cfg.Fix == ["true"]` (integration)
- Same rule through the `setup.Init` entry point: scenario "A failing fixer is left out and a passing one is kept" (scenario)
- Fixers run once, after the checks, on the copy, with the check environment, and do not change the repository or the kept checks: new test in `setup/init_test.go` with a fixer that rewrites a tracked file and a check that reads that file, asserting the check is kept, the fixer is kept, and the working tree is unchanged (integration); scenario "Fixers run once, last, on the copy" (scenario)
- Left-out fixer entries follow left-out check entries, and a project whose only fixer fails writes `fix: []`: scenario "Left-out fixers follow the left-out checks" (scenario)
- Each fixer run prints `kogen: running fix-<n>: <command>` to stderr after the check progress lines: scenario "A failing fixer is left out and a passing one is kept" (scenario)
- Without fix commands the output and project.yaml are unchanged: scenario "Without a proposed fixer the output is what it is today" (scenario); existing `TestInitConfiguresAProjectWithoutChecksAndAddsTheBridge` and contract `TestInitWritesTheConfigurationAndTheBridgeInOneCommit` and `TestInitRendersTheCommandsThatPassed` (existing)
- A passing fixer (`echo fixer`) is still kept: `TestInitSetupThatFailsIsLeftOut`, with its comment "fixers are kept untested" updated to say passing fixers are kept (existing)
- A detected fixer that passes on the copy is kept: update the fake `mix` of `TestInitLeavesOutAFailingCheckOnTheCommittedTree` to exit 0 for `format`, so its expected stdout and `    - 'mix format'` project.yaml line stay as they are (existing)

## Feasibility
- evidence: {"id":"init-fix-steps-observer","kind":"observer","inputs":["features/steps/testdata/observe.sh","features/steps/testdata/observer-good.feature","features/steps/testdata/observer-bad.feature"],"observers":["features/steps/init_fix_steps.js","features/steps/testdata/init_harness.go"],"checks":[{"name":"good","command":"sh features/steps/testdata/observe.sh features/steps/testdata/observer-good.feature","exit":0,"output":"2 scenarios (2 passed)\n22 steps (22 passed)\n"},{"name":"bad","command":"sh features/steps/testdata/observe.sh features/steps/testdata/observer-bad.feature","exit":1,"output":"15 scenarios (15 failed)\n90 steps (75 passed, 15 failed)\n"}]}
