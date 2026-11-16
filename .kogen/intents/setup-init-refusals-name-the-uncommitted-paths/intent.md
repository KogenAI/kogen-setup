# Name the paths in init's refusals

Slug: setup-init-refusals-name-the-uncommitted-paths
Model: not applicable — the change renders a message from a list of paths and has no state or transitions
Acceptance:
- .kogen/intents/setup-init-refusals-name-the-uncommitted-paths/acceptance.feature
- features/steps/setup-init-refusals-name-the-uncommitted-paths__refusal.js

When `kogen init` refuses before writing any configuration, the refusal names the files the user has to deal with. The `dirty_tree` refusal (class environment, exit 5) names every dirty path among `.kogen/project.yaml`, `.kogen/models.yaml`, `.gitignore` and `features/steps/README.md`, in that order, joined with a comma and a space. With one dirty path the detail is that path followed by ` has uncommitted changes; commit, stash or discard them first`; with two or more it is the joined paths followed by ` have uncommitted changes; commit, stash or discard them first`. The `no_commits` refusal (class environment, exit 3) names the uncommitted files: the first five in the order Git reports them joined with a comma and a space, then, when more remain, ` and ` + the number left over + ` more`. Its detail is the number of uncommitted files (`len(uncommitted)`, as today), ` file(s) are not committed yet (`, the names, then `); commit them first (git add -A && git commit -m "Initial commit"), then run kogen init`; `.gitignore` is neither counted nor named. Which repositories are refused, the class, reason and exit codes, writing nothing, no login attempt and no model request before the refusal are unchanged, and there is no flag, setting or environment variable. A refusal with exactly one dirty path keeps its text; the `no_commits` text gains only the parenthesised names. Nothing changes in kogen-verification, kogen-loop or the kogen CLI.

The old `no_commits` detail for one uncommitted file, which this replaces, is `1 file(s) are not committed yet; commit them first (git add -A && git commit -m "Initial commit"), then run kogen init`.

## Decisions
- Reuse the existing `initPathList` helper in setup/init.go (first five paths, then ` and N more`, defined near the end of the file and already used for left-out entries) for the `no_commits` names, with the count still `len(uncommitted)`; add no new helper. (evidence: setup/init.go) (source: request)
- Build the `dirty_tree` list by collecting every dirty path in the fixed order of the existing `paths` slice, choosing `has` for one and `have` for several; the list is not bounded. (evidence: setup/init.go) (source: request)
- Add the new Go tests in setup/init_refusal_paths_test.go using the fixtures initNewFx, f.write, f.commitAll and `f.wantError(class, reason, exit)`: TestInitRefusalPathsDirtyTreeNamesEveryPath, TestInitRefusalPathsNoCommitsBoundsTheNames and TestInitRefusalPathsNoCommitsNamesShortListInFull, with the exact lines of the scenarios, files at the repository root only. (evidence: setup/init_test.go) (source: request)
- Replace the old `no_commits` assertion `1 file(s) are not committed yet; commit them first (git add -A && git commit -m "Initial commit"), then run kogen init` in TestInitRefusesFilesNotCommittedYet with `1 file(s) are not committed yet (app.txt); commit them first (git add -A && git commit -m "Initial commit"), then run kogen init`; nothing else in that test changes. (evidence: setup/init_test.go) (source: request)
- Acceptance writes its own throwaway Go driver into a scratch copy of go.mod, go.sum and setup/ and reads the refusal from it, so it observes the real refusal text without relying on tests the implementation must write. (evidence: features/steps/k-setup-bridge-keeps-existing-steps-readme__init.js) (source: request)

## Source comparison
- Addressed: expected 1 (`dirty_tree` names every dirty path, `has`/`have`) by scenario 1 and the unchanged single-path text by the existing TestInitRefusesUncommittedChangesToTheFilesItWrites.
- Addressed: expected 2 (`no_commits` names at most five, ` and N more`, `.gitignore` not counted or named, count `len(uncommitted)`) by scenarios 2 and 3.
- Addressed: expected 3 by reusing the existing `initPathList` helper; no helper is added.
- Addressed: unchanged refusal class, reason, exit code, nothing written and no model request are asserted in each scenario's refusal step.
- Superseded: the old `no_commits` assertion `1 file(s) are not committed yet; commit them first (git add -A && git commit -m "Initial commit"), then run kogen init` in TestInitRefusesFilesNotCommittedYet is updated to the new line; the focused tests in setup/init_refusal_paths_test.go, which call `f.wantError(class, reason, exit)`, are listed under Tests.

## Tests
- Every dirty path among the four written files is named in order with `have` for several: TestInitRefusalPathsDirtyTreeNamesEveryPath in setup/init_refusal_paths_test.go (integration)
- The `no_commits` names are bounded to five followed by ` and N more`: TestInitRefusalPathsNoCommitsBoundsTheNames in setup/init_refusal_paths_test.go (integration)
- A short uncommitted list is named in full without ` and 0 more` and `.gitignore` is not counted or named: TestInitRefusalPathsNoCommitsNamesShortListInFull in setup/init_refusal_paths_test.go (integration)
- The single-file `no_commits` line gains the parenthesised name: TestInitRefusesFilesNotCommittedYet updated in setup/init_test.go (existing)
- One dirty path keeps its text: TestInitRefusesUncommittedChangesToTheFilesItWrites (existing)

## Feasibility
- none
