# Run Claude Code stand-ins under a test origin

Slug: s-consumes-executor-runtime-checks
Model: not applicable — two test fixtures set an environment variable and folder modes; no product state or interacting rules change
Acceptance:
- .kogen/intents/s-consumes-executor-runtime-checks/acceptance.feature
- features/steps/s-consumes-executor-runtime-checks__runtime.js

This is the paired consumer row for kogen-executor's Build `kogen-runs-unverified-claude-code-runtime` (candidate 626c4649, Build e62962a9; its commit is "Refuse unverified Claude Code runtimes"). That Build makes the executor check the managed Claude Code runtime at `claudecode.RuntimePath(home)` (`<home>/.kogen/claude-code/2.1.312/claude`) before every start:

- The runtime must be a regular, executable, non-empty file.
- Its size must equal the pinned size for the platform: 275988512 on darwin/arm64, 293592432 on linux/amd64.
- It must be owned by the current user and not writable by group or others. The same ownership and write rules apply to its version folder and to `<home>/.kogen/claude-code`.

The size check is skipped when the test download origin `KOGEN_CLAUDE_CODE_URL` (`claudecode.SeamEnv`) is set. The producer's own contract tests rely on this: `contract/fake_claude_test.go` gets a `TestMain` that sets `KOGEN_CLAUDE_CODE_URL=http://127.0.0.1:1`, and the fake is chmodded to 0755. The origin is never contacted while a runtime is installed.

The producer's consumer contract check refused the Build because of this NEW failure here:

```
kogen-setup TestClaudeRounds  executor_test.go:49: executor/unavailable: Kogen's Claude Code at <home>/.kogen/claude-code/2.1.312/claude is 931 bytes, expected 275988512; remove it and run again
```

`TestClaudeRounds` (`consumes/kogen-executor/executor_test.go`) installs a 931-byte shell-script stand-in in a temporary home, and the new size check refuses it as `unavailable` before any round.

The pinned kogen-executor (`v0.0.0-20261104032156-49f915c19779`) already provides the test-origin route: `claudecode.SeamEnv` = `KOGEN_CLAUDE_CODE_URL`, validated as `http://127.0.0.1:<port>` or `http://localhost:<port>`. The pinned executor reads it only when it installs a missing runtime, so setting it changes nothing while a stand-in is installed. The producer's shared fake helper is unexported test code in another module, so this repo cannot use it. The stand-ins therefore use the test origin, as the producer's own tests do.

The product should be:

1. **TestClaudeRounds.** At the start of `TestClaudeRounds`, call `t.Setenv(claudecode.SeamEnv, "http://127.0.0.1:1")`. Add a one-line comment saying why: the stand-in is not the pinned size, and the origin is never contacted while a runtime is installed. Everything else in the test stays as it is:
   - the stand-in script;
   - the folders created with 0700 and the file written with 0700 (a umask can only remove bits, so they are never group- or other-writable);
   - the two rounds (`""` then `"invalid: retry"`);
   - every assertion: structured output `{"setup":[],"checks":[]}`, the `--model`/`--effort`/`--json-schema` arguments, the token on fd 3, the brief in the first prompt, the feedback in the second, and `Close`.

   `TestHookAndToolDefinitions` is unchanged.
2. **Claude Code route usage stand-in.** `features/steps/k-setup-init-claude-route-usage-reported__usage.js` installs the only other stand-in for the managed runtime in this repo that can pass today, a 1531-byte Node script. Against the runtime checks, its Claude Code route scenarios fail the same way: `... is 1531 bytes, expected 275988512 ...`. In the `claude-code` branch of `runInit`:
   - set `env.KOGEN_CLAUDE_CODE_URL = 'http://127.0.0.1:1'` in the environment of the spawned `kogen-setup`;
   - after installing the runtime, chmod `<home>/.kogen/claude-code` and `<home>/.kogen/claude-code/2.1.312` to 0o700, so the folder modes do not depend on the umask. The file is already written with 0o700.

   Nothing else in that step file or its feature changes.
3. **Unchanged.** `go.mod` and `go.sum` keep `github.com/KogenAI/kogen-executor v0.0.0-20261104032156-49f915c19779` and every other pin. No production code, other test, step file, feature or README changes.

The acceptance step `features/steps/s-consumes-executor-runtime-checks__runtime.js` runs two things: `go test -count=1 -v -run '^TestClaudeRounds$' ./consumes/kogen-executor/`, and the whole feature `.kogen/intents/k-setup-init-claude-route-usage-reported/acceptance.feature` through `$KOGEN_NODE`/`$KOGEN_CUCUMBER`, expecting `8 scenarios (8 passed)`. It runs each of them twice:

- Against the pinned module.
- Against a temporary copy of the pinned module (`go mod download -json`, then `cp -R`). The copy is used through `GOFLAGS=-modfile=<tmp>/go.mod` with a `replace` directive, so the checkout's `go.mod`/`go.sum` are never touched. In the copy, `runtimeUsable` in `executor/claudecode/runtime.go` is patched with the producer's rules and messages:
  - the size rule, skipped when `KOGEN_CLAUDE_CODE_URL` is set;
  - the ownership and group/other-write rules for the file, its version folder and `<home>/.kogen/claude-code`.

The step removes `KOGEN_CLAUDE_CODE_URL`, `GOFLAGS` and the acceptance report variables from the environment it passes, and sets `GOWORK=off`, so only the stand-ins themselves can supply the test origin. Run directly as a script (`node features/steps/s-consumes-executor-runtime-checks__runtime.js [--keep-test-origin]`), it prints one result line per run and exits 0 only when all four runs pass. This is the observer control in Feasibility.

## Decisions
- Stand-ins for the managed Claude Code runtime satisfy the producer's new checks by setting the test origin KOGEN_CLAUDE_CODE_URL=http://127.0.0.1:1 (t.Setenv(claudecode.SeamEnv, ...) in TestClaudeRounds; env var plus 0o700 folders in the usage step's claude-code branch), not by changing the stand-in's size. (decision: D1, round 1) (constraint: go.mod/go.sum keep kogen-executor v0.0.0-20261104032156-49f915c19779) (constraint: TestClaudeRounds keeps its two rounds and all assertions) (constraint: No production code changes) (evidence: consumes/kogen-executor/executor_test.go; features/steps/k-setup-init-claude-route-usage-reported__usage.js; go.mod; go.sum) (assumption: The producer behaviour (size check skipped when KOGEN_CLAUDE_CODE_URL is set; ownership and group/other-write rules) was read from the producer's candidate checkout outside this repository and from the pinned module in the Go module cache, neither of which is a tracked file here; the candidate is not a fetchable module version, so acceptance reproduces its rules in a patched copy of the pinned module.) (source: request)
- Acceptance runs TestClaudeRounds and the k-setup-init-claude-route-usage-reported feature against the pinned module and against a temporary patched copy via GOFLAGS=-modfile with a replace directive, stripping KOGEN_CLAUDE_CODE_URL from the passed environment, with observer controls declared in Feasibility. (decision: D2, round 1) (evidence: .kogen/intents/k-setup-init-claude-route-usage-reported/acceptance.feature; features/steps/k-setup-init-claude-route-usage-reported__usage.js; go.mod; go.sum) (assumption: Scratch harness-only runs (not Kogen probe records) showed the patched copy reproduces the reported 931-byte refusal and a 1531-byte refusal for the usage stand-in, and that both pass with the test origin set; readiness runs the declared observer controls to confirm on the submitted bytes.) (source: request)
- features/steps/provider-init.js (k-init-provider) is left unchanged. (decision: D3, round 1) (evidence: features/steps/provider-init.js; .kogen/intents/k-init-provider/acceptance.feature) (assumption: The baseline failure was observed in a scratch harness-only run, not a Kogen probe record.) (source: request)
- `TestClaudeRounds` keeps proving the same two rounds with the same assertions. (source: request)
- The pins in `go.mod`/`go.sum` and every other test and behaviour stay unchanged. (source: request)

## Source comparison
- Reported failure `executor_test.go:49: executor/unavailable: ... is 931 bytes, expected 275988512`: addressed by rule 1. Acceptance scenario 1 reproduces it against the runtime-checked copy. A scratch run on the unchanged tree gave exactly that message, with the full remedy `; remove <home>/.kogen/claude-code/2.1.312 and run again`.
- "any other test in this repo that stands in for the managed runtime":
  - Go tests: only `TestClaudeRounds` writes `claudecode.RuntimePath` (searched for `RuntimePath`, `SeamEnv` and `.kogen/claude-code`).
  - Step files: `k-setup-init-claude-route-usage-reported__usage.js` is addressed by rule 2 and scenario 2.
  - `features/steps/provider-init.js` (feature `k-init-provider`) also installs a stand-in but is left unchanged. Its Claude Code scenarios already fail on the unchanged tree against the pinned executor, for reasons unrelated to the runtime: Init now also commits `.kogen/models.yaml`, which the step does not expect, and the leftover scenario's configuration is refused as invalid. It cannot pass against either executor, and the request forbids other test changes.
- "Use whichever the pinned executor already provides": the test origin `claudecode.SeamEnv` (rule 1). The producer's `newFake` helper cannot be imported.
- "The test must still prove what it proves today": rule 1 keeps every round and assertion.
- "No other test, pin (go.mod/go.sum) or behaviour changes": rule 3. Scenario 1 checks the kogen-executor require line in `go.mod` and both of its `go.sum` lines.
- "Keep every existing test green": the configured checks (`go test ./...` and the others) must stay green. Both scenarios also require the tests to pass against the pinned executor.
- "This row lands first; the producer is then re-shaped on top": the producer is neither changed nor re-pinned here.

## Tests
- A stand-in runtime in `TestClaudeRounds` is accepted by an executor with the runtime checks and by the pinned one: update `TestClaudeRounds` in `consumes/kogen-executor/executor_test.go`; acceptance scenario 1 checks it against both executors (regression)
- The Claude Code route usage stand-in is accepted by both executors: update `runInit` in `features/steps/k-setup-init-claude-route-usage-reported__usage.js`; acceptance scenario 2 runs that whole feature against both executors (regression)
- `TestClaudeRounds` still checks the two rounds, arguments, token, brief, feedback and close: the unchanged assertions of `TestClaudeRounds` (existing)
- The kogen-executor pin is unchanged: the `go.mod`/`go.sum` checks in acceptance scenario 1 (existing)

## Feasibility
- Scratch observation (harness-only, not a Kogen probe record): on the unchanged tree, `TestClaudeRounds` passes against the pinned module. Against the patched copy, through `GOFLAGS=-modfile`, it fails with `executor/unavailable: Kogen's Claude Code at <home>/.kogen/claude-code/2.1.312/claude is 931 bytes, expected 275988512; remove <home>/.kogen/claude-code/2.1.312 and run again`. With `KOGEN_CLAUDE_CODE_URL=http://127.0.0.1:1` set, it passes against both.
- Scratch observation: against the patched copy, the usage feature's Claude Code scenarios fail with `... is 1531 bytes, expected 275988512 ...`. With the test origin set, the whole feature reports `8 scenarios (8 passed)`. On the pinned module it reports `8 scenarios (8 passed)` today.
- Scratch observation: `k-init-provider` scenario `acceptance.feature:8` (claude-code) fails on the unchanged tree against the pinned module, because the committed files include `.kogen/models.yaml`.
- evidence: {"id":"runtime-checks-observer","kind":"observer","inputs":["consumes/kogen-executor/executor_test.go","features/steps/k-setup-init-claude-route-usage-reported__usage.js",".kogen/intents/k-setup-init-claude-route-usage-reported/acceptance.feature","go.mod","go.sum"],"observers":["features/steps/s-consumes-executor-runtime-checks__runtime.js"],"checks":[{"name":"good","command":"KOGEN_CLAUDE_CODE_URL=http://127.0.0.1:1 \"${KOGEN_NODE:-node}\" features/steps/s-consumes-executor-runtime-checks__runtime.js --keep-test-origin","exit":0,"output":"pinned kogen-executor: TestClaudeRounds passed\nkogen-executor with the runtime checks: TestClaudeRounds passed\npinned kogen-executor: Claude Code route usage feature passed\nkogen-executor with the runtime checks: Claude Code route usage feature passed\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/s-consumes-executor-runtime-checks__runtime.js","exit":1,"output":"pinned kogen-executor: TestClaudeRounds passed\nkogen-executor with the runtime checks: TestClaudeRounds failed\npinned kogen-executor: Claude Code route usage feature passed\nkogen-executor with the runtime checks: Claude Code route usage feature failed\n"}]}
