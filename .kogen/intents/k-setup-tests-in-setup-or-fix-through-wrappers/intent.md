# Refuse test runs in setup and fix through wrappers

Slug: k-setup-tests-in-setup-or-fix-through-wrappers
Model: not applicable — a stateless lexical rule in Validate; the single correction round and verification are unchanged
Acceptance:
- .kogen/intents/k-setup-tests-in-setup-or-fix-through-wrappers/acceptance.feature
- features/steps/k-setup-tests-in-setup-or-fix-through-wrappers__validate.js

Today the `Validate` setup loop in `setup/init.go` splits each setup command with `initSetupPartsRE` (`;`, `&&`, `||`, newline). It trims each part, splits it into words with `strings.Fields`, and refuses the part only when its first words equal one of these literal suites: `mix test`, `go test`, `go vet`, `npm test`, `npm run test`, `npm run lint`, `yarn test`, `pnpm test`, `pytest`, `python -m pytest`, `cargo test`, `cargo clippy`, `bundle exec rspec`, `rspec`, `rake test`. So `CI=1 npm test`, `npx jest`, `make test` and `time go test ./...` are accepted as recurring setup (observed on the unchanged tree: none of them gives a problem). Fix commands are not tested at all, so the fix `go test ./...` is accepted.

After this change, one shared test decides whether a command part runs tests or linting. Validate applies it to setup commands (as today) and also to fix commands. Checks are not tested: a check may run tests.

The test, per part (the same split and trim as today):
1. Let `words` be `strings.Fields(part)`.
2. Repeat: if `words` starts with a recognised suite (exact word equality, the suite's words in order), the part runs tests or linting. Otherwise, if the first word is a leading assignment `NAME=value` (a name of letters, digits and `_` not starting with a digit, then `=`), drop that word. If the first word is `npx`, `bunx`, `yarn`, `env` or `time`, drop it. If the first two words are `pnpm exec`, drop both. Then try again. If nothing can be dropped, the part does not run tests or linting.

The suite list is checked before each drop, so existing matches that begin with a wrapper word keep working (for example `yarn test` still matches the `yarn test` suite).

Recognised suites: the fifteen existing ones above, plus `make test`, `make lint`, `just test`, `jest`, `vitest`, `eslint`, `ruff`, `tox`, `mvn test`, `gradle test`, `dotnet test` and `phpunit`. One exception keeps a formatter accepted: `ruff` followed by `format` (`ruff format .`) is not a match. `ruff check .` and `ruff .` are matches. Words after a recognised suite are allowed (`go test ./...`, `vitest run`, `eslint .`). A longer word is not a match (`make testdata`, `npm run testing`).

Problems:
- Setup: unchanged wording, `setup command <part> runs tests or linting; put it in checks`, where `<part>` is the trimmed offending part as written, including its leading assignments and wrappers (for example `setup command CI=1 npm test runs tests or linting; put it in checks`). There is one problem per matching part. Its position in the setup loop is unchanged.
- Fix: new, `fix command <part> runs tests or linting; put it in checks`, with `<part>` defined the same way. For a single-part fix command, `<part>` is the whole command (`fix command go test ./... runs tests or linting; put it in checks`). In the fix loop, add it directly after the "runs nothing" check and before the "names the project folder by absolute path" check. Fix entries that are already skipped (a credential literal, a control character) stay skipped.

The problems go back to the model through the existing single correction round (`invalid: ` followed by the problems joined with `; `), before anything runs.

Boundaries:
- Formatters and installs stay accepted. Examples: fix `gofmt -w .`, `mix format`, `prettier --write .`, `npx prettier --write .` and `ruff format .`; setup `npm ci`, `make build`, `go mod download`, `CI=1 npm ci`, `env CI=1 npm ci`, `yarn install --frozen-lockfile`, `pnpm exec prisma generate` and `just build`.
- Checks are unchanged. A check such as `CI=1 npm test`, `npx jest`, `make test` or `time go test ./...` gives no problem.
- All other setup refusals, their wording and their order are unchanged. These include "ignores its own failure", "runs nothing", the machine prerequisite, credential and control-character problems, and the long-running problem. `initSetupPartsRE`, `initLongRunning`, the prompt (`setup/prompts/init.md`), the tool definition and the golden files do not change.
- No wrapper options are interpreted (for example `env -i` or `time -p`), and script bodies (package.json scripts, Makefile recipes) are not inspected.

This replaces existing behavior that some existing tests encode. Update their expectations to the new rule. Where a test is about a different rule, it may instead switch its fixture command to an unrecognised one. Do not delete coverage of the other rule. The cases known from inspection:
- `TestInitValidateProjectRootCommands` (`setup/init_test.go`): setup `make test` now gives the runs-tests problem, and setup `cd /work/app && make test` now gives two problems.
- `TestValidateCommandsOutsideProject` (`setup/init_outside_test.go`): fix `go test ./...` and fix `cd .. && make test` now also give the fix runs-tests problem.
- `TestValidateUnsetVariables` (`setup/init_unset_variable_test.go`): fix `go test ./...`.
- `TestValidateCredentials` (`setup/init_credentials_test.go`): the accepted fix `API_KEY= make test`.
- `TestInitValidateLongRunning` (`setup/init_long_running_test.go`): fix `npx jest --watch` now gives the runs-tests problem after the long-running problem.

Earlier Intent acceptance examples that expect these commands to be accepted in setup or fix are superseded. In particular, `k-setup-test-run-as-setup` expects fix `go test ./...` to give no problem.

## Decisions
- Before matching, leading `NAME=value` assignments and the wrappers `npx`, `bunx`, `pnpm exec`, `yarn`, `env` and `time` are skipped. (source: request)
- The recognised set adds `make test`, `make lint`, `just test`, `jest`, `vitest`, `eslint`, `ruff`, `tox`, `mvn test`, `gradle test`, `dotnet test` and `phpunit` to the existing fifteen suites. (source: request)
- Fix commands get the same test, refused with `fix command <cmd> runs tests or linting; put it in checks`. (source: request)
- Formatters (`gofmt -w`, `prettier --write`, `mix format`) and installs stay accepted. Checks may run tests. (source: request)
- Existing setup refusals and wording are unchanged. (source: request)

## Source comparison
- Addressed: "leading `NAME=value` assignments and the wrappers `npx`, `bunx`, `pnpm exec`, `yarn`, `env` and `time` are skipped". Covered by the setup outline rows `CI=1 npm test`, `npx jest`, `time go test ./...`, `npx eslint .`, `bunx vitest run`, `pnpm exec jest`, `yarn jest`, `env CI=1 npm test`, `CI=1 FORCE_COLOR=0 npx jest --ci` and `time make test`.
- Addressed: the added targets and runners. Each one is an outline row: `make test`, `make lint`, `just test`, `jest`, `vitest run`, `eslint .`, `ruff check .`, `tox`, `mvn test`, `gradle test`, `dotnet test` and `phpunit`.
- Addressed: the request's synthetic setup example. The scenario "The request's setup examples are each refused" validates setup [`CI=1 npm test`, `npx jest`, `make test`, `time go test ./...`] and expects exactly four problems, in order.
- Addressed: the request's fix example. The scenario "The request's fix examples" validates fix [`go test ./...`, `gofmt -w .`, `mix format`] and expects exactly `fix command go test ./... runs tests or linting; put it in checks`. Further fix rows: `CI=1 npm test`, `npx eslint .`, `make lint`, `go vet ./...` and `gofmt -w . && go vet ./...`, which names the part `go vet ./...`.
- Decided (technical): the request writes `fix command <cmd>`. `<cmd>` is the offending trimmed part, as in setup. It equals the whole command for single-part commands, which is every example in the request.
- Addressed: setup `npm ci`, `make build` and `go mod download` are accepted (the scenario "The request's accepted setup commands"). Check `CI=1 npm test` is accepted (the scenario "Checks may run tests").
- Addressed: "Formatters stay accepted". The scenario "Formatters, installs and unrelated longer words stay accepted" adds `prettier --write .`, `npx prettier --write .` and `ruff format .`. Because `ruff` itself is a recognised runner, the request's formatter rule needs the single `ruff format` exception.
- Addressed: "Existing setup refusals and wording are unchanged". The scenario "Existing refusals keep their wording and order" expects the existing `npm test || true` pair, then the new setup and fix problems, in order. The outline row `yarn test` keeps an existing match that starts with a wrapper word.
- Addressed: "Existing init tests stay green". The final step runs `go test ./setup -count=1`. Existing assertions that contradict the request are updated (listed in the prose above), not deleted.
- Superseded: the `k-setup-test-run-as-setup` rule "Fix and checks are unchanged" for fix, and its example of fix `go test ./...` with no problem.
- Omitted: no init conversation test, prompt edit, wrapper-option parsing or script-body inspection; the request asks for none.

## Tests
- Setup parts behind leading assignments and the wrappers `npx`, `bunx`, `pnpm exec`, `yarn`, `env` and `time` are refused with the existing setup wording that names the part: add table cases to the setup-suite test in `setup/init_test.go` (the table near the existing `runs tests or linting` assertions), including `CI=1 npm test`, `npx jest`, `time go test ./...`, `env CI=1 npm test`, `pnpm exec jest` and `npm ci && CI=1 npm test` (unit)
- The added suites `make test`, `make lint`, `just test`, `jest`, `vitest`, `eslint`, `ruff`, `tox`, `mvn test`, `gradle test`, `dotnet test` and `phpunit` are refused in setup: table cases in the same test (unit)
- Fix commands that run tests or linting are refused with `fix command <part> runs tests or linting; put it in checks`: table cases for fix `go test ./...`, `CI=1 npm test` and `gofmt -w . && go vet ./...` (unit)
- Formatters, installs, `ruff format .`, longer words such as `make testdata`, and checks that run tests stay accepted: negative table cases (unit)
- The existing setup wording, other refusals and problem order are unchanged: the existing setup-suite tests (including `npm test || true`) stay green, and the conflicting assertions listed in the prose are updated (existing)
- All existing behavior is preserved: `go build ./... && go vet ./... && go test -race -count=1 ./...` (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-tests-in-setup-or-fix-through-wrappers__validate.js"],"observers":["features/steps/k-setup-tests-in-setup-or-fix-through-wrappers__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-tests-in-setup-or-fix-through-wrappers__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-tests-in-setup-or-fix-through-wrappers__validate.js --control bad","exit":1,"output":"rejected\n"}]}
