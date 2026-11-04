# Leave out fix commands that are not repeatable

Slug: k-setup-fix-not-idempotent
Model: not applicable — one bounded run-twice-and-compare step per fixer on a throwaway copy; no persistent state machine. Real filesystem Init scenarios cover the same-copy and restoration behavior.
Acceptance:
- .kogen/intents/k-setup-fix-not-idempotent/acceptance.feature
- features/steps/k-setup-fix-not-idempotent__verify.js

Init (`setup.Init`, `kogen init`) already runs each setup command and each check twice on the same tree, because a command that behaves differently on its second run cannot be relied on before every build. Fix commands (formatters, auto-fixers) are run once only, in the fixer loop at the end of `initVerify` in `setup/init.go`. So a fixer whose output changes on every run (a formatter that rewrites a file differently each time, a generator that stamps a timestamp, a fixer that appends a line) passes verification and is written to `.kogen/project.yaml`, and every later build that runs it gets a different tree. This Intent replaces the single fixer run with a run-twice check.

New behavior, for each fix command in order (`fix-N`, N counting from 1 over the merged fix list, as today):

1. First run: unchanged. Progress `kogen: running fix-N: <command>`. A first-run nonzero exit or timeout is left out with today's wording (`fix-N (<command>) failed with status <n>`, `fix-N (<command>) timed out after 10m`, or the budget wording) and the fixer is not run again. A fixer that cannot start because the init time budget is used up is left out with today's `fix-N (<command>) not verified: init time budget of 10m used up`. Neither case changes today's handling of the copy.
2. Before the first run, Init snapshots the whole init copy (the way the setup loop does). After a successful first run, Init records the copy's state: every tracked and untracked (not ignored) path that differs from HEAD, with its content, as the setup loop does with `initTreeState`.
3. Second run on the tree the first run left, without any reset. Progress `kogen: running fix-N again: <command>` (same form as `kogen: running setup-N again: <command>`).
4. The fixer is kept (appended to the saved `fix` list) only if the second run exits 0 without timing out and the copy's state afterwards is exactly the state recorded after the first run (same paths, same content). Its effect stays on the copy, as a kept fixer's effect does today.
5. Otherwise the fixer is left out, its failing output is shown with the existing output mechanism (`  | ` lines), and the reason uses the setup loop's style:
   - second run changed paths: `fix-N (<command>) is not repeatable: its second run changed <paths>`; `<paths>` lists every path whose state differs between the two recorded states (changed, added or removed), sorted, joined with `, `.
   - second run exited nonzero: `fix-N (<command>) is not repeatable: its second run failed with status <n>`.
   - second run timed out: `fix-N (<command>) is not repeatable: its second run timed out after 10m` (when the init time budget, not the per-command limit, stopped it: `fix-N (<command>) is not repeatable: its second run timed out: init time budget of 10m used up`).
   - budget used up before the second run could start: `fix-N (<command>) not verified: init time budget of 10m used up`.
   In every one of these cases the copy is restored to exactly its state before that fixer's first run, so later fixers run on the restored tree and the summary and saved configuration show no effect from it.

Fixers that are stable (the first run changes files, the second changes nothing more) or that change nothing are kept, as today. Left-out fixer reasons join the existing `Left out:` line in order with the other left-out entries; the `Fix:` line lists the kept fixers (`none` when there are none). Setup and check verification, exit codes, the commit, other stdout lines and the user's own working tree are unchanged; fixers still only run on the init copy. No new settings, dependencies or production abstractions.

## Decisions
- Run each fixer a second time on the tree its first run left, and keep it only if that run exits 0 and leaves the tracked and untracked files exactly (by content) as the first run left them. (source: request)
- Leave out a non-repeatable fixer with `fix-N (<command>) is not repeatable: its second run changed <paths>`, `... its second run failed with status N`, or `... its second run timed out after 10m`, in the same style as setup. (source: request)
- Restore the copy to its state before a fixer left out for non-repeatability, so later fixers and the summary see no effect from it. (source: request)
- Stable fixers and fixers that change nothing stay kept. (source: request)
- The second run's progress line is `kogen: running fix-N again: <command>`, in the same style as setup's `kogen: running setup-N again: <command>`. (source: request)

## Source comparison
- Addressed: request owning file `setup/init.go`, `initVerify` fixer loop: replaced the single run with first run, second run, compare, and restore on rejection (prose items 1–5).
- Addressed: `printf x >> f.txt` left out with `fix-1 (printf x >> f.txt) is not repeatable: its second run changed f.txt`: acceptance scenario 1. That `f.txt` is back to its committed content is checked in scenario 5: the later fixer `test "$(cat f.txt)" = a` only exits 0 on the committed content `a`.
- Addressed: `sort -o list.txt list.txt` on an unsorted tracked `list.txt` is kept: scenario 2 (committed content `b\na\n`).
- Conflicting, superseded: "Fix `true`: kept, as today". Today `true` never reaches verification: `Validate` refuses it with `fix command true runs nothing` (Intent k-setup-setup-fix-run-nothing), and on the scripted single-reply fixture Init then exits 4 (observed in a scratch run on the unchanged tree). The "changes nothing" case is covered with `test -f f.txt` instead (scenario 3), which passes validation and is kept today.
- Addressed: `sh -c 'test -f once || { touch once; exit 0; }; exit 3'` left out with `second run failed with status 3` and `once` removed: scenario 4, where the later fixer `test ! -e once` is kept only if `once` was removed.
- Addressed: two fixers, the first non-repeatable and the second stable: only the second is kept and it runs on the restored tree: scenario 5.
- Addressed: "tracked and untracked files, by content": scenario 6 appends to the untracked `notes.txt`; the later fixer `test ! -e notes.txt` checks that it was removed again.
- Addressed: "(or ... / timed out)": scenario 7 times out the second run of `if test -e .ran; then sleep 30; else touch .ran; fi`, with the per-command limit shortened to 2 s in the test driver only (the message still names the configured 10m, as today's timeout messages do).
- Kept as is: first-run failure, first-run timeout and budget wording, setup and check verification, output tail display, exit codes and the user's working tree.

## Tests
- A fixer whose second run changes a tracked file again is left out with the `is not repeatable: its second run changed <paths>` reason and its effect removed before the next fixer: add an init fixture test in `setup` (regression), plus acceptance scenarios 1 and 5 (scenario)
- A fixer whose first run changes a tracked file and whose second run changes nothing is kept: init fixture test (integration), plus acceptance scenario 2 (scenario)
- A fixer that changes nothing is kept: existing `TestInitLeavesOutAFailingFixerAndKeepsAPassingOne` (`test -f README.md && test -r README.md` kept), plus acceptance scenario 3 (existing)
- A fixer whose second run exits nonzero is left out with `its second run failed with status <n>` and its untracked file removed: init fixture test (integration), plus acceptance scenario 4 (scenario)
- A fixer whose second run changes an untracked file is left out and the file removed: init fixture test (integration), plus acceptance scenario 6 (scenario)
- A fixer whose second run times out is left out with `its second run timed out after 10m` and its effect removed: init fixture test with a shortened `initExecTimeout` (integration), plus acceptance scenario 7 (scenario)
- Every fixer whose first run passes prints `kogen: running fix-N again: <command>` before its second run: checked in every acceptance scenario's progress list (scenario)
- First-run failure wording, budget wording, setup and check verification remain unchanged: existing `setup` tests including `TestInitLeavesOutAFailingFixerAndKeepsAPassingOne`, `TestInitFailedFixerOutputBoundaries` and the budget test, plus the configured format, compile, vet and go-test checks (existing)

## Feasibility
- evidence: {"id":"fix-repeat-observer","kind":"observer","inputs":["features/steps/k-setup-fix-not-idempotent__verify.js"],"observers":["features/steps/k-setup-fix-not-idempotent__verify.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-not-idempotent__verify.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-not-idempotent__verify.js --control bad","exit":1,"output":"rejected\n"}]}
- A scratch run of the same Go driver on the unchanged tree showed that every fixture command passes `Validate` and is run once (for example `printf x >> f.txt` is saved, and in the two-fixer cases the later observer fixer fails with status 1), so the scenarios fail today for the missing feature. `true` as a fix command is refused by validation (Init exit 4 on the single-reply fixture), so it is not used.
