# Adopt the canonical loop module path

Slug: k-setup-loop-module-path
Model: not applicable — dependency and import wiring has no meaningful new state
Acceptance:
- .kogen/intents/k-setup-loop-module-path/acceptance.feature
- features/steps/k-setup-loop-module-path__commands.js

Replace the bare loop module identity with github.com/KogenAI/kogen-loop throughout production, tests and generated Go driver templates (including features/steps/provider-init-driver.go.txt). Preserve behavior and existing tests. Remove the bare requirement and replacement, update go.sum, and introduce no go.work or replacement directives. Run go mod tidy after the migration.

## Decisions
- Use the current main revisions discovered during shaping, pinned rather than resolving moving branches during verification: loop 708a69af07b8a1b103b9aefdb2bbc63d0a8c37ed; coordinator f15509472852998091680d2bc41bff6734599dae; executor 49f915c19779babc94756caefb513d8ad3367c6a; verification b7d89bf3b5132c56d4664920d69a06abe87a0842 (source: request)
- In the same change run go get github.com/KogenAI/kogen-loop@708a69af07b8a1b103b9aefdb2bbc63d0a8c37ed and the analogous go get github.com/KogenAI/<component>@<sha> for each of the three revisions above, then go mod tidy (source: request)
- No behavior, API, prompt, golden-output or configuration changes (source: request)

## Source comparison
- Addressed: Request Need removes replace kogen-loop => github.com/KogenAI/kogen-loop <version> and kogen-loop v0.0.0, migrates every bare import, and requires canonical main via go get; the prose, Decisions and acceptance cover these outcomes including go.sum and no go.work.
- Addressed: Request Order reports the previous blocked/failed attempt due to coordinator, executor and verification bare imports; the three discovered main revisions now declare canonical dependencies and contain no bare Go imports. Decisions upgrade all three together, and acceptance checks exact versions and resolved imports. This supersedes attempting only the direct loop upgrade, not the requested behavior.
- Addressed: Request Acceptance preserves go build ./... && go vet ./... && go test ./... and the exact grep absence check. Existing behavior tests remain unchanged except import spelling; README race testing remains required before delivery.
- Omitted: no requested product behavior. No external dependency source is edited; an unused loop dependency features/steps driver still contains a bare import, but is not in this project's compiled dependency closure. Acceptance checks actual resolved packages, not all unused files in downloaded repositories.

## Tests
- Canonical module identity and all four pinned main dependencies without replacement or workspace: command scenarios inspect Go module output (integration).
- No bare imports in this repository or resolved build/test dependency imports: grep and go list scenarios (regression).
- No behavior change: existing build, vet, go test and README race suite pass (existing).
- Tidy module and checksum files: go mod tidy -diff succeeds (integration).

## Feasibility
- Authoritative Go Modules Reference discovered by documentation search and fetched at https://go.dev/ref/mod (retrieved, untrusted body); revision queries are converted by Go into canonical pseudo-versions.
- Probe 1 (exit 0, 12.3 s) resolved all four main SHAs, confirmed Go 1.27.2 and passing build/vet/test baseline.
- Probe 2 (exit 0, 32.3 s) downloaded each exact SHA and observed the pseudo-versions asserted in acceptance.
- Probe 3 (exit 0, 0.5 s) used an overbroad module-cache glob and mixed historical versions; it does not establish migration support. It also confirmed go list and go mod edit commands are available.
- Probe 4 (exit 1, 0.0 s) found an unused bare import in loop's features/steps/read_file_binary_notice_driver.go; do not claim every downloaded source file is migrated.
- Probe 5 (exit 0, 0.0 s) inspected the exact three component versions: canonical loop requirements and no bare Go import matches. Final compiled closure is verified by acceptance.
