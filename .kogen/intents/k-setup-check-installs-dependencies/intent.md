# Refuse dependency installation in checks

Slug: k-setup-check-installs-dependencies
Model: not applicable — pure command validation has no meaningful state
Acceptance:
- .kogen/intents/k-setup-check-installs-dependencies/acceptance.feature
- features/steps/k-setup-check-installs-dependencies__validate.js

Change setup/init.go Validate's checks loop to reject dependency-installing command parts. Setup installs dependencies; checks judge the project, without recurring network installs hidden in ignored directories. Do not execute commands to classify them. Keep setup and fix validation unchanged.

## Decisions
- Split check commands on semicolon, &&, || and newline, retaining a single pipe inside a part. Trim each part and match literal leading whitespace-separated words with whole-token boundaries. Recognize npm ci, npm install, npm i, yarn install, argumentless yarn, pnpm install, pip install, pip3 install, python -m pip install, bundle install, mix deps.get, go mod download, cargo fetch, composer install, poetry install and uv sync; installers may have trailing arguments. Emit once per offending check `check <name> (<command>) installs dependencies; put the install in setup`, using the full original command. (source: request)
- Different executable names, noninstall subcommands, echo and printf are not installers. Accept print-only checks as explicitly requested, replacing the current check-only runs-nothing treatment of echo/printf; retain setup/fix policy and other no-op rejection. Update existing tests whose print-only check expectations this replaces. (evidence: setup/init.go) (source: request)
- Preserve existing control-character diagnostics while also detecting newline-separated installers; append the installation diagnostic after that control-character diagnostic. No shell parsing, wrapper unwrapping or provider calls are needed. (evidence: setup/init.go) (source: request)

## Source comparison
- Addressed: Problem and Need are covered by Decisions and the literal installer scenario, including all 17 specified forms, full-command diagnostic and separators. Existing checks currently lack this restriction (setup/init.go checks loop).
- Addressed: all supplied synthetic reproductions (npm ci && npm test, mix deps.get; mix test, pip install -r requirements.txt && pytest), bundle example, safe go mod verify && go test ./..., npm ls, echo npm ci, and setup npm ci with check npm test are executable acceptance cases.
- Addressed: noninstall pip check and mix deps, command-name containment, echo/printf and single-pipe boundaries have explicit acceptance cases. Setup/fix lists remain outside the new rule.
- Conflicting existing behavior superseded: print-only checks currently receive runs-nothing problems; the request's explicit acceptance of echo npm ci wins, with the scoped check-only policy adjustment in Decisions. Newline checks retain existing control rejection and gain the requested installer diagnostic.
- Addressed: existing init tests and README build/vet/race checks remain required, except changed print-only check expectations. No requested feature is omitted; no dependency installation or network operation belongs in these fixtures.

## Tests
- Reject all listed installers and reproduce recurring-install checks: callable Validate table regression tests and literal installer acceptance outline (regression)
- Recognize separators but not a single pipe boundary, whole leading words, argumentless yarn and trailing installer arguments: focused Validate tables matching acceptance cases (unit)
- Accept safe inspection and printing commands without installation diagnostics; preserve non-print no-op rejection: update affected Validate tests and safe-command outline (unit)
- Preserve setup and fix behavior: existing tests plus combined proposal scenario (regression)
- Detect newline installation while preserving control diagnostics: newline proposal scenario and Validate unit case (unit)
- Preserve init behavior: go build ./..., go vet ./..., go test -race -count=1 ./... and configured checks (existing)

## Feasibility
- evidence: {"id":"problem-observer","kind":"observer","inputs":["features/steps/k-setup-check-installs-dependencies__validate.js"],"observers":["features/steps/k-setup-check-installs-dependencies__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-installs-dependencies__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-installs-dependencies__validate.js --control bad","exit":1,"output":"rejected\n"}]}
