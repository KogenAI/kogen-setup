# Leave out fix commands that break kept checks

Slug: k-setup-fix-breaks-kept-checks
Model: not applicable — one bounded pass over the already-kept checks per fixer on a throwaway copy, added to the existing fixer loop; no persistent state machine. Real filesystem Init scenarios cover the reruns, the reasons and the restoration.
Acceptance:
- .kogen/intents/k-setup-fix-breaks-kept-checks/acceptance.feature
- features/steps/k-setup-fix-breaks-kept-checks__verify.js

Init (`setup.Init`, `kogen init`) verifies fixers last, once each (two runs for repeatability), after the checks have been decided. Today no kept check is ever run after a fixer has changed the init copy, so a fixer can leave the project failing its own checks (an auto-fixer that rewrites generated code, a formatter that breaks a snapshot test, a fixer that removes an import a check needs) and Init still writes both the fixer and the checks as verified; the next build runs the fixer and then fails the checks Init declared good. This Intent adds a rerun of the kept checks to the fixer loop at the end of `initVerify` in `setup/init.go`.

New behavior, for each fix command in order (`fix-N`, N counting from 1 over the merged fix list, as today):

1. Everything up to today's keep decision is unchanged: budget check, whole-copy snapshot before the fixer, first run, protected-path comparison, second run and repeatability comparison, with today's wording for each left-out reason. A fixer left out by any of those is not followed by check reruns.
2. When the fixer would be kept today ("succeeds") and at least one check is kept (`res.checks`, the checks that passed verification earlier in `initVerify`, in their kept order), Init reruns each kept check once on the fixed copy, in that order, with the progress line `kogen: checking <name> after fix-N: <check command>`. Checks that were left out during check verification are not rerun. With no kept checks nothing is rerun and the fixer is judged as today.
3. A rerun fails when it exits nonzero or times out (only that; the tracked-change and ran-no-tests judgments of check verification are not applied to reruns). At the first failing rerun Init stops rerunning for that fixer, shows the check's output with the existing `  | ` output mechanism, leaves the fixer out with the reason `fix-N (<command>) breaks check <name> (<check command>): <failure>`, and restores the init copy to exactly its state before that fixer (the existing whole-copy restore). `<failure>` is the check's own failure text as `initCommandFailure`/`initBudget.failure` word it, without the `<name> (<check command>) ` prefix: `failed with status N`, `timed out after 10m`, or `timed out: init time budget of <limit> used up` when the remaining budget capped the run. Example: `fix-1 (printf bad > state.txt) breaks check t (test "$(cat state.txt)" = ok): failed with status 1`.
4. When no time is left before a rerun can start, the fixer is left out with today's `fix-N (<command>) not verified: init time budget of <limit> used up` and the copy is restored to its state before that fixer.
5. When every kept check passes its rerun, the fixer is kept as today. Each rerun, like check verification, leaves the copy as it found it (what the check itself created, such as build output, is cleaned up the same way check verification cleans up after a check), so the next fixer runs on the tree the kept fixers produced.

Kept checks stay kept: a fixer never removes a check, and the saved `checks` list and the `Checks:` summary line are decided as today. With no fixers, checks run exactly as many times as today (twice each). The new reason joins the existing `Left out:` line in order with the other left-out entries; the `Fix:` line lists the kept fixers. The comment above the fixer loop ("Fixers run last, so they cannot change which checks are kept") is updated to describe the reruns. Setup and check verification, protected-path and repeatability wording, exit codes, the commit, other stdout lines and the user's own working tree are unchanged; fixers and reruns only run on the init copy. No new settings, dependencies or production abstractions. Recorded goldens whose verification includes fixers and kept checks (for example `setup/testdata/init/mix-golden.json`) are regenerated with `go test ./... -update` only where their recorded results change, then reviewed.

## Decisions
- After each fix command succeeds, every kept check is rerun once on the fixed tree; with no kept checks nothing is rerun. (source: request)
- A fixer after which a kept check fails is left out with `fix-N (<command>) breaks check <name> (<check command>): failed with status N` (or the timed-out wording), and the copy is restored to its state before that fixer. (source: request)
- Kept checks stay kept; a fixer after which all kept checks pass is kept as today. (source: request)
- With no fixers, checks run exactly as many times as today (twice each). (source: request)

## Source comparison
- Addressed: owning file `setup/init.go`, `initVerify` fixer loop and `res.checks`: prose items 2–5.
- Addressed: check `t` = `test "$(cat state.txt)" = ok` with tracked `state.txt` containing `ok` (`ok\n`): every scenario uses that fixture; the real repository's `state.txt` and an empty `git status --porcelain --untracked-files=all` are checked after Init.
- Addressed: fix `printf bad > state.txt` left out with `breaks check t (...)`, `t` still kept: scenario 1 (exact reason `fix-1 (printf bad > state.txt) breaks check t (test "$(cat state.txt)" = ok): failed with status 1`, `Checks: t`).
- Addressed: "`state.txt` is `ok` again" and "two fixers, the first breaking `t` and the second harmless: only the second is kept, run on the restored tree": scenario 3, where the harmless `printf ok > other.txt` is kept only if `t` passes its rerun after fix-2, which needs `state.txt` restored to `ok`.
- Addressed: fix `printf ok > other.txt` kept because `t` passes afterwards: scenario 2.
- Addressed: "no fixers: checks run exactly as many times as today (twice each)": scenario 4 checks the exact progress sequence.
- Addressed: "(or timed out)": scenario 7 (`timed out after 10m`, with the per-command limit shortened in the test driver).
- Addressed: "every kept check" and "with no kept checks, nothing is rerun": scenario 5 (left-out check not rerun, kept checks rerun in order) and scenario 8 (no kept check, fixer kept with no rerun).
- Addressed: "the extra checks run only once per fixer": every fixer scenario checks the exact progress sequence (one `after fix-N` line per kept check); scenario 6 shows the stop at the first failing check.
- Decided in shaping (technical detail, not a product choice): the rerun progress line wording, stopping at the first failing rerun, today's `not verified` wording when the budget is used up before a rerun, and reruns leaving the copy as they found it (prose items 2–5).

## Tests
- After a fixer that is kept today, every kept check reruns once in kept order with `kogen: checking <name> after fix-N: <check command>`, and the fixer stays kept when all pass: add an init fixture test in `setup` (integration), plus acceptance scenarios 2 and 5 (scenario)
- A fixer after which a kept check fails is left out with `fix-N (<command>) breaks check <name> (<check command>): failed with status N`, the check stays kept, and the copy is restored before the next fixer: init fixture test in `setup` (integration), plus acceptance scenarios 1, 3 and 5 (scenario)
- A rerun that times out leaves the fixer out with `...: timed out after 10m`: acceptance scenario 7 (scenario)
- Reruns stop at the first failing kept check: acceptance scenario 6 (scenario)
- With no kept checks nothing is rerun and the fixer is judged as today: acceptance scenario 8 (scenario)
- Reruns leave the copy as they found it, so a later fixer does not see a check's own output: acceptance scenario 9 (scenario)
- No time left before a rerun leaves the fixer out with `fix-N (<command>) not verified: init time budget of <limit> used up`: init fixture test with a shortened `initVerifyLimit`, like `TestInitVerifyBudgetStopsRemainingCommands` (integration)
- With no fixers, checks run twice each as today: acceptance scenario 4 (scenario)
- First-run, protected-path, repeatability and budget wording, setup and check verification remain unchanged: existing `setup` tests, plus the configured format, compile, vet and go-test checks (existing)

## Feasibility
- evidence: {"id":"fix-breaks-checks-observer","kind":"observer","inputs":["features/steps/k-setup-fix-breaks-kept-checks__verify.js"],"observers":["features/steps/k-setup-fix-breaks-kept-checks__verify.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-breaks-kept-checks__verify.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-breaks-kept-checks__verify.js --control bad","exit":1,"output":"rejected\n"}]}
- A scratch run of the same Go driver shape on the unchanged tree showed that check `t` and fix `printf bad > state.txt` pass validation, today's progress is `kogen: checking the acceptance runner`, `kogen: checking t: ...`, `kogen: running t again: ...`, `kogen: running fix-1: ...`, `kogen: running fix-1 again: ...`, and the breaking fixer is kept (`Fix: printf bad > state.txt`, `Checks: t`); the slow check `if test -e .slow; then sleep 30; fi` with fix `touch .slow` also passes validation and both are kept today. So scenarios 1–3 and 5–9 fail today for the missing feature and scenario 4 guards unchanged behavior.
