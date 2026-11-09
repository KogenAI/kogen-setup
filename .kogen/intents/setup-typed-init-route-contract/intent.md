# Assert the typed init route failure

Slug: setup-typed-init-route-contract
Model: not applicable — a test-contract change to one refusal's assertions; production behavior and state are unchanged and there is nothing to model
Acceptance:
- .kogen/intents/setup-typed-init-route-contract/acceptance.feature
- features/steps/setup-typed-init-route-contract__route.js

When `kogen init` finds only a saved OpenAI-compatible key, `initSelectRoute` (setup/init_route.go) refuses with `sys.Fail("provider", "login", "OpenAI-compatible requires a host/base URL and model; a saved key alone is not a route. Sign in with a supported provider using kogen provider login.", 4)`. The test `TestInitCompatibleKeyDoesNotSupplyRoute` in setup/init_route_test.go currently pins that refusal by exit code plus `strings.Contains(err.Error(), "host/base URL and model")`, so rewording the user-facing sentence breaks the Setup contract while a wrong structured class or reason would go unnoticed.

What changes: that test asserts the refusal through the existing structured outcome API instead of the sentence. It requires `sys.AsError(err)` to succeed with Class `provider`, Reason `login` and Exit `4`, and requires the exit code returned by `Init` to be 4. The existing helper `(*initFx).wantError(class, reason string, exit int)` in setup/init_test.go already asserts exactly this, so the test calls it. The test no longer asserts any part of the sentence.

What stays: the test keeps its existing assertions that the refusal creates no `.kogen`, sends no provider request and leaves HEAD unchanged. Production code is not edited: the refusal's class, reason, exit and sentence, the standalone `kogen-setup` output, the provider schema, file formats, protocol and every other error stay as they are. The wording of the OpenAI-compatible refusal is asserted only at the CLI boundary: the acceptance scenario below runs the built standalone `cmd/kogen-setup` and pins the original sentence there. No wording assertion on that refusal remains inside the Setup package's `TestInitCompatibleKeyDoesNotSupplyRoute`.

The delivery runs Setup's focused test (`go test ./setup -run '^TestInitCompatibleKeyDoesNotSupplyRoute$' -count=1 -v`) and the full configured checks (`go build ./...`, `go vet ./...`, `GOFLAGS=-trimpath go test ./...`).

## Decisions
- The edit is confined to `setup/init_route_test.go`; the assertion uses the existing `wantError` helper and no new production code, abstraction or option. (decision: D1, round 1) (evidence: setup/init_route_test.go; setup/init_test.go; setup/init_route.go) (source: request)
- The refusal's class, reason, exit and sentence stay byte for byte as they are, so the CLI behavior is unchanged; the sentence is pinned only at the CLI boundary, by the acceptance scenario that runs the built `cmd/kogen-setup`. (decision: D2, round 1) (constraint: do not edit setup/init_route.go) (evidence: setup/init_route.go; cmd/kogen-setup/main.go; contract/exit_test.go) (source: request)
- Acceptance proves the contract by mutating a scratch copy of the working tree's setup/init_route.go and running the focused test there, because the change is itself a test change and its observable effect is which production changes that test rejects: class `environment`, reason `route` or exit 3 must fail it, and a reworded sentence must not. (decision: D3, round 1) (constraint: mutate only a temporary copy, never the checkout) (assumption: acceptance may exercise the delivered test by mutating a temporary copy of production code; this probe-free design was checked only with a read-only scratch run in this session, in which the unchanged tree passed the focused test and an exit-3 mutation failed it) (source: request)
- The wrong-implementation controls vary only the assertion helper (`setup/init_route_assert_test.go`), one control for asserting the sentence, one for ignoring class and reason, one for ignoring the exit. (decision: D4, round 1) (evidence: setup/init_test.go) (source: request)

## Source comparison
- Addressed: "assert the typed failure identity and exit 4 rather than the user-facing sentence", beginning with `TestInitCompatibleKeyDoesNotSupplyRoute` and the existing `sys.Fail("provider", "login", ..., 4)` path. The Intent edits that test to assert class `provider`, reason `login`, exit 4 through `sys.AsError`; acceptance scenarios 1 and 2 observe it.
- Addressed: "Preserve no writes, no provider requests and the same CLI behavior". The test keeps its no-`.kogen`, no-request and unchanged-HEAD assertions; scenario 2 runs the built standalone command with a saved compatible key and asserts exit 4, JSON `error`, stderr line, no configuration, no provider request, clean status and unchanged HEAD.
- Addressed: "Use the existing structured outcome API and keep wording assertions at the CLI boundary". `sys.AsError`/`wantError` is used; the sentence is asserted only by the standalone command scenario.
- Addressed: "Do not change the provider schema, file formats, protocol or unrelated errors". No production edit is allowed; scenario 2 observes the unchanged production sentence, class and exit.
- Addressed: "Add or preserve a control where the wrong structured code or exit fails". Scenario 1 shows that wrong class, wrong reason and wrong exit each fail the focused test; controls.json proves the scenarios reject weaker assertions.
- Addressed: "run Setup's focused and full suites". Scenarios 1 and 2 run the focused test; the configured `go-test` check runs the full suite.
- Omitted: the user order about the kogen/kogen-setup split, the single scoped Build and the Studio issue are process context, not behavior to build. The historical provider, Studio and cache notes in the testing rules concern unrelated systems.

## Tests
- The incomplete-route refusal is asserted by Class `provider`, Reason `login` and Exit 4, not by its sentence: update `TestInitCompatibleKeyDoesNotSupplyRoute` in setup/init_route_test.go to call `f.wantError("provider", "login", 4)` and drop the `strings.Contains` wording assertion (keep its no-write, no-request, unchanged-HEAD assertions). (unit)
- A wrong class, reason or exit fails that test and a reworded sentence does not: acceptance scenarios 1 and 2 run it against mutated copies of setup/init_route.go. (scenario)
- The CLI behavior and wording are unchanged: acceptance scenario 2 runs the built `./cmd/kogen-setup` with a saved OpenAI-compatible key. (scenario)
- The class, reason and exit of the other refusals are unchanged: `contract/exit_test.go` stays unchanged. (existing)

## Feasibility
- Read, not probed: `initSelectRoute` builds the refusal on setup/init_route.go line 41 as `sys.Fail("provider", "login", ..., 4)`; `wantError` in setup/init_test.go asserts `sys.AsError`, Class, Reason, Exit and the returned exit code; `cmd/kogen-setup/main.go` prints `se.Render()` to stderr and the JSON `error` as `err.Error()`.
- Observed in a read-only scratch copy of the unchanged tree: the focused test prints `--- PASS: TestInitCompatibleKeyDoesNotSupplyRoute` and `ok  \tgithub.com/KogenAI/kogen-setup/setup`; with the refusal's exit changed to 3 it prints `--- FAIL: TestInitCompatibleKeyDoesNotSupplyRoute` and exits 1. With the controls.json overlays, the correct test passes on the unchanged and reworded copies and fails on class, reason and exit mutations; each wrong helper accepts the mutation its name says it misses.
- evidence: {"id":"route-observer","kind":"observer","inputs":["features/steps/setup-typed-init-route-contract__route.js"],"observers":["features/steps/setup-typed-init-route-contract__route.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/setup-typed-init-route-contract__route.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/setup-typed-init-route-contract__route.js bad","exit":1,"output":"rejected\n"}]}
