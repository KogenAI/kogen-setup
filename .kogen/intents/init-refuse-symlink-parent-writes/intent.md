# Refuse init writes through symlinked parents

Slug: init-refuse-symlink-parent-writes
Model: not applicable — the change is one precondition check on paths before init writes files and has no state or transitions
Acceptance:
- .kogen/intents/init-refuse-symlink-parent-writes/acceptance.feature
- features/steps/init-refuse-symlink-parent-writes__init.js

`kogen init` refuses, before it writes anything, when a symbolic link sits at a file it would write (existing behavior) or at a directory above that file inside the checkout, such as `.kogen` being a symlink to a directory outside the checkout. Today only the final path is inspected with `os.Lstat`, so a symlinked `.kogen` whose target directory lacks `project.yaml` or `models.yaml` passes the check and the writes create files outside the checkout. The refusal names the offending symlinked path (for example `.kogen`) and leaves the symlink, the contents of the directory it points to, the repository working tree and HEAD unchanged.

Boundaries: which files init writes and how regular write targets (regular files and regular directories) are handled do not change; a symlinked final target is still refused as before. The only production edit is in `setup/init_integrity.go` (`initRefuseSymlinks`, already called by `initRun` before any write); the regression test goes in `setup/init_integrity_test.go`. Nothing is removed, and there is no flag, setting or environment variable.

## Decisions
- Extend the existing `initRefuseSymlinks(root, paths)` in setup/init_integrity.go so that for each write path it `os.Lstat`s every component from the checkout root down to the final path (`.kogen`, then `.kogen/project.yaml`), stops at the first component that does not exist, and refuses at the first symbolic link it meets, whether a directory or the file itself. No new function, call site or option is added. (decision: D1, round 1) (evidence: setup/init_integrity.go; setup/init.go) (source: request)
- The refusal keeps the existing form `sys.Fail("environment", "symlink_target", ..., 5)` and its text begins with the repository-relative path of the symlinked component that was found (`.kogen is a symbolic link; init does not write through it, ...`), so the diagnostic identifies `.kogen` and not the file below it. The exit code and wording beyond naming that path and saying it is a symbolic link are not asserted by acceptance. (decision: D2, round 1) (evidence: setup/init_integrity.go; setup/init_integrity_test.go) (assumption: the request does not specify exit code or wording beyond identifying .kogen) (source: request)
- Any symlinked parent is refused, including one that points inside the checkout; the request says to refuse init before it writes through a symlinked parent directory and names no exemption. (decision: D3, round 1) (assumption: a symlinked parent that resolves inside the checkout is also refused) (source: request)
- The checked paths stay those the current call site passes (`.kogen/project.yaml`, `.gitignore`, and `.kogen/models.yaml` only when it is not already readable); `features/steps/README.md` is not added because the request says changing which files init writes is out of scope. (decision: D4, round 1) (evidence: setup/init.go) (source: request)
- Acceptance runs the real standalone command built from `./cmd/kogen-setup` on temporary Git repositories, in the same way as the existing symlink-target Intent, so no model request is needed: the refusal precedes the login step. The symlinked `.kogen` is exercised both untracked and tracked, with an empty and a non-empty outside directory. (decision: D5, round 1) (evidence: .kogen/intents/init-refuse-symlink-write-targets/acceptance.feature; cmd/kogen-setup/main.go) (source: request)
- A regular `.kogen` directory still initializes and a symlinked `.gitignore` is still refused; both are asserted in acceptance so that rejecting every path beneath a directory, or allowing a symlinked final target, fails. (decision: D6, round 1) (source: request)

## Source comparison
- Addressed: expected behavior (refuse init before writing through a symlinked parent directory and report the offending path) by the component-wise check in `initRefuseSymlinks`; the error names `.kogen`.
- Addressed: acceptance 1 (`.kogen` a symlink to an outside directory, write target absent there, nothing created outside) by scenarios 1 and 2; the wrong implementation that checks only the final path is rejected by the refusal step.
- Addressed: acceptance 2 (diagnostic identifies `.kogen`; symlink, outside directory contents, repository status and HEAD unchanged) by the diagnostic, outside-directory and repository-state steps of scenarios 1 and 2; a generic refusal, a partial write into the repository and a partial write outside are rejected by them.
- Addressed: acceptance 3 (symlinked final targets and regular targets keep working) by scenarios 3 and 4 and by the existing Go tests TestInitRefusesSymlinkedGitignoreBeforeWriting, TestInitRefusesSymlinkAtOtherWriteTarget and TestInitRegularWriteTargetsStillCommitted; rejecting all paths beneath a directory or allowing a symlinked final target is rejected.
- Omitted by scope: which files init writes, regular target handling, commit-failure recovery.

## Tests
- A symlinked `.kogen` to an outside directory is refused before anything is written, the error names `.kogen`, and the symlink, the outside directory, status and HEAD are unchanged, untracked and tracked: TestInitRefusesSymlinkedParentDirectory in setup/init_integrity_test.go (integration)
- Symlinked final write targets stay refused: TestInitRefusesSymlinkedGitignoreBeforeWriting and TestInitRefusesSymlinkAtOtherWriteTarget in setup/init_integrity_test.go (existing)
- Regular write targets still initialize and are committed: TestInitRegularWriteTargetsStillCommitted in setup/init_integrity_test.go (existing)
- The refusals and the unchanged regular path through the real command: the four scenarios of acceptance.feature (scenario)
- none: the request processes no collection of records, so no record-count scenario applies; the check visits at most the few path components of three fixed write targets.

## Feasibility
- none
