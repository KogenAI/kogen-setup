# Remove new init directories after a failed write

Slug: fix-k-setup-written-config-matches-verified
Model: not applicable — a one-shot filesystem cleanup on one failure path, with no interacting rules or transitions worth modelling
Acceptance:
- .kogen/intents/fix-k-setup-written-config-matches-verified/acceptance.feature
- features/steps/fix-k-setup-written-config-matches-verified__failed-write.js

This responds to a review finding on the landed commit 553ac40 (`k-setup-written-config-matches-verified`). It said that `initConfigure` (setup/init.go) restores its snapshot only when the written configuration fails to parse or compare. If `initWriteFiles` fails partway, the finding said, the files it already wrote stay on disk and the new directories are never removed.

The finding reproduces only in part on current main (7cd03be):
- Commit aeeb5be ("Move init lineups to the models file") already makes `initConfigure` call `initRestore(root, saved)` when `initWriteFiles` fails (setup/init.go lines 308-313). A real failed write on main removes the files the attempt wrote: `.kogen/project.yaml` is gone afterwards. That part of the finding does not reproduce, and the requested change "Call `initRestore` on write failure too" is already in place. It must stay.
- The rest does reproduce. `initRestore` restores and removes only files. The directories that `initWriteFiles` created with `os.MkdirAll` stay behind. After a failed write in a repository with no `.kogen`, an empty `.kogen/` directory remains.

What changes: the snapshot also records the directories that did not exist. For each snapshotted path, `initSnapshot` records each of its ancestor directories under root that does not exist yet (for example `.kogen` for `.kogen/project.yaml` and `.kogen/models.yaml`, and `features` and `features/steps` for `features/steps/README.md`). After `initRestore` has restored and removed the files, it removes those recorded directories, deepest first and each one only once:
- A recorded directory that is not empty after the files are restored stays in place. This does not make the restore fail.
- A recorded directory that is already gone is not an error.
- A directory that existed before the snapshot is never removed, even when it is empty.

This applies wherever `initConfigure` already calls `initRestore`: a failed write, and a written configuration that fails to parse or differs from the verified one. `initConfigure` keeps returning the original write error unchanged, with the existing `; restoring files: ...` suffix only when the restore itself fails. Through the standalone `kogen-setup` command, Init's exit code stays 70 and the result still reports `configuration` null. It prints no `Initialized Kogen` or `Commit:` line, and HEAD and the index stay unchanged.

Out of scope:
- The existing commit-failure recovery: files are deliberately left for the leftover commit, so no restore happens there.
- The first-commit path for a repository with no commits (`head == ""`), which takes no snapshot.
- Any other Init behavior.

## Decisions
- No UI/UX choice is open. Init's printed output and exit code on a failed write are unchanged. (source: request)

## Source comparison
- Addressed: "add a test that fails on current main for exactly this scenario". Acceptance builds `./cmd/kogen-setup` (the README's standalone entry point) and runs it on a fixture checkout. A local scripted provider answers with one `submit_configuration` call that proposes nothing. The fixture makes Init's `.gitignore` write fail after Init has created `.kogen` and written `.kogen/project.yaml`. Observed on main: process exit 70, JSON `exit` 70, error `open {repo}/.gitignore: no such file or directory`, `configuration` null, no `Initialized Kogen`, one provider request, `.kogen/project.yaml` removed, empty `.kogen` directory still present, status clean, HEAD unchanged. Scenario 1 fails on main only because `.kogen` remains. The Build's Go regression test must reproduce the same failure.
- Partly not reproduced, reported: "The snapshot is restored only on parse or compare failure" and "the files it already wrote stay on disk" do not hold on main, because aeeb5be added `initRestore` on write failure. "Call `initRestore` on write failure too" is already true and must stay. "Test a failed write" is addressed by scenarios 1 and 2 and the Go regression test.
- Addressed: "the new directories are never removed". `initRestore` removes the directories the snapshot recorded as missing.
- Addressed: "Keep every existing test green; no unrelated changes". Scenario 3 runs `go test ./setup -count=1`, and the configured checks run `go test ./...`. Only setup/init.go, setup/init_integrity.go and setup tests may change.
- Omitted: when `.gitignore` is a symlink to a missing target, the fixture's restore removes that symlink. This happens because the existing snapshot uses `os.Stat`. The finding does not raise it, it is unchanged here, and acceptance does not observe `.gitignore`.
- Omitted: the historical provider, Studio and cache notes in the testing rules concern unrelated systems.

## Tests
- A write that fails partway removes the files it wrote and the directories it created, and keeps Init's error, exit 70, no success output, clean status and unchanged HEAD: add a Go regression test in `setup` using `initNewFx(t, true, initNothing())`. It commits README.md, lists `.gitignore` in `.git/info/exclude`, and makes `.gitignore` a symlink to `<base>/missing/gitignore`. The test asserts that Init fails with the `.gitignore` write error, `.kogen/project.yaml` and the `.kogen` directory are absent, `git status --porcelain` is empty and HEAD is unchanged. It fails on current main. Acceptance scenario 1 covers the same rule through `kogen-setup`. (regression)
- A directory that existed before the snapshot stays after a failed write, even when it is empty: the same Go test with an empty `.kogen` directory created before Init, plus acceptance scenario 2. (regression)
- Nested new directories are removed deepest first, and a new directory that still holds other content stays without a restore error: extend the snapshot/restore tests in setup/init_integrity_test.go. Snapshot `features/steps/README.md` where `features` is missing, create and write it, then restore. Assert that `features` is gone. Then repeat with an extra file left in `features` and assert that the restore returns nil and `features` keeps that file. (unit)
- Write-failure restore of existing files, parse/compare-failure rollback, and commit-failure recovery stay as they are: existing tests (`TestIntegrityRestoreExistingFiles`, the init tests) and acceptance scenario 3. (existing)

## Feasibility
- Reproduced on unchanged main by running this step file's own fixture once outside Cucumber, with a stub for the Cucumber module. It built `./cmd/kogen-setup` and ran it against the local scripted provider (exit 0 overall).
  - With no `.kogen` before Init the outcome is `{"code":70,"exit":70,"error":"open {repo}/.gitignore: no such file or directory","configuration":null,"initialized":false,"requests":1,"paths":{".kogen":true,".kogen/project.yaml":false,".kogen/models.yaml":false,"features":false},"status":"","headUnchanged":true}`.
  - With an empty `.kogen` before Init the outcome is identical.
  - An earlier in-package Go probe of the same fixture showed that stderr ended at `kogen: checking the acceptance runner`, so verification completed and the write failed.
- evidence: {"id":"failed-write-observer","kind":"observer","inputs":["features/steps/fix-k-setup-written-config-matches-verified__failed-write.js"],"observers":["features/steps/fix-k-setup-written-config-matches-verified__failed-write.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-written-config-matches-verified__failed-write.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-written-config-matches-verified__failed-write.js bad","exit":1,"output":"rejected\n"}]}
