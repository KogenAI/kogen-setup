# Specify setup dependency consumption

Slug: k-consumes-setup
Model: not applicable — adds stateless contract tests and audit documentation, not workflow state
Acceptance:
- .kogen/intents/k-consumes-setup/acceptance.feature
- features/steps/k-consumes-setup__contracts.js

Keep contract/ as the provided contract and add consumes/kogen-coordinator/, consumes/kogen-executor/, consumes/kogen-loop/ and consumes/kogen-verification/. Each is an independently runnable Go test package against its producer's public exported API. Cover every dependency use in all non-test code, including cmd/kogen-setup, not just setup/. Assert only consumed semantics, fields, functions, types and formats, not an entire producer API. Preserve all production behavior, commands, flags and options; do not edit production code, go.mod or go.sum. Keep useful existing tests unchanged.

Add consumes/README.md recording a source audit: each imported identifier and every consumed method/field, its production call sites and its asserting test(s). Inspect receiver uses as well as package-qualified identifiers; compilation alone is not a behavioral assertion. Explain how completeness was checked and why each asserted behavior is used. Do not mark Respond, executor startup/rounds or other exercised runtime dependencies as signature-only, deferred, indirectly covered elsewhere, or out of scope. The four suites themselves must assert these uses.

Use the isolation style in contract/: synthetic temporary roots and HOME, no inherited credentials or Git/Kogen settings, no global/system Git config, deterministic fixtures, no real network, no host paths, private helpers, sleeps, skips or build constraints. Loopback httptest transport and fake local executable programs are allowed, as in existing fixtures. Use only the standard library and already pinned dependencies. Public helpers from another producer may support a fixture but must not create assertions about unused producer behavior.

In particular the loop suite must call Client.Respond with a synthetic local provider and assert the consumed response Items and Usage, not merely NewClient/Body or Request compilation. Exercise tools.Calls, Replay, Call.Output and truncation/typed-output behavior to the extent consumed by init.go and conversation.go. The executor suite must start the real claudecode adapter against a synthetic locally installed executable, call Round, assert Structured configuration JSON and the consumed feedback path, and close the session; exercise the consumed hook entry point as well. Do not launch/install a real Claude executable or contact a provider. Audit all remaining production imports, receiver operations and fields, including Git repository operations, project detection/render/load formats, session execution/error/interrupt semantics, verification copy/runner results and tool environment wiring. Derive exact asserted semantics from actual call sites rather than testing all available API fields.

## Decisions
- Four separate consumer suites run in go test ./... alongside the existing provided contract (source: request).
- No production or dependency-pin changes and no new user surface (source: request).
- Record the complete identifier/receiver/field audit, including the standalone command and runtime Respond and Claude Round uses, to address the prior review blocker (source: request).
- Verify unchanged inputs from current file bytes, not a historical commit or tree (source: request).

## Source comparison
- Addressed: original K-CONSUMES-SETUP Need bullets map to the four packages, public-API-only assertions, fixture isolation, complete audit and normal-test integration above and the executable scenarios.
- Addressed: delivery decision rejecting historical tree 73cca4c1 references maps to the current-file digest scenario; acceptance uses no Git history at all.
- Addressed: automatic retry review counterexamples setup/init.go Client.Respond, response Items/Usage and setup/init_route.go Start/Round.Structured map to explicit runtime obligations above and audit requirements. No signature-only exemption or setup-only narrowing is retained.
- Addressed: go.mod/go.sum unchanged, existing contract retained and no new command/flag/option map to the current-byte regression check and unchanged existing tests.
- Omitted: none of the requested scope. No prior candidate or unavailable historical object is an input to this contract.

## Tests
- Each dependency has public-API consumer assertions for every used behavior/type/function/format: new Go tests in each consumes/<producer>/ package, exercised individually and by go test ./... (integration)
- Complete consumption inventory includes receiver methods and fields throughout non-test code including cmd/kogen-setup: consumes/README.md source-to-assertion audit reviewed against production plus executable audit presence check (regression)
- Respond response Items/Usage and Claude Start/Round.Structured are real consumed behavior rather than compilation-only coverage: synthetic transport/executable Go tests in loop and executor suites (integration)
- Existing behavior, production files and dependency pins stay unchanged: fixed current-byte digest and unchanged contract/setup tests through go test ./... (regression)
- Tests are isolated, deterministic and public-API-only: new suite fixtures follow contract/ isolation and run with existing configured trimpath gate and full race command before completion (integration)

## Feasibility
- Local pinned API inspection confirmed claudecode.New returns executor.Executor, Session exposes Round and Close, and provider.Client.Respond returns Response with Items and Usage. No external provider/library-version assumptions are required; tests target the installed pinned source, not live services. (probe: exit 0, 7.6 s)
- Existing go test ./contract/... passes; current production/module byte digest captured without Git history. (probe: exit 0, 1.5 s)
- Existing go test ./... passes on the unchanged tree. (probe: exit 0, 7.6 s)
