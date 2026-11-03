# Reject checks that run nothing

Slug: k-setup-check-runs-nothing
Model: not applicable — a stateless command validation predicate; the existing bounded correction lifecycle is unchanged
Acceptance:
- .kogen/intents/k-setup-check-runs-nothing/acceptance.feature
- features/steps/runs-nothing.js
- features/steps/runs-nothing.go.txt

In setup/init.go, replace acceptance of vacuous proposed checks with a Validate problem naming the check and saying it runs nothing. Use the existing one-correction conversation, not a new retry or a silent filter. Recognize only commands made entirely of true, :, exit 0, echo with plain/quoted word arguments, or printf with plain/quoted word arguments, joined by ;, &&, ||, | or newlines. Respect quotes when separating commands. Redirection, command substitution ($(...), backticks), and any part outside that list leave the command unaffected. This is a narrow syntactic rule, not a general shell safety policy. Detected checks are unaffected. Setup/fix are unaffected. Preserve existing init checks and output behavior; after correction drops the sole proposed check with none detected, print Checks: none found and omit that check from project.yaml. Inspect initCommandFailure for output consistency, but do not broaden this change into output redesign.

## Decisions
- Name the rejected check and say it runs nothing, so the model can replace it or drop it via the existing one correction. (source: request)
- Preserve detected checks and mixed real commands. (source: request)

## Source comparison
- addressed: request problem and owning setup/init.go interfaces are covered by the validation predicate and correction scenario below; no command-exit-only validation for these proposals remains.
- addressed: synthetic a=true, b=echo ok && exit 0, c=: and accepted d=test -f README.md, e=echo hi > out.txt, f=go vet ./... && echo done are executable rows in acceptance.feature.
- addressed: request echo "tests passed", printf, all five separators, quoted/plain words, redirection and substitution exclusions, detected checks, and the no-a final configuration are exercised by acceptance.feature and the capture driver.
- omitted: no requested behavior. Existing init lifecycle, checks and configured verification remain required; unrelated historical testing-policy examples do not add product scope.

## Tests
- Reject syntactically vacuous proposed checks with a named runs-nothing problem: table-driven Validate coverage (unit)
- Preserve commands with outside parts, redirection or substitution and preserve detected checks: Validate coverage (unit)
- Route rejection into one correction, drop a, print none found and persist no a: scripted local Init regression (regression)
- Preserve existing init behavior: existing setup and full configured Go checks (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/runs-nothing.js"],"observers":["features/steps/runs-nothing.js"],"checks":[{"name":"good","command":"node features/steps/runs-nothing.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/runs-nothing.js --control bad","exit":1,"output":"rejected\n"}]}
