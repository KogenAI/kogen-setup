# Reject checks that ran no tests

Slug: k-setup-check-ran-no-tests
Model: not applicable — this is a stateless output classification added to existing verification
Acceptance:
- .kogen/intents/k-setup-check-ran-no-tests/acceptance.feature
- features/steps/init_fix_steps.js
- features/steps/no-tests-output.js

In setup/init.go, change the initVerify check loop so that successful commands which report no tests are omitted from .kogen/project.yaml. The Left out diagnostic must contain `<name> (<command>) ran no tests`. This replaces unconditional retention of exit-zero, non-mutating checks. Preserve timeout, nonzero exit and tracked-file mutation handling. Apply the new classification to checks, not setup or fix commands (initCommandFailure is shared). Both detected and proposed checks follow the same rule.

Recognize Go package reports consisting of `[no test files]` for every reported package without an `ok` or `PASS` report showing tests; `0 tests, 0 failures`; `Ran 0 tests`; `No tests found`; and `0 passing`. Any recognized positive test count anywhere in captured output overrides a no-tests report, as do Go `ok` package results or `PASS`. Recognize positive counts in the corresponding tests, Ran N tests and N passing report forms. Do not infer anything from command text. Empty and unrecognized output remain eligible. Existing checks still must exit zero and leave tracked files unchanged. If the only candidate is excluded, retain `Checks: none passed`.

## Decisions
- Inspect captured successful check output, with positive evidence taking precedence, and retain unknown output without guessing from command names. (source: request)
- Keep the existing Left out and Checks presentation; use the exact reason `ran no tests`. (source: request)

## Source comparison
- Addressed: request Problem and Need, by the check-only classification and diagnostic above; current setup/init.go:1026–1062 keeps exit-zero non-mutating checks regardless of output.
- Addressed: all five recognized reports and the positive-count override in Need, by the classification contract and executable examples in acceptance.feature.
- Addressed: every Synthetic acceptance example, including empty output, mixed Go packages, 3 tests and only-candidate summary, in acceptance.feature.
- Omitted: no requested behavior. No command-text inference, provider change, new setting or setup/fix filtering is authorized. README check and commit workflow remains unchanged.

## Tests
- Classify all specified zero-test reports and positive overrides, leaving empty/unrecognized output unchanged: add focused table-driven classifier tests through a callable interface (unit)
- Omit successful no-test checks from configuration with the exact Left out reason and none-passed summary: synthetic Init scenarios in acceptance.feature plus a reproducing setup regression test (regression)
- Retain mixed Go output and positive-count commands, empty output and unrecognized output: synthetic Init scenarios in acceptance.feature (integration)
- Preserve timeout, failure, mutation and setup/fix behavior: retain existing setup tests and run configured checks (existing)

## Feasibility
- none
