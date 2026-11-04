# Leave out fix commands that change protected paths

Slug: k-setup-fix-changes-protected-path
Model: not applicable — one bounded compare-and-restore step per fixer on a throwaway copy, added to the existing fixer loop; no persistent state machine. Real filesystem Init scenarios cover the comparison and restoration.

Acceptance:
- .kogen/intents/k-setup-fix-changes-protected-path/acceptance.feature
- features/steps/k-setup-fix-changes-protected-path__verify.js

Protected paths are the verification definitions a build must not edit. Init (`setup.Init`, `kogen init`) already leaves out setup commands and checks that change a tracked file, so those cannot touch a protected path. Fix commands may change tracked files (that is their purpose), and today the fixer loop at the end of `initVerify` in `setup/init.go` never compares their effect with the protect list. A configuration can therefore keep a fixer that rewrites a path it also protects (for example a formatter run over every file, including the protected lint config or test manifest). This Intent adds that comparison to the fixer loop.

The candidate protect list is `candidates.Protect`, the merged and validated protect list that `initConfigure` passes to `initVerify` (the same list it later gives to `filterProtect`). New behavior, for each fix command in order (`fix-N`, N counting from 1 over the merged fix list, as today):

1. Budget check, whole-copy snapshot and the first run are unchanged (progress `kogen: running fix-N: <command>`). A first-run nonzero exit, timeout or budget stop is left out with today's wording and handling; the protect comparison does not apply to it.
2. When the candidate protect list is nonempty, Init records the state of every path in it in the init copy before the first run, and again right after a successful first run (exit 0, no timeout). A protected path counts as changed when it was created, deleted, or differs in kind, permission bits or bytes (symlink target for a symlink), the way `initTrackedChanged` compares `initTrackedSnapshot` entries.
3. If at least one protected path changed, the fixer is left out with the reason `fix-N (<command>) changed protected <paths>`, where `<paths>` is every changed protected path, sorted, joined with `, ` (unprotected paths the fixer changed are not named). Its first run's output is shown with the existing output mechanism (`  | ` lines), the init copy is restored to exactly its state before that fixer (the existing whole-copy restore, so its changes to unprotected files are undone too), and the fixer is not run a second time (no `kogen: running fix-N again: <command>` line). Later fixers run on the restored copy.
4. Otherwise the existing repeatability check continues unchanged: second run, compare, keep or leave out with today's `is not repeatable` wording. A protected path changed only by the second run is therefore reported as today, by `is not repeatable: its second run changed <paths>`.

The protect list itself is not changed by this: the saved `protect` list and the `Protect:` summary line are decided as today. Fixers that change only unprotected files, and every fixer when the candidate protect list is empty, are verified exactly as today. The new reason joins the existing `Left out:` line in order with the other left-out entries; the `Fix:` line lists the kept fixers. Setup and check verification, exit codes, the commit, other stdout lines and the user's own working tree are unchanged; fixers still only run on the init copy. No new settings, dependencies or production abstractions.

## Decisions
- A fixer that changes the content of any path in the candidate protect list is left out with `fix-N (<command>) changed protected <paths>`. (source: request)
- The init copy is restored to its state before that fixer, including its changes to unprotected files. (source: request)
- The protect list is not weakened; fixers that change only unprotected files, and all fixers when nothing is protected, behave as today. (source: request)
- Verification stays on the init copy; the real project's files are untouched. (source: request)

## Source comparison
- Addressed: owning file `setup/init.go`, `initVerify` fixer loop: protected-path comparison after the first run (prose items 2–4). `initConfigure` needs no change because it already passes the merged protect candidates to `initVerify`.
- Addressed: `lint.cfg` proposed in protect with a passing check (`lint`: `test -f lint.cfg`) on tracked `a.txt` and `lint.cfg`: every scenario uses that fixture.
- Addressed: `printf x >> lint.cfg` left out with `fix-1 (printf x >> lint.cfg) changed protected lint.cfg` and `lint.cfg` restored: scenario 2, where the later fixer `test "$(cat lint.cfg)" = lint` is kept only if `lint.cfg` is back to its committed content.
- Addressed: `sh -c 'printf x >> a.txt; printf x >> lint.cfg'` left out as a whole with `a.txt` also restored: scenario 3 (reason `changed protected lint.cfg`, later fixer checks both files). Because this fixer and `printf x >> lint.cfg` would also fail the existing repeatability check, the protect comparison runs after the first run and decides first (prose item 3); scenario 4 uses the repeatable `sh -c 'printf x > a.txt; printf x > lint.cfg'`, which is kept today, so it is left out only by the new rule.
- Superseded: "Fix `printf x >> a.txt`: kept". Since the repeatability check (commit 9f7a5d2) every appending fixer is left out as not repeatable, independent of protection. The kept unprotected-only case uses the repeatable `printf x > a.txt` instead (scenario 1), with a later fixer `test "$(cat a.txt)" = x` showing that `a.txt` changed in the copy.
- Superseded: "Same fixer, no protect list: kept". The appending `sh -c` fixer with no protect list is left out as not repeatable, as today (scenario 6); its repeatable `>` form is kept with no protect list (scenario 5).
- Addressed: "naming the paths": scenario 7 changes two protected paths and one unprotected path and expects `changed protected lint.cfg, tests.list`.
- Addressed: "working tree of the real project is untouched in all cases": every scenario checks the real repository's fixture file contents and an empty `git status --porcelain --untracked-files=all` after Init.
- Addressed: "the protect list itself is not weakened": every scenario with protect checks the saved `protect` list and the `Protect:` line.

## Tests
- A fixer whose first run changes a protected path is left out with `fix-N (<command>) changed protected <paths>`, is not run again, and the copy (protected and unprotected files) is restored before the next fixer: add an init fixture test in `setup` (integration), plus acceptance scenarios 2, 3 and 4 (scenario)
- Every changed protected path is named, sorted, and unprotected paths are not: init fixture test (integration), plus acceptance scenario 7 (scenario)
- A fixer that changes only unprotected files is kept and its effect stays in the copy only: acceptance scenario 1 (scenario)
- With an empty protect list, fixers are judged as today (kept if repeatable, otherwise `is not repeatable`): existing `setup/init_fix_repeat_test.go` tests, plus acceptance scenarios 5 and 6 (existing)
- The real project's working tree is untouched and the protect list is saved as proposed: checked in every acceptance scenario (scenario)
- First-run failure wording, budget wording, repeatability wording, setup and check verification remain unchanged: existing `setup` tests, plus the configured format, compile, vet and go-test checks (existing)

## Feasibility
- evidence: {"id":"fix-protected-observer","kind":"observer","inputs":["features/steps/k-setup-fix-changes-protected-path__verify.js"],"observers":["features/steps/k-setup-fix-changes-protected-path__verify.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-changes-protected-path__verify.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-changes-protected-path__verify.js --control bad","exit":1,"output":"rejected\n"}]}
- A scratch run of the same Go driver shape on the unchanged tree showed that every fixture command and check passes `Validate`, `lint.cfg` and `tests.list` are kept in `Protect:`, the real repository's files are unchanged and its status is clean after Init. Today `printf x >> lint.cfg` and both `sh -c ... >>` fixers are left out as `is not repeatable: its second run changed ...` after a second run, and `sh -c 'printf x > a.txt; printf x > lint.cfg'` (and the three-file variant) is kept even with `lint.cfg` protected, so scenarios 2, 3, 4 and 7 fail today for the missing feature; scenarios 1, 5 and 6 already pass and guard unchanged behavior.
