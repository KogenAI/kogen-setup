# Read common runners' reports in the no-tests rule

Slug: setup-init-no-tests-covers-common-runners
Model: not applicable — this is a stateless classification of captured check output
Acceptance:
- .kogen/intents/setup-init-no-tests-covers-common-runners/acceptance.feature
- features/steps/setup-init-no-tests-covers-common-runners__runners.js
- features/steps/setup-init-no-tests-covers-common-runners__driver/driver_test.go.txt

In setup/init.go, `kogen init` keeps a check in `.kogen/project.yaml` that ran no tests only when its output is one of five report forms (`initNoTestsRE`: a Go `[no test files]` line, `0 tests, 0 failures`, `Ran 0 tests`, `No tests found`, `0 passing`), and `initPositiveTestsRE` counts only the plural forms `N tests`, `Ran N tests` and `N passing` plus Go `ok` and `PASS` lines. So an empty Minitest check such as `bin/rails test` is kept, and a check that ran one test can be thrown out. Widen `initRanNoTests` (the classifier applied to the output of each of the two runs of a check) so that the reports of the common Minitest/Rails, RSpec, Cargo and Go runners are read and singular counts are positive evidence. The rule stays: positive evidence anywhere in the output wins, empty and unrecognized output stay eligible, nothing is inferred from the command text.

No-test reports (true only when the output holds no positive evidence): the five existing forms, plus `0 runs, 0 assertions` (any trailing counts), `0 examples, 0 failures`, `running 0 tests`, and a Go package line that starts with `ok` and ends in `[no tests to run]`.

Positive evidence: every count above zero of `tests`, `examples` and `runs`, singular or plural (`1 test`, `1 example`, `1 run`, `Ran 1 test`, `12 examples`), `N passing`, every Go `ok` line except one that ends in `[no tests to run]`, and every `PASS` line.

The left-out wording, `Checks: none passed`, which checks are left out for failure, timeout or mutation, the setup and fix commands (not classified), the configuration written and exit codes are unchanged for any run that does not hit the new forms. No new setting, no command-text inference. The change stays in setup/init.go and its tests.

The builder adds the model-free Go test file setup/init_no_tests_runners_test.go, next to init_no_tests_test.go, with TestInitNoTestsRunnersMinitest, TestInitNoTestsRunnersRSpec, TestInitNoTestsRunnersCargo, TestInitNoTestsRunnersGoNoTestsToRun, TestInitNoTestsRunnersSingularCounts (each calling `initRanNoTests` directly with the cases of the matching scenario in acceptance.feature) and TestInitNoTestsRunnersBothRuns (the init fixture of TestInitRejectsSecondRunMutationAndNoTests: initNewFx, initSubmit, initCheckList, f.write, f.commitAll, f.mustRun, initWantLines). Every case of the existing table in setup/init_no_tests_test.go keeps its answer.

## Decisions
- Keep one rule for all runners: no-test regexes widened, positive evidence wins, and the Go `ok` lines are judged line by line because a regular expression cannot exclude `[no tests to run]`. (decision: D1, round 1) (evidence: setup/init.go; setup/init_no_tests_test.go) (source: request)
- Acceptance drives the unexported classifier and the init fixtures from a scratch copy of the checkout in which the step adds its own driver test file, so acceptance depends on no test name the build must invent. (decision: D2, round 1) (evidence: features/steps/left-out-output.js; features/steps/left-out-driver.go.txt) (source: request)
- No new setting, flag or command-text inference; the second run of a check is classified like the first. (decision: D3, round 1) (evidence: setup/init.go; .kogen/intents/k-setup-check-ran-no-tests/intent.md) (source: request)

## Source comparison
- Addressed: Expected 1 (Minitest `0 runs, 0 assertions`, RSpec `0 examples, 0 failures`, Cargo `running 0 tests`, Go `ok ... [no tests to run]` as no-test reports) by scenarios Minitest and Rails, RSpec, Cargo with doc-tests and Go test filter that matches nothing.
- Addressed: Expected 2 (singular and any count above zero of tests, examples, runs as positive evidence; `N passing` kept; other `ok` and `PASS` lines positive) by the same scenarios and Singular counts next to a zero report (Elixir and unittest examples).
- Addressed: Expected 3 (both runs classified, wording and summary unchanged) by Init applies the rule to both runs of a check.
- Addressed: constraint that existing table cases keep their answers, by the existing setup/init_no_tests_test.go retained unchanged.
- Omitted: no requested behavior; no change to kogen-verification, kogen-loop or the CLI.

## Tests
- Minitest and Rails reports (expected 1 and 2): TestInitNoTestsRunnersMinitest in setup/init_no_tests_runners_test.go (unit)
- RSpec reports (expected 1 and 2): TestInitNoTestsRunnersRSpec (unit)
- Cargo reports with doc-tests (expected 1 and 2): TestInitNoTestsRunnersCargo (unit)
- Go `[no tests to run]` line (expected 1 and 2): TestInitNoTestsRunnersGoNoTestsToRun (unit)
- Singular counts next to a zero report (expected 2): TestInitNoTestsRunnersSingularCounts (unit)
- Both runs of a check are classified (expected 3): TestInitNoTestsRunnersBothRuns (integration)
- Existing classifier cases keep their answers: setup/init_no_tests_test.go (existing)

## Feasibility
- none
