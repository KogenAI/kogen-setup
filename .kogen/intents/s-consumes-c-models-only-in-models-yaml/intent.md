# Follow kogen-coordinator's models-file-only config

Slug: s-consumes-c-models-only-in-models-yaml
Model: not applicable — a dependency pin moves and tests, two helpers and docs follow the producer's new rendering; no state or interacting rules change
Acceptance:
- .kogen/intents/s-consumes-c-models-only-in-models-yaml/acceptance.feature
- features/steps/s-consumes-c-models-only-in-models-yaml__pin.js

This is the consumer row of kogen-coordinator's intended contract change `c-models-only-in-models-yaml`. The change is on kogen-coordinator's main, `v0.0.0-20261106110407-d74daae36f56` (commit d74daae36f56d4e195d6ff04e79e74eab1530bb7, 2026-11-06T11:04:07Z, served by the Go module mirror proxy.golang.org). In that change:

- `project.Template()` and `project.RenderConfig(c)` write no `models:` block, whatever `c.Models` holds. Both texts end with their `protect` lines.
- `project.ParseConfig`/`LoadConfig` refuse a root `models:` key in `.kogen/project.yaml`.
- `LoadConfig` takes every role from `project.DefaultModels()`, then `.kogen/models.yaml`, then `.kogen/local/models.yaml`.
- `ModelsTemplate()`, `LoadModels`, `ModelsPath` and `DefaultModels` are unchanged.

This repository follows the new contract. There is no compatibility layer and no fallback. The reported new failure is:

```
TestRepositoryAndConfig	coordinator_test.go:61: rendered config must contain the models section used by setup
```

The product should be:

1. **Pin.** `go.mod` requires `github.com/KogenAI/kogen-coordinator v0.0.0-20261106110407-d74daae36f56`. Get it with `go get github.com/KogenAI/kogen-coordinator@v0.0.0-20261106110407-d74daae36f56` against the default module mirror, then run `go mod tidy`.
   - The kogen-coordinator lines of `go.sum` are then exactly:
     - `github.com/KogenAI/kogen-coordinator v0.0.0-20261106110407-d74daae36f56 h1:8VmqsU9EArCYwqOTw8e9uuS54nRSlUHSUaDl8W+lYqs=`
     - `github.com/KogenAI/kogen-coordinator v0.0.0-20261106110407-d74daae36f56/go.mod h1:MMc15p3YwlY71dMxfCdX6QlR2jXJbSxL6YA9Y7971c8=`
   - The old `2a74649374bb` lines and the stale `f15509472852` lines go away.
   - The other three requires and their `go.sum` lines are unchanged. The new coordinator requires kogen-loop `v0.0.0-20261103215300-3e292bb34b90`, older than this repo's loop pin, so nothing else moves.
2. **Consumer test `TestRepositoryAndConfig`** (`consumes/kogen-coordinator/coordinator_test.go`). Replace the assertion at line 60-62 with its new-contract counterpart. When `project.RenderConfig(cfg)` or `project.Template()` has a line starting with `models:`, the test fails with `t.Fatal("rendered configuration and template must not contain a models section; the lineup lives in .kogen/models.yaml")`.
   - In its final block, after it writes `project.Template()` to `.kogen/project.yaml` and `project.ModelsTemplate()` to `.kogen/models.yaml`, the test also requires `project.LoadConfig(root)` to succeed. This is the load Init's repeat run does with the team file present.
   - Everything else in the test stays as it is.
   - Against the former coordinator (`v0.0.0-20261104081556-2a74649374bb`), whose rendered configuration ends with a `models:` block, the test fails with that message. No test accepts the old behaviour.
3. **Setup writes the producer's text unchanged.** Remove every `strings.TrimSuffix(..., project.ModelsTemplate())` that strips the old models block. `.kogen/project.yaml` is exactly `project.Template()` (first commit) or `project.RenderConfig(cfg)` (configured init). The bytes Init writes do not change with the new pin. The sites are:
   - `setup/init_route.go` `initRenderConfig`: delete the helper and call `project.RenderConfig(cfg)` at its callers (`setup/init.go`, `setup/init_integrity_test.go`).
   - `setup/init.go` first-commit branch: write `project.Template()`.
   - `setup/init_route_test.go` `TestInitRenderKeepsCommandsContainingModelsHeader`: delete it, because it tests the removed stripping.
   - `setup/init_test.go` `TestInitEmptyRepositoryMakesTheFirstCommit`: compare with `project.Template()`.
   - `contract/files_test.go`: `selectedChatGPT` returns `project.RenderConfig(cfg)`. `TestInitFirstCommitOfAnEmptyRepository` compares with `project.Template()`. Its doc comment drops "without models".
   - After this, no `.go` file outside `.kogen/` has a line containing both `TrimSuffix(` and `ModelsTemplate()`.
4. **Docs.**
   - In `contract/README.md`, the `files-template` item says `.kogen/project.yaml` is `project.Template()`, and the `files-render-config` item says it is `project.RenderConfig` of the result. Neither says "without its models section".
   - In `consumes/README.md`, the Assertion cell of the `project.ConfigPath`, `Template`, `RenderConfig`, `LoadConfig` row reads: "Rendered commands and acceptance round-trip through the public loader; neither the rendered configuration nor the template has a models section, the template loads with the team file present, and the separate models template loads default roles through `LoadModels`."

Nothing else changes: no other production code, test, step file, feature, golden or README. Every configured check (`gofmt`, `go build ./...`, `go vet ./...`, `GOFLAGS=-trimpath go test ./...`) stays green with the new pin. The repository's own `.kogen/project.yaml` (a local lineup override with a `models:` block) is protected and is not part of this change.

The acceptance step `features/steps/s-consumes-c-models-only-in-models-yaml__pin.js` runs `go test -count=1 -v -run '^TestRepositoryAndConfig$' ./consumes/kogen-coordinator/` in two ways:

- With `-mod=readonly` against the checkout's own pin.
- Against a given coordinator version through a temporary `go.mod`/`go.sum` (`-mod=mod -modfile=<tmp>/go.mod`), so the checkout's files are never changed.

It removes `GOFLAGS` and the acceptance report variables from the environment and sets `GOWORK=off`. A pass needs exit 0, `--- PASS: TestRepositoryAndConfig (` and `ok` for the package. A failure needs `--- FAIL: TestRepositoryAndConfig (`.

Run as `node features/steps/s-consumes-c-models-only-in-models-yaml__pin.js <version>`, it prints one result line, plus the test's first `coordinator_test.go:N:` line on failure. It exits 0 only when the test passed. This is the observer control in Feasibility.

## Decisions
- Pin github.com/KogenAI/kogen-coordinator at v0.0.0-20261106110407-d74daae36f56 (the Go module mirror's @main, commit d74daae36f56) via go get then go mod tidy; go.sum coordinator lines become exactly the two lines for that version. (decision: D1, round 1) (constraint: Other requires and their go.sum lines unchanged) (constraint: New coordinator requires kogen-loop v0.0.0-20261103215300-3e292bb34b90, older than the repo pin, so no other module moves) (evidence: go.mod; go.sum) (assumption: The version, commit and go.sum hashes come from harness-only scratch runs (git ls-remote, go list -m @main, go mod download, go get + go mod tidy in a scratch copy), not Kogen probe records; producer main may advance after shaping, and the Intent pins the observed version. Readiness runs the declared observer controls against both versions.) (source: request)
- TestRepositoryAndConfig asserts the new contract: RenderConfig and Template have no models: line (failure message 'rendered configuration and template must not contain a models section; the lineup lives in .kogen/models.yaml') and LoadConfig succeeds with Template plus ModelsTemplate present; acceptance runs it against the pinned module and against the former coordinator version via a temporary -modfile, expecting pass and that failure respectively. (decision: D2, round 1) (constraint: Checkout go.mod/go.sum never changed by acceptance) (constraint: Observer controls declared in Feasibility) (evidence: consumes/kogen-coordinator/coordinator_test.go; features/steps/s-consumes-executor-runtime-checks__runtime.js) (source: request)
- Remove setup's strings.TrimSuffix(..., project.ModelsTemplate()) shims (initRenderConfig, first-commit branch, contract/setup tests) and delete TestInitRenderKeepsCommandsContainingModelsHeader; update contract/README.md and consumes/README.md wording. (decision: D3, round 1) (constraint: Init's written bytes stay identical) (constraint: features/steps/provider-init.js left unchanged (already red feature)) (evidence: setup/init_route.go; setup/init.go; setup/init_route_test.go; setup/init_test.go; contract/files_test.go; contract/README.md; consumes/README.md) (source: request)
- The local mirror `/home/lanes/work.noindex/mirrors/kogen-coordinator.git` is stale (main 0f5570c, no models change), so "the mirror" is the Go module mirror, which serves the new main (source: request)
- No fallback, compatibility branch or old-behaviour test is added (source: request)

## Source comparison
- Reported failure `coordinator_test.go:61: rendered config must contain the models section used by setup`: addressed by rule 2. The Feasibility bad control reproduces it on the unchanged tree against `v0.0.0-20261106110407-d74daae36f56`.
- "move this repository's go.mod pin of the producer to that main (go get against the mirror)": rule 1. Scenario 1 checks the require line, the exact `go.sum` coordinator lines and the other three requires, and runs the test with `-mod=readonly`.
- "every test in it passes with the producer at its new main": scenario 1, plus the configured `go test ./...` check. Scratch runs at the new pin passed `go vet ./...`, and passed the focused tests `TestInitFirstCommitOfAnEmptyRepository` and `TestInitWritesTheConfigurationAndTheBridgeInOneCommit` (contract) and `TestInitRenderKeepsCommandsContainingModelsHeader` and `TestInitEmptyRepositoryMakesTheFirstCommit` (setup). With only the assertion changed, `TestRepositoryAndConfig` passed.
- "Test fixtures describe the new contract only. No test or code accepts the old behaviour, and no fallback is added":
  - Scenario 2: the updated test fails against the former coordinator with the new message.
  - Rule 3 and scenario 3: no `TrimSuffix(..., ModelsTemplate())` shims remain.
  - Rule 4 and scenario 4: docs.
- `features/steps/provider-init.js` (feature `k-init-provider`) holds a `project.yaml` fixture with a `models:` block that includes the long-removed `max_rounds: 3`. It is left unchanged. That feature already fails on the unchanged tree for unrelated reasons, as recorded in the `s-consumes-executor-runtime-checks` Intent: Init commits `.kogen/models.yaml`, which it does not expect. Rewriting it is outside "Nothing else changes".
- `features/steps/fix-k-setup-models-file__script.js` injects `models:` into `project.yaml` as a fault the models check must catch. That already describes the new contract and is unchanged.
- "Nothing else changes. Keep every other test green": rule 3 keeps Init's written bytes identical. The repository's own protected `.kogen/project.yaml` is unchanged.

## Tests
- The consumer test pins the new contract (no `models:` section in `RenderConfig`/`Template`; `LoadConfig` loads the template with the team file present) and passes at the new pin: update `TestRepositoryAndConfig` in `consumes/kogen-coordinator/coordinator_test.go`; acceptance scenario 1 runs it against the pinned module (regression)
- The consumer test does not accept the old rendering: acceptance scenario 2 runs it against kogen-coordinator `v0.0.0-20261104081556-2a74649374bb` and expects the new failure message (regression)
- The pin is `v0.0.0-20261106110407-d74daae36f56` with exactly its two `go.sum` lines, and the other pins are unchanged: acceptance scenario 1 (integration)
- Init writes `project.Template()` and `project.RenderConfig(cfg)` unchanged: update `TestInitEmptyRepositoryMakesTheFirstCommit` (setup) and `TestInitFirstCommitOfAnEmptyRepository` and `selectedChatGPT` users (contract) to compare with the producer text directly; delete `TestInitRenderKeepsCommandsContainingModelsHeader`; acceptance scenario 3 checks that no Go line trims `ModelsTemplate()` (integration)
- The contract and consumer READMEs describe the new rendering: acceptance scenario 4 (scenario)

## Feasibility
- Scratch observation (harness-only): `git ls-remote https://github.com/KogenAI/kogen-coordinator` gives main `d74daae36f56d4e195d6ff04e79e74eab1530bb7`. The Go module mirror serves it as `v0.0.0-20261106110407-d74daae36f56`, and its `go.mod` requires kogen-loop `v0.0.0-20261103215300-3e292bb34b90`. In a scratch copy, `go get ...@main && go mod tidy` changed only the coordinator require line and replaced the four old coordinator `go.sum` lines with the two lines above.
- Scratch observation: at the new pin, `TestRepositoryAndConfig` fails with exactly the reported line. With the assertion inverted, it passes, both with `-mod=readonly` and through the step. Against the former coordinator, the inverted test fails.
- evidence: {"id":"consumer-test-observer","kind":"observer","inputs":["consumes/kogen-coordinator/coordinator_test.go","go.mod","go.sum"],"observers":["features/steps/s-consumes-c-models-only-in-models-yaml__pin.js"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/s-consumes-c-models-only-in-models-yaml__pin.js v0.0.0-20261104081556-2a74649374bb","exit":0,"output":"TestRepositoryAndConfig against github.com/KogenAI/kogen-coordinator v0.0.0-20261104081556-2a74649374bb: passed\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/s-consumes-c-models-only-in-models-yaml__pin.js v0.0.0-20261106110407-d74daae36f56","exit":1,"output":"TestRepositoryAndConfig against github.com/KogenAI/kogen-coordinator v0.0.0-20261106110407-d74daae36f56: failed\ncoordinator_test.go:61: rendered config must contain the models section used by setup\n"}]}
