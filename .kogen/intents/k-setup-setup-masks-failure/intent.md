# Refuse failure-masking setup commands

Slug: k-setup-setup-masks-failure
Model: not applicable — stateless proposal validation
Acceptance:
- .kogen/intents/k-setup-setup-masks-failure/acceptance.feature
- features/steps/k-setup-setup-masks-failure__validate.js

In setup/init.go Validate's setup loop, refuse commands recognized by the existing initMasksFailure recognizer. Append `setup command <command> ignores its own failure` to the ordinary problem list and return no proposal when problems exist. This prevents init from accepting an install whose always-successful tail hides failure. Do not execute setup commands during validation or change verification, fix commands, or check rules.

## Decisions
- Use the same conservative literal recognizer already used for checks: `|| true`, `|| :`, `|| exit 0`, `; true`, `; :`, `; exit 0`, and trailing `&` without `wait`. Real recovery, if/case blocks and quoted text remain accepted absent other problems. (source: request)
- Accumulate the mask problem alongside independent setup problems. (source: request)

## Source comparison
- Addressed: request problem and Need map to the setup-loop refusal above and rejection examples in acceptance.feature; the exact diagnostic is preserved.
- Addressed: synthetic acceptance examples `npm ci || true`, `npm ci`, `npm ci || (cat log; exit 1)`, and `echo 'a || true'` are executable Validate calls with fixture context, no provider/model or command execution (shell syntax parsing remains existing behavior).
- Addressed: same command as check retains its existing mask problem (and existing dependency-install problem); as fix remains accepted. Accumulation is tested with `npm test || true`. All specified tail forms, `bundle install; true`, if/case and wait boundaries appear in acceptance.feature.
- Superseded: setup/init_test.go TestInitValidateFailureMasks currently expects setup `false || true` to pass. Update that setup expectation while retaining fix and check coverage. No other check/fix rule changes are authorized.
- Addressed: existing init tests stay green after updating the obsolete setup expectation; README build, vet and race-test commands and configured checks remain intact. No requested behavior is omitted.

## Tests
- Setup masks are refused with exact diagnostics and a zero proposal: add focused Validate regression cases matching the rejection outline (regression).
- Nonmasking recovery, quotes, blocks and waited background work remain accepted: add focused Validate cases matching the preservation outline (unit).
- Check and fix policies do not change: retain check cases and fix expectation in TestInitValidateFailureMasks, plus acceptance role cases (existing).
- Independent setup problems accumulate: add Validate regression for `npm test || true` returning both problems (regression).
- Existing init behavior remains intact: run affected setup tests, configured checks, and `go build ./... && go vet ./... && go test -race -count=1 ./...` (existing).

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-setup-masks-failure__validate.js"],"observers":["features/steps/k-setup-setup-masks-failure__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-setup-masks-failure__validate.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-setup-masks-failure__validate.js bad","exit":1,"output":"rejected\n"}]}
