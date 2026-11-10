# Use the signed Executor Claude fixture in Setup

Slug: setup-consumes-executor-claude-fixture
Model: not applicable — a dependency-pin and test migration with no workflow state to model
Acceptance:
- .kogen/intents/setup-consumes-executor-claude-fixture/acceptance.feature
- features/steps/setup-consumes-executor-claude-fixture__steps.js

Setup's Executor consumer test, `TestClaudeRounds` in `consumes/kogen-executor/executor_test.go`, writes its own fake Claude runtime: a POSIX shell script that it installs at `claudecode.RuntimePath(home)`. kogen-executor now publishes the one shared fake runtime as the test fixture package `github.com/KogenAI/kogen-executor/testkit/clauderuntime`. That package has `Install(t, Options{Home, State, Rounds, APIKeySource, Checkout}) *Fixture`, `ResultLine(extra)` and the accessors `Fixture.Args(t, n)`, `Fixture.Token(t, n)` and `Fixture.Prompt(t, n)`. This change migrates the test onto that fixture.

What changes:
- `go.mod` and `go.sum` pin `github.com/KogenAI/kogen-executor` at `v0.0.0-20261109224447-6396bc976408`, resolved through the normal dependency path (for example `go get github.com/KogenAI/kogen-executor@6396bc97640868cc2b680a813ecde211fa728759`, which also adds the `go.sum` lines). That is Executor main revision `6396bc97640868cc2b680a813ecde211fa728759`, "Record fixture runtime arguments and token", the first signed main revision with `Args` and `Token`. No `replace` directive and no other module change.
- `TestClaudeRounds` installs the fixture with `clauderuntime.Install` instead of writing a script. The two rounds are configured with `Options.Rounds`, each answering `clauderuntime.ResultLine(map[string]any{"structured_output": {"setup": [], "checks": []}})`. `Options.Checkout` is the `filepath.EvalSymlinks` form of the task root, because the adapter compares the init event's cwd with the real root. `Options.State` is a directory separate from HOME. The duplicate shell script and the test's reads of the old fake's `args`, `token` and `prompt` files under HOME are deleted. The test needs no skip for unsupported platforms.
- `consumes/README.md` stops describing a locally written fake Claude program and names the Executor fixture instead.

What stays:
- `TestClaudeRounds` keeps its round behavior. Two rounds each return the structured configuration JSON `{"setup":[],"checks":[]}`. The first prompt contains the brief parts `policy` and `input`. The second round receives the feedback `invalid: retry` in its prompt. The session closes. The real adapter accepts the fixture's `--version` and `auth` answers.
- Setup's consumer contract stays asserted in the test, now read through the fixture. Each round's arguments contain `--model` with `claude-sonnet-5-5`, `--effort` with `high` and `--json-schema` with `{"type":"object"}`, read through `Fixture.Args`. The token `fake-token` arrives on file descriptor 3, read through `Fixture.Token`. These assertions are Setup's, not fixture implementation.
- `TestHookAndToolDefinitions` is unchanged. Setup's own contracts, tests and CLI behavior are unchanged (`cmd/`, `contract/`, `setup/`, and the coordinator, loop and verification consumer suites keep their bytes). The independent kogen-setup build lane stays: `go.mod` requires only the same four Kogen producer modules.
- Kogen, Build and Executor are not changed in this Build.

## Decisions
- Setup pins Executor at `v0.0.0-20261109224447-6396bc976408`, the revision `6396bc97640868cc2b680a813ecde211fa728759` on kogen-executor main. It is the first main revision whose fixture has `Args` and `Token`. The earlier fixture revision `f64de62e38314db46257ec9bff99241ac2ef9561` has no accessors. (decision: D1, round 1) (constraint: go.mod and go.sum only, no replace directive) (evidence: go.mod) (assumption: the session saw that git reports a signature on the revision by key CC835218E2C6F2E5 but could not check it, because that key is not in the local keyring. The user must confirm that this is the trusted Executor signing key) (source: request)
- `TestClaudeRounds` is rebuilt on `clauderuntime.Install` with two configured rounds, and the shell script and the reads of the old fake's HOME files are deleted. The fixture truncates the runtime to the pinned size, so the test needs no stand-in size workaround. (decision: D2, round 1) (constraint: delete only the duplicate fixture implementation; keep the test names, the version/auth acceptance by the real adapter and both rounds with their prompt assertions) (evidence: consumes/kogen-executor/executor_test.go) (source: request)
- The `--model`, `--effort`, `--json-schema` and fd 3 token assertions stay in Setup's test and read the fixture's `Args(t, n)` and `Token(t, n)` for each round. The assertions are not moved into the fixture or Executor. (decision: D3, round 1) (constraint: all of the three arguments and the exact token stay asserted in both rounds) (evidence: consumes/kogen-executor/executor_test.go) (source: request)
- Besides `go.mod`, `go.sum` and the consumer test, only the stale wording in `consumes/README.md` changes. Setup's other sources are byte-protected by the acceptance digest. (decision: D4, round 1) (constraint: the independent build lane and all CLI behavior stay unchanged) (evidence: consumes/README.md; .kogen/project.yaml) (source: request)
- Acceptance proves that a malformed fixture response fails the test without editing Executor. It runs `TestClaudeRounds` through `go test -modfile` against a temporary copy of the pinned Executor module whose fixture script is altered in one way. The copy never touches `go.mod`, `go.sum` or the module cache. A control run with the unaltered copy must pass first. (decision: D5, round 1) (constraint: each alteration must still compile and `TestClaudeRounds` must be reported as failed) (evidence: go.mod) (source: request)
- The full suite is the configured `go-test` check, run as `GOFLAGS=-trimpath go test ./...`. Acceptance runs only the focused consumer tests and the four consumer packages, and does not repeat the full suite. (decision: D6, round 1) (evidence: .kogen/project.yaml) (source: request)

## Source comparison
- Addressed: migrate the fake Claude runtime setup of `consumes/kogen-executor/executor_test.go` to the signed Executor test fixture, and delete only the duplicate implementation (Decisions D2; scenario "The Executor consumer test installs the fixture and drops the duplicate runtime").
- Addressed: confirm that the fixture producer is present at a signed Executor main revision and resolve its exact module version through the normal dependency path (D1; scenario "The signed Executor main revision is resolved through the normal dependency path").
- Addressed: keep the `--model`, `--effort`, `--json-schema` and fd 3 token assertions as Setup's consumer contract, read through the fixture's `Args` and `Token` accessors (D3; scenarios "Setup's consumer contract stays in the Executor consumer test" and the argument and token alteration scenarios).
- Addressed: retain the same version and round behavior coverage. The two rounds, the feedback prompt, the structured result and the version answer stay checked (scenarios for the second round, the retry feedback and the reported Claude Code version).
- Addressed: old passing tests still pass, and a malformed fixture response fails the corresponding test (the focused and every-consumer-suite scenarios, and the alteration scenarios; D5).
- Addressed: keep Setup's own contracts, tests, independent build lane and all CLI behavior, and change nothing in Kogen, Build or Executor (D4; scenarios "The other producer pins and the independent lane stay as they are" and "Setup's own sources and the other consumer suites are untouched").
- Addressed: run Setup's focused consumer tests and the full suite (focused test scenario; the full suite is D6's configured check).
- Context only, not scope: the Studio order of 9 November 2026 (keep the split between the CLI in kogen and the independent kogen-setup lane; one scoped Build) and Studio issue 407b305f-518d-42d1-8f04-2a38be6341e3.
- Omitted: no change to the fixture, to Executor's tests, to the Kogen component pins or to any other Setup production code.

## Tests
- The signed Executor main revision is the resolved dependency, the other producer pins and the lane are unchanged, and the module graph builds with readonly modules: the first three scenarios in acceptance.feature (integration)
- The Executor consumer test uses the fixture and carries no duplicate runtime, while still naming the consumer contract: scenarios four and five, source checks of `consumes/kogen-executor/executor_test.go` (integration)
- Old passing tests still pass: the focused Executor consumer tests and all four consumer packages through `go test`, plus the configured full `go-test` check (existing)
- A malformed fixture response, a missing or changed `--model`, `--effort` or `--json-schema`, a wrong or absent fd 3 token, a malformed second round, a retry prompt without feedback and another reported Claude Code version each fail `TestClaudeRounds`: the alteration scenarios, each run against an altered temporary copy of the pinned Executor fixture (scenario)
- `TestClaudeRounds` keeps both rounds, the structured result comparison and the argument and token assertions: updated `consumes/kogen-executor/executor_test.go` (integration)

## Feasibility
- none
