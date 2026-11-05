# Restore deleted print-only runs-nothing cases

Slug: fix-k-setup-check-installs-dependencies
Model: not applicable — a test-only coverage restoration of pure command validation has no meaningful state
Acceptance:
- .kogen/intents/fix-k-setup-check-installs-dependencies/acceptance.feature
- features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js

Commit e91f631 ("Refuse dependency installation in checks", Intent k-setup-check-installs-dependencies) made `initRunsNothing(command, printIsNothing)` stop treating `echo`/`printf` parts as no-ops for checks (`printIsNothing=false`), while setup and fix keep `printIsNothing=true`. In `TestInitValidateRunsNothing` (setup/init_test.go) it flipped some print-only check cases to accepted, but deleted two cases instead of flipping them: `{"echo ok && exit 0", true}` and `{"printf '%s' ok; true || : | echo done; exit 0", true}`. Those were the only check cases in that test where a print is combined with other no-op parts (`&& exit 0`, `; true || : | ... ; exit 0`), so that part of the check print-only rule is no longer asserted.

Reproduced on current main (8794fc7), by mutating only the `case "echo", "printf":` branch of `initRunsNothing` in setup/init.go in a scratch copy:
- `valid = printIsNothing || strings.Contains(command, "&&")` makes the check `echo ok && exit 0` report "runs nothing" again.
- `valid = printIsNothing || strings.Contains(command, "; exit 0")` makes the check `printf '%s' ok; true || : | echo done; exit 0` report "runs nothing" instead of "ignores its own failure".
With either mutation (and with both), `go test ./setup -run '^TestInitValidateRunsNothing$'` and the whole `go test ./... -count=1` suite stay green. The finding reproduces.

The fix is test-only: restore both cases in `TestInitValidateRunsNothing` with the expectations current main produces for them as checks, so the test fails under these mutations and passes on main. Validated on main through `Validate(map[string]any{"checks": initCheckList("a", command)}, InitContext{})`:
- `echo ok && exit 0` → no problems (`[]`).
- `printf '%s' ok; true || : | echo done; exit 0` → exactly `["check a (printf '%s' ok; true || : | echo done; exit 0) ignores its own failure"]`.

No production code changes: setup/init.go and every other non-test file stay unchanged. No other test changes beyond what restoring these two cases in `TestInitValidateRunsNothing` requires.

The acceptance runs no test by name. It copies `go.mod`, `go.sum` and `setup/` to a temporary directory and runs `go test ./setup -count=1` three times: on the unmodified tree, which must pass (`ok  	github.com/KogenAI/kogen-setup/setup`), and with each of the two mutations above applied to the line `				valid = printIsNothing` in setup/init.go. Each mutated run must fail a test (`--- FAIL: Test...`, not a build failure).

## Decisions
- Restore exactly the two deleted commands, `echo ok && exit 0` and `printf '%s' ok; true || : | echo done; exit 0`, as check cases in `TestInitValidateRunsNothing` with their new expectations instead of the old "runs nothing" rejection. (source: request)
- Each restored case runs as a subtest named by its command through the test's existing `t.Run(tc.command, ...)` and validates check name `a` via `initCheckList("a", tc.command)`, like the other cases. (source: request)
- `echo ok && exit 0` must assert that there are no problems. `printf '%s' ok; true || : | echo done; exit 0` must assert the exact problem list `["check a (printf '%s' ok; true || : | echo done; exit 0) ignores its own failure"]`. Checking only the problem count is not enough: the test must fail when the command is reported as "runs nothing". The test's current `reject bool` table can't express this expected diagnostic, so the Build may restructure the table, e.g. with an expected-problem field compared with `reflect.DeepEqual`. Every existing case must keep its current command, subtest name and expectation, and the trailing setup/fix assertion must stay as it is. (source: request)

## Source comparison
- Addressed: "Two cases (`echo ok && exit 0` and the printf/true one) were deleted instead of flipped". The printf/true one is the deleted `printf '%s' ok; true || : | echo done; exit 0` from commit e91f631. Both are restored per Decisions.
- Addressed: "First show it … show the stated requirement is no longer asserted". The reproduction above (mutations leave the setup tests green on main) is encoded as the two mutation scenarios. They fail on current main and pass once the cases are restored with their exact expectations.
- Addressed: "Restore them with the new expectations". The expectations come from current main's actual Validate output (no problems; exactly the ignores-its-own-failure problem).
- Addressed: "Keep every existing test green; no unrelated changes". Both scenarios require `go test ./setup` to pass on the project. The configured checks (gofmt, go build, go vet, go test ./...) cover the rest. Production code is untouched.
- Omitted: nothing from the request.

## Tests
- A check that prints and then exits 0 (`echo ok && exit 0`) is accepted with no problems, not "runs nothing": restore the case in TestInitValidateRunsNothing; acceptance scenario with the `&&` print mutation (regression)
- The check `printf '%s' ok; true || : | echo done; exit 0` reports exactly "check a (…) ignores its own failure", not "runs nothing": restore the case in TestInitValidateRunsNothing with the exact problem list; acceptance scenario with the `; exit 0` print mutation (regression)
- Existing runs-nothing, setup/fix, failure-mask and install validation behavior is unchanged: existing TestInitValidateRunsNothing cases, TestInitValidateSetupFixRunsNothing, TestInitValidateFailureMasks, TestValidateCheckInstallsDependencies and the configured go test ./... (existing)

## Feasibility
- Reproduction on main 8794fc7 in a scratch copy: both print mutations of setup/init.go leave `go test ./setup -run '^TestInitValidateRunsNothing$' -count=1` and `go test ./... -count=1` green. The observer controls replace `TestInitValidateRunsNothing` in a temporary copy only. The good control is a body with both cases restored and exact expectations: `go test ./setup` passes unmutated and fails under each mutation. bad-and has a weak `echo ok && exit 0` case and stays green under the `&&` mutation. bad-exit checks only the printf case's problem count and stays green under the `; exit 0` mutation. Run against the final step bytes in scratch: good accepted (69.5 s), bad-and rejected (47.6 s), bad-exit rejected (72.5 s).
- evidence: {"id":"and-mutation-observer","kind":"observer","inputs":["features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js"],"observers":["features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js --control bad-and","exit":1,"output":"rejected\n"}]}
- evidence: {"id":"exit-mutation-observer","kind":"observer","inputs":["features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js"],"observers":["features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-check-installs-dependencies__runs-nothing.js --control bad-exit","exit":1,"output":"rejected\n"}]}
