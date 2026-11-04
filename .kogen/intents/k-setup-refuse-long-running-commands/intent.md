# Refuse long-running setup commands

Slug: k-setup-refuse-long-running-commands
Model: not applicable — pure lexical validation without state transitions
Acceptance:
- .kogen/intents/k-setup-refuse-long-running-commands/acceptance.feature
- features/steps/k-setup-refuse-long-running-commands__validate.js

Extend setup/init.go Validate to refuse the listed long-running commands in proposed setup and checks, before execution. Keep fix unaffected and preserve existing refusals and the existing single correction opportunity. Do not alter initExecTimeout (10 minutes), initExec or the twice-run initVerify policy. Validation must not execute proposed commands.

## Decisions
- Split command parts on semicolon, &&, || and newline, not a single pipe. Match literal command words, not substrings or unrelated arguments mentioning commands. Support npx before the listed JS test tools. Watch flags must be whole words after jest, vitest, mocha, tsc or mix test. (source: request)
- Recognize mix test.watch, mix phx.server, npm start, npm run dev, npm run serve, yarn start, yarn dev, pnpm dev, rails server, rails s, flask run, python -m http.server, docker compose up and docker-compose up unless the same part has -d or --detach, tail -f, and sleep durations greater than 60 seconds. Interpret ordinary numeric durations and s/m/h/d units; 60 seconds is permitted. Extra unrelated words do not turn a non-command mention into a match. No shell evaluation or script inspection is required. (source: request)
- Emit `check <name> (<command>) does not exit on its own (watch or server mode); use a command that runs once` for checks and `setup command <command> does not exit on its own (watch or server mode); use a command that runs once` for setup, naming the full submitted command. Existing independent diagnostics can coexist. (source: request)

## Source comparison
- Addressed: request Problem and Need through pure Validate rejection, all literal command families, part splitting, fix exclusion and unchanged one-correction flow; Decisions and acceptance cover these.
- Addressed: synthetic a/b checks and npm dev/npm ci/vitest run/detached compose examples in acceptance; existing init tests remain required.
- Addressed: retry report about invalid scenario reporting by using only defined prefixed bindings and ordinary scenarios with Then assertions, not a named invented test.
- Omitted: no requested product behavior; no timeout reduction, process killing or prompt redesign is introduced.

## Tests
- Refuse each literal long-running family and name the offending check: acceptance matrix and focused Validate table tests (unit)
- Refuse setup dev but preserve setup ci and detached compose, one-shot checks and fix: acceptance scenarios and focused Validate tests (regression)
- Split only specified separators, retain pipes and avoid unrelated-word matches; enforce sleep boundary: acceptance matrix and Validate table tests (unit)
- Preserve the single correction before verification: add a fixture analogous to TestInitCorrectsRepositoryStateBeforeVerification with a corrected long-running proposal and prove it never executes the rejected command (integration)
- Preserve all existing init behavior: go build ./... && go vet ./... && go test -race -count=1 ./... (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-refuse-long-running-commands__validate.js"],"observers":["features/steps/k-setup-refuse-long-running-commands__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-long-running-commands__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-long-running-commands__validate.js --control bad","exit":1,"output":"rejected\n"}]}
