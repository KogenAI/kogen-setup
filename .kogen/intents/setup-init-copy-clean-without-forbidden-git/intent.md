# Clean the init copy without forbidden Git commands

Slug: setup-init-copy-clean-without-forbidden-git
Model: not applicable — the change replaces one cleanup mechanism; it adds no state or interacting rules
Acceptance:
- .kogen/intents/setup-init-copy-clean-without-forbidden-git/acceptance.feature
- features/steps/setup-init-copy-clean-without-forbidden-git__steps.js

kogen init stops with `controller/internal_error: git command not allowed: git clean` (exit 70) after its checks. Function `clean` of `initCheckGuard` in setup/init.go builds the git --git-dir and --work-tree options, then clean -ffdx (plus `-e` excludes) and runs it through the kogen-coordinator guarded runner (`repo.Observing().RunEnv`); init still cleans the init copy with `git clean -ffdx` today. The coordinator guard at e643661cb646 (the release tuple) makes `Repo.Run`, `RunEnv`, `OK` and `OKEnv` refuse `clean`, `restore`, `symbolic-ref`, `worktree` and `remote`. The guard stays as it is. After a check run, init must still remove what the check created in the init copy (untracked and ignored files and directories, except the paths in `g.ignored`), recreate the directories in `g.dirs`, and restore the tracked files from the snapshot, without sending `clean`, `restore`, `reset`, `checkout`, `symbolic-ref`, `worktree` or `remote` through the guarded runner. kogen-setup does not call the guarded runner with any of the five newly forbidden commands anywhere else. kogen-setup's go.mod must pin kogen-coordinator at v0.0.0-20261118001611-e643661cb646 (the release tuple's e643661cb646) or newer so its package tests run the guard that ships. All init output and behavior stay the same: the same progress lines, left-out checks and refusals. No change to kogen-coordinator, kogen-shaping, kogen-loop or the kogen CLI; no new flag, setting or environment variable; nothing in the user's real repository is read or written differently.

The cleanup tests run as `go test ./setup -run TestInitCheckCleanup`, against the coordinator guard of e643661cb646 or newer.

Release evidence the report must state: on main with the pinned newer coordinator, the existing TestInitCheckCleanupUsesBaselineIgnoreRules fails (init exits 70 with `git command not allowed: git clean`); after the change it and the new tests pass. The four release scenarios (spec/features/01-project-setup.feature lines 44, 75, 114, 125 of the kogen assembly) cannot be run by the Build.

## Decisions
- The cleanup is a Go walk of the init copy that skips `.git`, replacing the `git clean` call; `clean` takes only the clone path. A walk was chosen over `s.Run` because it needs no Git at all, so nothing can reach the guarded runner and the guard's list of commands cannot matter again. Entries: remove non-directory entries not in `g.paths` and not in `g.ignored`; `os.RemoveAll` directories not in `g.dirs` and not protected; skip protected ignored paths (`g.ignored`, trailing `/` trimmed) and `.git`; then recreate `g.dirs` and restore changed tracked files exactly as before. (evidence: setup/init.go) (source: request)
- go.mod pins github.com/KogenAI/kogen-coordinator v0.0.0-20261118001611-e643661cb646; offline `go mod tidy` with the module cache succeeds and also moves kogen-loop to v0.0.0-20261111104243-16bc90355dfb and go.sum accordingly, so no test runs against the old guard. (evidence: go.mod; go.sum) (source: request)
- New tests live in setup/init_check_cleanup_test.go and use the initNewFx fixtures through Init: TestInitCheckCleanupRestoresTheCopy, TestInitCheckCleanupSendsNoForbiddenGitCommand (a `git` wrapper on PATH records calls carrying `--git-dir=`, i.e. the repo-bound runner, and the real guard must not refuse), TestInitCheckCleanupKeepsProtectedIgnoredPaths. (evidence: setup/init_test.go; setup/init_check_isolation_test.go) (source: request)
- Existing tests TestInitCheckCleanupOnRejectionAndSuccess and TestInitCheckCleanupUsesBaselineIgnoreRules stay and run against the newer guard. (evidence: setup/init_check_isolation_test.go) (source: request)

## Source comparison
- Expected 1 (cleanup behavior without forbidden commands): addressed by the Go walk and TestInitCheckCleanupRestoresTheCopy and TestInitCheckCleanupKeepsProtectedIgnoredPaths.
- Expected 2 (guard untouched, no forbidden command anywhere else): addressed by TestInitCheckCleanupSendsNoForbiddenGitCommand and an acceptance source scan.
- Expected 3 (go.mod pin): addressed; acceptance checks the pseudo-version.
- Expected 4 (output unchanged): the existing init tests stay unchanged and pass.

## Tests
- The cleanup restores the init copy after a check: TestInitCheckCleanupRestoresTheCopy (integration)
- The cleanup sends no forbidden Git command and the shipped guard accepts it: TestInitCheckCleanupSendsNoForbiddenGitCommand (integration)
- Protected ignored paths survive the cleanup, other ignored files go: TestInitCheckCleanupKeepsProtectedIgnoredPaths (integration)
- Existing init cleanup and output behavior is unchanged: TestInitCheckCleanupOnRejectionAndSuccess and TestInitCheckCleanupUsesBaselineIgnoreRules (existing)

## Feasibility
- Offline `GOFLAGS=-mod=mod GOPROXY=off go mod tidy` with the coordinator bumped succeeded; the existing TestInitCheckCleanupUsesBaselineIgnoreRules then failed on the old init.go, and with the Go-walk cleanup the five TestInitCheckCleanup tests passed in a scratch copy. (probe: scratch run, exit 0)
- Controls are deferred: the correct implementation spans go.mod, go.sum, setup/init.go and a test file, and the shaping budget ran out before its controls could be written; the Build writes it.
