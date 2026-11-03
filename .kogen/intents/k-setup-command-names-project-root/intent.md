# Reject commands naming the project root

Slug: k-setup-command-names-project-root
Model: not applicable — literal command validation is stateless; the existing bounded correction workflow is unchanged
Acceptance:
- .kogen/intents/k-setup-command-names-project-root/acceptance.feature
- features/steps/k-setup-command-names-project-root__verify.js

Prevent proposed commands from escaping committed-copy verification by naming the user's absolute project directory. Extend setup.InitContext with Root string, populate it from the real repository root in Init's model-validation path, and reject offending setup, fix and check commands in Validate before execution. Preserve existing validation, correction limits, committed-copy verification and init behavior otherwise. An empty Root preserves existing callers' validation behavior.

## Decisions
- Match a literal occurrence of Root followed by `/`, whitespace, either quote, or end of command. Do not reject mere longer prefixes such as `/work/app-other`. Treat Root literally, not as regex syntax. (source: request)
- Problems identify the command (and check name for checks), say it `names the project folder by absolute path`, and advise using a `relative path`. Relative commands and `$PWD` remain valid. (source: request)
- Use Root on InitContext and pass the actual project root through initAsk to both existing conversation routes; no new provider behavior or prompt changes are needed. (source: request)

## Source comparison
- Addressed: request Problem and Need, including `cd /home/user/app && make test` and `rm -rf /home/user/app/build`, through literal root validation for all three command classes, rather than executing against the real tree. Contract: outcome paragraph, Decisions and validation scenario.
- Addressed: synthetic root `/work/app`, checks a/b rejected and c/d/e accepted verbatim in acceptance; init proposes only a, then drops it on correction and prints `Checks: none found`. Contract: both acceptance scenarios.
- Addressed: existing init tests stay green via configured checks and existing tests below. No requested behavior is omitted, superseded or intentionally conflicting. Owning implementation remains setup/init.go (Validate, InitContext and root wiring).

## Tests
- Reject absolute-root references in setup, fix and check commands with identifying relative-path guidance: table-driven Validate tests and acceptance rows (unit)
- Accept relative commands, `$PWD` and longer prefix paths while recognizing slash, whitespace, quotes and end boundaries: Validate boundary cases and acceptance rows (regression)
- Feed Init's real root to validation and correct away the only proposed check before verification, printing `Checks: none found`: local scripted-provider Init fixture (integration)
- Preserve existing init behavior: existing init tests and configured format, compile, vet and go-test checks (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-command-names-project-root__verify.js"],"observers":["features/steps/k-setup-command-names-project-root__verify.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-command-names-project-root__verify.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-command-names-project-root__verify.js --control bad","exit":1,"output":"rejected\n"}]}
