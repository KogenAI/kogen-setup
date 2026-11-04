# Drop redundant init fix commands

Slug: k-setup-setup-fix-same-command
Model: not applicable — deterministic list filtering has no meaningful state
Acceptance:
- .kogen/intents/k-setup-setup-fix-same-command/acceptance.feature
- features/steps/k-setup-setup-fix-same-command__merge.js
- features/steps/k-setup-setup-fix-same-command__existing.js

After existing Merge rules produce ordered, individually deduplicated lists, remove from fix entries whose initCommandKey occurs in setup or checks. Preserve setup and checks, their order and bytes, and surviving fix order and bytes. Do not change initCommandKey or deduplicate setup against checks. Apply filtering to detected and proposed commands alike, after check replacement and deduplication. Prevent redundant fix commands from being verified or written. Keep Merge's public signature unchanged. Wire the same decisions into Init's result output without changing unrelated validation or detection.

## Decisions
- Report each removed fix once, in merged fix order, as `Dropped: fix: <original command> (already in setup)` or `Dropped: fix: <original command> (already in checks)`. If both match, setup wins. Use separate result lines, not the existing combined Left out summary; wording and tie-break are settled here to implement the requested explanation. (source: request)
- Use existing initCommandKey equivalence, including outside-quote whitespace normalization, not broad shell equivalence. Different flags and filters remain distinct. Never drop setup or checks under this new rule. (source: request)
- Preserve existing init behavior and tests outside this filtering and reporting. (source: request)

## Source comparison
- Addressed: request's setup `npm ci` / fix `npm ci`, check `make lint` / fix `make  lint`, surviving `make lint --fix`, and setup `npm ci` / fix `npm run format` are executable examples in acceptance.feature. Each checks Merge and actual Init configuration and diagnostic lines.
- Addressed: owning implementation setup/init.go, Merge and initUnion currently deduplicate within lists; this contract adds cross-list filtering only to fix after merging. Tests cover distinct filters and setup/check coexistence. A separate acceptance scenario runs existing setup tests.
- Superseded: previous attempt's Go detector fixture expectations (`format`, `compile`, `vet`) are not legitimate detector output. This package uses a README/Makefile fixture, not a Go module, and does not prescribe detector names or alter the coordinator. Reported actual Go names `go-format`, `go-test`, `go-vet` remain unchanged; project.yaml's configured `format`, `compile`, `vet`, `go-test` checks also remain unchanged.
- Omitted: no requested product behavior. Retry evidence is a builder-reported, unproven contradiction, not authorization to change protected files or unrelated detectors. This fresh package repairs fixture design instead.

## Tests
- Remove fix matching setup from detected/proposed sources: focused Merge regression tests and npm ci scenario (regression)
- Remove fix matching checks by initCommandKey but preserve different flags and filters: focused Merge tests and whitespace/flags/filter scenarios (unit)
- Preserve setup/check lists and surviving fix bytes/order, including unrelated npm run format and setup/check overlap: exact-list assertions (regression)
- Emit exactly one reasoned line per dropped fix and save filtered lists through Init: local scripted-provider fixture, exact saved lists and output lines in each scenario (integration)
- Keep existing init tests green: acceptance runs go test ./setup -count=1; retain configured go build ./..., go vet ./..., and go test -race -count=1 ./... verification (existing)

## Feasibility
- A dependency-source grep for Makefile/go-format in coordinator project/detect.go returned exit 1 with no output (probe, 0.0 s); it established no detector behavior. Readiness exercises the actual fixture instead.
- Existing setup tests passed: go test ./setup -count=1 returned exit 0, output `ok  \tgithub.com/KogenAI/kogen-setup/setup\t8.872s` (probe, 11.6 s).
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-setup-fix-same-command__merge.js"],"observers":["features/steps/k-setup-setup-fix-same-command__merge.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-setup-fix-same-command__merge.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-setup-fix-same-command__merge.js bad","exit":1,"output":"rejected\n"}]}
