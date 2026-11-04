# Refuse test suites in recurring setup

Slug: k-setup-test-run-as-setup
Model: not applicable — literal command validation has no meaningful state
Acceptance:
- .kogen/intents/k-setup-test-run-as-setup/acceptance.feature
- features/steps/k-setup-test-run-as-setup__validate.js

Validate must refuse project tests and linting in setup before command execution, rather than accepting them because they pass on the committed green tree. Setup runs before every build; tests there block incomplete/red changes and duplicate checks. Implement in setup/init.go's Validate setup loop. Preserve the existing one-correction proposal flow and existing fix/check behavior. No provider or shell execution is needed to classify commands.

## Decisions
- Recognize literal leading command words per part split on `;`, `&&`, `||`, and newlines, trimming whitespace. Recognize mix test, go test, go vet, npm test, npm run test, npm run lint, yarn test, pnpm test, pytest, python -m pytest, cargo test, cargo clippy, bundle exec rspec, rspec, rake test. Arguments after the recognized words are allowed (notably go test ./...). Unrelated leading words or longer word names are not matches; do not infer aliases or inspect script bodies. (source: request)
- Report `setup command <part> runs tests or linting; put it in checks`, naming the trimmed offending part, including arguments. Installation and compilation remain eligible. Fix and checks are unchanged. (source: request)
- Reuse the existing correction opportunity, without adding another retry or changing the prompt policy of dependency/asset preparation. (source: request)

## Source comparison
- Addressed: request Problem and Need by the Validate refusal and existing correction flow above; setup/prompts/init.md already defines setup as preparation, not suites.
- Addressed: all fifteen literal families and four separators in Need are executable examples in acceptance.feature; synthetic mix deps.get && mix test names mix test, go test ./... rejects only in setup, and npm ci/mix deps.get accept.
- Addressed: compilation/install examples mix compile, go mod download, cargo fetch and unrelated-word boundaries are executable acceptance cases; fix/check preservation is tested through the same callable interface.
- Addressed: existing init tests must stay green under configured checks. No requested behavior is omitted or superseded. Prefix recognition permits suite arguments as required by the supplied go test ./... example, not arbitrary substring detection.

## Tests
- Refuse each literal test/lint command in setup with actionable part-specific diagnostic: acceptance calls exported Validate and focused table tests to add in setup/init_test.go (regression)
- Split compound setup on the four specified separators: executable Validate examples and focused table tests (unit)
- Keep installation/compilation and unrelated words eligible: executable Validate counterexamples and focused table tests (unit)
- Preserve fix/check acceptance: executable Validate examples (regression)
- Preserve the one-correction flow and existing init behavior: existing init tests plus a focused correction regression using existing init fixtures (integration)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-test-run-as-setup__validate.js"],"observers":["features/steps/k-setup-test-run-as-setup__validate.js"],"checks":[{"name":"good","command":"node features/steps/k-setup-test-run-as-setup__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/k-setup-test-run-as-setup__validate.js --control bad","exit":1,"output":"rejected\n"}]}
