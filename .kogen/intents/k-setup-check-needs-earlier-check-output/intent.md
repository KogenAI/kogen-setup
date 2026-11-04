# Isolate init check verification outputs

Slug: k-setup-check-needs-earlier-check-output
Model: .kogen/intents/k-setup-check-needs-earlier-check-output/model.qnt invariants=CleanBetweenChecks seed=17 samples=100 steps=20
Acceptance:
- .kogen/intents/k-setup-check-needs-earlier-check-output/acceptance.feature
- features/steps/k-setup-check-needs-earlier-check-output__verify.js

Change setup/init.go's initVerify checks loop so each candidate starts with the same post-setup copy (including acceptance-runner preparation). Restore check-created and check-modified untracked files after the candidate finishes, removing new paths and restoring preexisting contents and kinds. Restore tracked paths as today, including on failed checks. Cleanup applies to successful verification and all early rejection paths: first/second failure, tracked mutation and no-tests rejection. Keep the two runs of a single candidate consecutive on the same state; restore after the candidate, not between its runs. New untracked output alone is not a reason to reject a passing check.

Do not change setup behavior, fixers, kept-check order or output wording. Preexisting ignored dependency folders, such as installed packages, must not be touched by cleanup; do not indiscriminately git clean ignored folders or replace the whole tree in a way that touches these dependencies. Preserve tracked mutation rejection. The model abstracts a whole candidate's execution as the running phase and cleanup as its exit; dirty state cannot cross candidate boundaries.

## Decisions
- A check enabled only by an earlier check's outputs is omitted with the usual `<name> (<command>) failed with status <n>` reason. (source: request)
- Both runs of a candidate retain their existing repeatability semantics; isolation is between candidates. (source: request)
- Existing ignored dependency folders are excluded from cleanup, while new output paths and preexisting nonignored untracked files are restored. (source: request)

## Source comparison
- addressed: Request Problem and Need, owning file setup/init.go/initVerify/checks: replace tracked-only cleanup with per-candidate restoration in the outcome above; do not broaden initTreeState globally in a way that changes setup repeatability.
- addressed: Synthetic acceptance literals README.md, gen=`mkdir -p out && echo ok > out/gen.txt`, use=`test -f out/gen.txt`, plain=`test -f README.md`, status 1 and reversed gen/use order are preserved in acceptance.feature's outline; both orders keep exactly gen, plain.
- addressed: Need's untracked restoration, both runs and preexisting ignored dependency protection are exercised by the remaining scenarios. Preserve setup/fixers/output via existing init tests as well as the exact summary assertions.
- omitted: No requested product behavior is deliberately omitted or superseded. No provider/network integration changes are needed; local initNewFx exercises the real Init entry point using the repository's existing synthetic proposal transport.

## Tests
- Isolate successful check outputs in both supplied orders: generator/use/plain outline through Init (regression)
- Restore modified setup-created files and new files after a first-run failure while retaining installed ignored dependencies: setup restoration scenario (integration)
- Retain consecutive runs and clean outputs after second-run failure: once/plain scenario (regression)
- Restore after tracked mutation and no-tests rejection as well as success: add focused init fixture integration cases covering these exits (integration)
- Preserve setup, fixers, output lines and existing tracked restoration: existing init tests and go build ./... && go vet ./... && go test -race -count=1 ./... (existing)

## Feasibility
- Quint model typechecked successfully with the installed Kogen Quint (probe: exit 0, 0.4 s).
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-check-needs-earlier-check-output__verify.js"],"observers":["features/steps/k-setup-check-needs-earlier-check-output__verify.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-needs-earlier-check-output__verify.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-needs-earlier-check-output__verify.js --control bad","exit":1,"output":"rejected\n"}]}
