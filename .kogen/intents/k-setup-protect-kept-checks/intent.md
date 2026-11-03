# Filter protection against kept checks

Slug: k-setup-protect-kept-checks
Model: not applicable — this is a stateless eligibility filter over verification results
Acceptance:
- .kogen/intents/k-setup-protect-kept-checks/acceptance.feature
- features/steps/kept-protect.js
- features/steps/testdata/init_harness.go

After verification, re-evaluate proposed protect entries against only the kept checks using the existing manifest eligibility rules and committed manifest contents. Keep eligible entries in proposal order. Report each newly ineligible entry by path in Left out, alongside failed checks. Preserve the existing rule that zero kept checks means nothing protected. Do not change proposal validation, check execution, bridge behavior, or stdout other than the added Left out entries. Apply to all manifest types covered by initProtectProblem, not just package.json.

## Decisions
- Drop protection whose sole verification purpose belonged to an omitted check; retain embedded settings and independently eligible paths. (source: request)
- Use a temporary Go-built component executable calling the checkout's real setup.Init rather than the unavailable consumer CLI. Never invoke init via npm; npm run lint is exclusively a proposed verification check. (source: answer 1)

## Source comparison
- Addressed: request Problem and Need replace setup/init.go's whole-list assignment whenever any check survives with per-entry kept-check eligibility filtering; outcome and boundaries above preserve zero-check behavior and stdout.
- Addressed: Synthetic acceptance's README.md, package.json with only lint, checks lint/npm run lint and ok/true, and both lint exit controls are executable in acceptance.feature; README retention, embedded settings and zero-check cases are also covered.
- Addressed: request unit-level table over initResult is required in Tests below, with kept-check sets determining expected protection.
- Superseded: Earlier attempt's actual consumer kogen binary boundary is replaced only by the explicitly allowed component executable (answer 1); direct go build and executable invocation still test Init status, stdout and written project.yaml using the existing local model fixture. No production CLI or provider integration change is requested.
- Omitted: none of the requested filtering scope. Historical unrelated testing-policy examples do not add product work to this fix.

## Tests
- Filter check-dependent manifest protection after verification: add a focused table test over initResult outcomes for kept lint, only ok, and no kept checks, including ordered mixed protection (unit)
- Preserve embedded verification settings and non-manifest eligibility with surviving checks: extend the same table with package.json embedded settings and README.md (unit)
- Reproduce failing lint with passing ok and remove package.json with a named Left out entry: direct component executable scenario observing written config and stdout (regression)
- Keep package.json when lint passes, README.md when lint fails, and embedded settings when lint fails; keep nothing with zero kept checks: direct component executable controls (integration)
- Preserve other stdout and existing workflow: retain existing init output and contract tests unchanged and add focused output regression for the extra omitted path (existing)

## Feasibility
- evidence: {"id":"protect-observer","kind":"observer","inputs":["features/steps/kept-protect.js"],"observers":["features/steps/kept-protect.js"],"checks":[{"name":"good","command":"node features/steps/kept-protect.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/kept-protect.js --control bad","exit":1,"output":"rejected\n"}]}
