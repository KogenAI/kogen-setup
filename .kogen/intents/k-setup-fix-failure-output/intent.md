# Show output from failing init fixers

Slug: k-setup-fix-failure-output
Model: not applicable — plain wiring of existing bounded diagnostics, with no new state
Acceptance:
- .kogen/intents/k-setup-fix-failure-output/acceptance.feature
- features/steps/init_fix_steps.js
- features/steps/fix_failure_output.js
- features/steps/testdata/init_harness.go

In setup/init.go, connect unsuccessful fixer verification to the existing initShowOutput rendering. Replace silent failing-fixer diagnostics with the captured output tail on stderr immediately following its running line. Preserve stdout, Left out wording, configuration selection and exit codes. Do not change setup/check handling, configuration schema, or the existing renderer.

## Decisions
- Show only the last 20 output lines, each limited to 200 characters with the existing `  | ` prefix; successful fixers remain silent even when they produce output. (source: request)
- Preserve the README-only fixture, failing command `echo boom-fix >&2; exit 5` and passing command `true`. (source: request)

## Source comparison
- Addressed: request Problem/Need and owning-file pointer map to the failing fixer branch in setup/init.go and the diagnostic scenarios below; current code already renders other left-out command output and that behavior remains unchanged.
- Addressed: request Synthetic acceptance maps to the exact Left out stdout line, immediate ordered stderr block, passing fix retention, 500-line tail and noisy successful fixer scenarios in acceptance.feature.
- Addressed: README and testing rules map to local setup.Init integration via the existing harness, regression coverage and configured checks. No external providers or interface changes are needed.
- Omitted: none of the requested behavior or supplied reproductions. Superseded: only the existing omission of failed-fixer output. Conflicting: none.

## Tests
- Failed fixers emit the existing bounded tail immediately after their running line, before the next fixer: synthetic README-only regression scenario and extend TestInitLeavesOutAFailingFixerAndKeepsAPassingOne (regression)
- A 500-line failure retains exactly lines 481–500 at width 200: long fixer scenario through setup.Init; reuse existing renderer tests and add boundary integration cases for 19/20/21 lines and 199/200/201 characters if not already covered (integration)
- Passing fixers including noisy ones emit no output lines, stay configured and preserve exit status: passing and mixed fixer scenarios (integration)
- Stdout and Left out text remain unchanged and only passing fixers remain configured: exact mixed-case stdout and configuration assertions (regression)

## Feasibility
- Existing harness ran the exact failing/passing proposal successfully; observed exit 0, retained true, exact expected stdout, and missing boom-fix stderr on the unchanged tree (probe: exit 0, 0.7 s).
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":["features/steps/fix_failure_output.js"],"observers":["features/steps/fix_failure_output.js"],"checks":[{"name":"good","command":"node features/steps/fix_failure_output.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/fix_failure_output.js --control bad","exit":1,"output":"rejected\n"}]}
