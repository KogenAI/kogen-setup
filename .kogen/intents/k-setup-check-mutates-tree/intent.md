# Reject init checks that mutate tracked files

Slug: k-setup-check-mutates-tree
Model: .kogen/intents/k-setup-check-mutates-tree/model.qnt invariants=Clean,NoFixer seed=1 samples=10 steps=5
Acceptance:
- .kogen/intents/k-setup-check-mutates-tree/acceptance.feature
- features/steps/check_mutation.js

In setup/init.go, change initVerify's candidates.Checks loop from exit-status-only admission to admission requiring exit 0 and unchanged tracked content. Compare the copy immediately before and after each successful check using the existing initTreeState mechanism, restricted to tracked paths; its current inclusion of untracked paths is appropriate for setup repeatability and must not cause new check rejections. Preserve setup's existing SET-12 behavior. Restore tracked content after a mutating check before running later checks, preserving the state immediately before that check rather than blindly restoring HEAD (setup may have deliberately changed tracked content). Do not modify the user's working files or index. New untracked files, including non-ignored scratch.log, and ignored output folders do not count.

Keep each nonmutating check exactly as today, in proposal order, with identical commands and committed configuration. Keep existing failure exit handling, output for other lines, and init exit codes. A successful check that changes tracked content is omitted from Checks and project.yaml, with a Left out entry `<name> (<command>) changed <paths>`. Sort paths lexically, show at most five, and append `, ...` when more exist. Deletion of tracked content counts as a change. No new settings or provider interactions.

## Decisions
- Keep successful checks that create ignored build output or append to untracked scratch.log; reject successful tracked-file rewrites and isolate later checks. (source: request)

## Source comparison
- Addressed: request problem and owning location setup/init.go initVerify candidates.Checks; the admission rule above replaces exit-0-only admission, without changing setup repeatability.
- Addressed: synthetic README.md, tracked a.txt containing x, fmt `echo y > a.txt`, ok `true`, build `mkdir -p out && echo z > out/b.txt`, out/ ignore, ok2 `test "$(cat a.txt)" = x`, and append-only scratch.log are executable in acceptance scenario one and its real Init fixture. The resulting Checks, Left out and loaded committed project.yaml are observed together.
- Addressed: sorted capped paths are executable in scenario two; five paths and the suffix are technical settlement of the unspecified small cap, not a change in requested scope.
- Addressed: other stdout, exit codes and existing configuration behavior remain governed by existing init/contract tests and the preservation requirements above; no requested behavior is omitted or superseded.
- Boundaries: no project.yaml or acceptance runner changes are necessary; only production setup code and ordinary implementation regression tests should change. Acceptance uses a temporary source copy and the existing contract fixture's synthetic loopback provider, never live authentication.

## Tests
- Reject successful tracked rewrites and name their paths while omitting them from configuration: supplied fmt fixture through setup.Init (regression)
- Keep true, ignored build output and non-ignored untracked append commands in order: supplied acceptance fixture through setup.Init (integration)
- Restore the pre-check tracked state so ok2 passes after fmt: supplied acceptance fixture and an implementation integration regression covering a setup-modified pre-check baseline (integration)
- Sort and cap the mutation path list at five with a truncation marker only above five: acceptance six-path fixture plus implementation tests for exactly five and fewer paths (integration)
- Preserve existing stdout, exit codes, committed configuration for unchanged checks and existing setup behavior: existing setup and contract suites unchanged (existing)

## Feasibility
- Existing initTreeState observes status against the original Git directory and copy worktree and hashes changed regular content; the implementation must filter tracked paths for checks without altering setup semantics. No external protocol or library change is needed.
- Quint typecheck and run passed after renaming the reserved identifier next to cursor (probe: exit 0, 0.9 s). The model abstracts each completed check as an admission/restoration transition; check 0 is the mutator and later checks are unchanged.
- evidence: {"id":"comparison-controls","kind":"observer","inputs":["features/steps/check_mutation.js"],"observers":["features/steps/check_mutation.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/check_mutation.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/check_mutation.js bad","exit":1,"output":"rejected\n"}]}
