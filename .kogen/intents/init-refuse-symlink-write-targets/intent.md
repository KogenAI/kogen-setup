# Refuse init writes through symlinked targets

Slug: init-refuse-symlink-write-targets
Model: not applicable — the change is a single precondition check before init writes files and has no state or transitions
Acceptance:
- .kogen/intents/init-refuse-symlink-write-targets/acceptance.feature
- features/steps/init-refuse-symlink-write-targets__init.js

`kogen init` writes `.kogen/project.yaml`, `.kogen/models.yaml` (only when it does not exist yet) and `.gitignore` with `os.WriteFile`, which follows a symlink at the target path and so can modify a file outside the checkout. Init must instead refuse when a symbolic link sits at a file it would write. The refusal happens before init writes any setup file, names the offending path in the error, and leaves the symlink, the file it points to, and the repository state (HEAD, working tree, untracked files) unchanged. Regular target files initialize and are committed exactly as before.

Boundaries: files init does not write keep their current symlink behavior (for example an existing `.kogen/models.yaml`, which init only reads, may still be a symlink to an existing file, and a `features/steps/README.md` symlink is untouched). Commit-failure recovery (`initRestore`, `initSnapshot` and the leftover-commit path) is not changed. Nothing is replaced or removed, and there is no flag, setting or environment variable.

## Decisions
- Add one helper `initRefuseSymlinks(root string, paths []string) error` in setup/init_integrity.go that `os.Lstat`s each path under the checkout root, skips a missing path and fails with a `sys.Fail("environment", "symlink_target", ...)` error whose text begins with the offending repository-relative path (for example `.gitignore is a symbolic link; init does not write through it, ...`) and whose exit code is 5, the same as the other environment refusals. (evidence: setup/init_integrity.go; setup/init.go) (source: request)
- Call the helper once in `initRun` in setup/init.go, after the "already initialized" return and before the dirty-path and `no_commits` checks, so it precedes every path that writes (the first-commit path, the leftover-commit path and `initConfigure`) and runs before any login, model request or file write. (evidence: setup/init.go) (source: request)
- The checked paths are `.kogen/project.yaml` and `.gitignore` always, and `.kogen/models.yaml` only when it does not already resolve to an existing file (`!modelsExist`), because init writes it only then (a dangling tracked symlink makes `os.Stat` report not-exist, so init would write through it); `features/steps/README.md` is not checked because init skips it when anything exists at that path. (evidence: setup/init.go) (source: request)
- Only a symlink at the file path itself is refused; a symlinked parent directory such as `.kogen` is not part of this request. (assumption: the request names symlinks at target file paths only) (source: request)
- The exit code 5 and the class, reason and wording of the refusal are this Intent's own choice and are not asserted by acceptance: acceptance asserts a nonzero exit and that the error text names the path. (assumption: the request does not specify the exit code or message wording) (source: request)
- Acceptance drives the real standalone command built from `./cmd/kogen-setup` on temporary Git repositories (the contract of its JSON result and exit is the existing one), with symlinks to files in a directory outside the repository, so it needs no model request: the refusal precedes the login/model step. Untracked symlinks are exercised on a repository without commits and tracked symlinks on a repository with one commit. (evidence: cmd/kogen-setup/main.go; features/steps/cmd-entry.js) (source: request)
- Add Go regression tests in setup/init_integrity_test.go next to the existing integrity tests, using the file's existing temporary-repository fixtures, for the three rules below. (evidence: setup/init_integrity_test.go) (source: request)

## Source comparison
- Addressed: expected behavior (init never writes through a symlink at a target file path) by the early `initRefuseSymlinks` check, covering `.gitignore`, `.kogen/project.yaml` and a `.kogen/models.yaml` that init would write.
- Addressed: acceptance 1 (symlinked `.gitignore` refused before any setup file is written, error names `.gitignore`, symlink and target unchanged) by the first two scenarios; the wrong implementation that detects the symlink after writing the configuration is rejected by the `no setup file was written` step.
- Addressed: acceptance 2 (a symlink at another written file is refused, target and repository unchanged) by the `.kogen/models.yaml` scenario; checking only `.gitignore` is rejected by it.
- Addressed: acceptance 3 (regular files initialize and are committed as before) by the last scenario; refusing regular files is rejected by it.
- Omitted by scope: symlink behavior for files init does not write, and commit-failure recovery.

## Tests
- A symlinked `.gitignore` is refused before the configuration is written, the error names `.gitignore`, and the symlink, its target and the repository are unchanged: TestInitRefusesSymlinkedGitignoreBeforeWriting in setup/init_integrity_test.go (integration)
- A symlink at another file init would write (`.kogen/models.yaml`) is refused with its target and the repository unchanged, while an existing `.kogen/models.yaml` symlink to an existing file stays accepted: TestInitRefusesSymlinkAtOtherWriteTarget in setup/init_integrity_test.go (integration)
- Regular target files still initialize and are committed: TestInitRegularWriteTargetsStillCommitted in setup/init_integrity_test.go (integration)
- The refusals and the unchanged regular path through the real command: the four scenarios of acceptance.feature (scenario)

## Feasibility
- none
