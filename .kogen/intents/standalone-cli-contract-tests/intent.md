# Test the standalone setup command contract

Slug: standalone-cli-contract-tests
Model: not applicable — the change adds tests of a stateless command entry point and no production behavior
Acceptance:
- .kogen/intents/standalone-cli-contract-tests/acceptance.feature
- features/steps/standalone-cli-contract-tests__mutants.js

Add `cmd/kogen-setup/main_test.go`, model-free subprocess tests of the standalone `kogen-setup` command's documented contract: its argument error and its JSON output on stdout, with human-readable output on stderr. The tests need no provider login. Production code, the setup package tests and provider-backed tests are out of scope; `cmd/kogen-setup/main.go` stays unchanged.

The tests cover three cases. (1) Invoking the command without exactly one checkout argument exits with status 2, writes the usage line to stderr and writes nothing to stdout. (2) Invoking it on a temporary empty Git repository exits 0 and writes exactly one decodable JSON object to stdout with exit zero, null error and configuration whose path and content match the `.kogen/project.yaml` file Init wrote. (3) Invoking it on a path that is not a Git repository gives a nonzero exit in the JSON object, a non-null error, a null configuration, stderr holding the human-readable diagnostic, and stdout still one decodable JSON object.

The acceptance feature runs the Build's tests against the real command and against five wrong copies of `main.go`, so a test that checks too little (exit status only, merged streams, JSON that merely decodes, an error that is not required) is rejected.

## Decisions
- The tests are Go tests in package main that run the real command as a subprocess with separately captured stdout, stderr and exit status. (evidence: cmd/kogen-setup/main.go; README.md) (source: request)
- The successful case uses a temporary Git repository with a local identity and no commits, which Init initializes without contacting a provider, and the case compares the JSON configuration with the file on disk. (evidence: setup/init.go; cmd/kogen-setup/main.go) (source: request)
- Acceptance observes the tests by behavior: it copies the working tree, optionally applies one wrong change to the copy's `cmd/kogen-setup/main.go`, runs `go test` for `./cmd/kogen-setup`, and expects pass on the real command and a failing test on each wrong one; it names no test the Build must invent. (evidence: features/steps/cmd-entry.js) (source: request)
- The tests are Go tests in package main that run the real command as a subprocess with separately captured stdout, stderr and exit status. (decision: D1, round 1) (constraint: Production code stays unchanged) (evidence: cmd/kogen-setup/main.go; README.md) (source: request)
- The successful case uses a temporary Git repository with a local identity and no commits, which Init initializes without contacting a provider, and compares the JSON configuration with the file on disk. (decision: D2, round 1) (evidence: setup/init.go; cmd/kogen-setup/main.go) (assumption: A scratch run of the built command on such a repository exited 0 and printed one JSON object; this session's own commands are not Kogen records.) (source: request)
- Acceptance observes the tests by behavior: it copies the working tree, optionally applies one wrong change to the copy's main.go, runs go test for ./cmd/kogen-setup, and expects pass on the real command and a failing test on each wrong one; it names no test the Build must invent. (decision: D3, round 1) (evidence: features/steps/cmd-entry.js) (source: request)

## Source comparison
- Argument error: exit 2, usage line `usage: kogen-setup <checkout>` on stderr, empty stdout. Addressed in acceptance via the usage-on-stdout wrong command. (source: request, README.md, cmd/kogen-setup/main.go)
- Successful empty repository: one JSON object, exit 0, error null, configuration content equal to the written file. Addressed via the altered-content and human-output-on-stdout wrong commands.
- Non-Git path: nonzero exit and non-null error in JSON, diagnostic on stderr, stdout decodable JSON. Addressed via the diagnostic-on-stdout and error-dropped wrong commands.
- Production behavior, setup package tests and provider-backed tests: omitted by request.

## Tests
- Argument count error goes to stderr with exit 2 and empty stdout: `TestUsageWithoutExactlyOneCheckout` in cmd/kogen-setup/main_test.go (integration)
- Empty Git repository yields exactly one JSON object whose configuration matches the written file: `TestEmptyGitRepositoryInitializes` in cmd/kogen-setup/main_test.go (integration)
- Non-Git path yields a nonzero JSON exit, non-null error, stderr diagnostic and clean JSON stdout: `TestNotAGitRepositoryFails` in cmd/kogen-setup/main_test.go (integration)
- The tests reject wrong commands and accept the real one: acceptance.feature scenarios (scenario)

## Feasibility
- none
