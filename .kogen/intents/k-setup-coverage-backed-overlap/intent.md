# Remove coverage-backed command overlap

Slug: k-setup-coverage-backed-overlap
Model: not applicable — this is source-qualified command selection, not a new persistent state machine; Init's existing lifecycle remains unchanged
Acceptance:
- .kogen/intents/k-setup-coverage-backed-overlap/acceptance.feature
- features/steps/k-setup-coverage-backed-overlap__observe.js

Avoid repeating setup and test work in the configuration produced by Init when committed project sources establish that retained commands already perform that work. Replace equivalent-string-only selection for these established overlaps, not existing verification, source validation, same-name replacement, or unrelated ordering rules. Preserve full intended test coverage and all other setup effects. No new settings, provider requests, dependencies, or changes to this repository's .kogen/project.yaml are required.

Use local synthetic npm projects with no dependencies and actual Node fixture tests. The full script explicitly lists both paths; changed discovery lists only a; unknown discovery obtains paths from an environment variable. Treat environment-dependent selection as unestablished from committed sources, even though this acceptance execution happens to run both paths. The controlled model proposes setup plus separately named checks, leaving the detected full command in play. These are technical fixture choices, not a restriction to one ecosystem. Preserve conservative behavior for unsupported/dynamic source forms. Implement overlap selection where committed source context is available; do not force context-free Merge to guess. Prefer the full command over redundant path-specific commands when its coverage is established.

## Decisions
- A source-defined setup invoking detected dependency preparation subsumes that preparation; retain its additional effects and perform preparation once per selected setup execution. (source: request)
- Remove separately named path tests covered by a retained full test command only when project sources, including discovery configuration and filters, establish coverage. Retain explicit paths that add coverage, and retain distinct commands whose coverage cannot be established. (source: request)
- Qualify selection against committed verification configuration, not command spelling alone. Successful execution of a full command does not by itself prove coverage. (source: request)

## Source comparison
- Addressed: request Problem and Need concerning dependency preparation alongside source-defined setup are covered by the setup rule and prep/other effect assertions in every scenario. Exact-string deduplication remains but is not overlap evidence.
- Addressed: synthetic full command plus two separately named paths is represented by package scripts test, test-a and test-b and real test/a.test.cjs and test/b.test.cjs executions; the full scenario requires both tests once with one retained check.
- Addressed: changed discovery/filters counterexample changes the test script to select only test/a.test.cjs; filtered acceptance still requires b coverage and no repeated a execution. An explicit discovery-path change exercises the requested discovery-or-filter case.
- Addressed: unknown coverage retaining distinct checks is represented by environment-selected full discovery and all three retained checks, even though this runtime selection overlaps.
- Addressed: README Init contract remains one model request, committed-tree verification and configuration commit; acceptance calls real setup.Init through existing fixture helpers and loads the written configuration. Preserve useful verification and contract tests; update deliberate prompt goldens only if prompt bytes change.
- No requested behavior is omitted or superseded. The fixtures are examples, not authority to blanket-remove explicit paths or restrict coverage reasoning to npm. No protected implementation edit is necessary.

## Tests
- Setup subsumption preserves other effects and executes preparation once: scenarios execute selected setup and count prep and other effects (regression)
- Established full-test coverage removes repeated path-test work: full scenario qualifies both paths by actual executions then executes checks from the written configuration (integration)
- Discovery changes can make explicit paths add coverage: filtered scenario qualifies full and explicit executions separately and requires both tests exactly once (regression)
- Unknown coverage retains distinct commands: unknown scenario requires three checks and observes both tests twice (integration)
- Source-qualified selection logic: add focused unit cases for supported source relationships and conservative unknown results through the selection interface, preserving unrelated ordering and same-name behavior (unit)
- Existing Init verification, equivalence and contract behavior: retain Go tests and run configured checks plus README's go build ./..., go vet ./..., and go test -race -count=1 ./... (existing)

## Feasibility
- Local availability probe returned Go 1.27.2, Node at /home/lanes/.local/share/mise/installs/node/24.21.0/bin/node, and npm 11.19.0, exit 0. Paths are observations, not implementation literals; fixtures resolve tools from PATH.
- Documentation search for npm scripts/lifecycle returned retrieved sources including https://docs.npmjs.com/. Fetch of https://docs.npmjs.com/cli/v11/commands/npm-run-script returned unsupported with an empty body; no lifecycle claim is inferred. Final-byte controls exercise local npm ci and Node tests.
- evidence: {"id":"overlap-observer","kind":"observer","inputs":["features/steps/k-setup-coverage-backed-overlap__observe.js"],"observers":["features/steps/k-setup-coverage-backed-overlap__observe.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-coverage-backed-overlap__observe.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-coverage-backed-overlap__observe.js bad","exit":1,"output":"rejected\n"}]}
