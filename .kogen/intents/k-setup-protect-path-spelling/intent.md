# Normalize setup protection path spelling

Slug: k-setup-protect-path-spelling
Model: not applicable — deterministic path validation and union transformations have no meaningful lifecycle state
Acceptance:
- .kogen/intents/k-setup-protect-path-spelling/acceptance.feature
- features/steps/k-setup-protect-path-spelling__validate.js

Normalize protect entries in setup/init.go before tracked-file and eligibility checks. Keep normalized relative paths in the returned proposal and deduplicate on normalized paths in Validate and Merge's protect union. Replace raw-string comparison/deduplication only; retain all other init validation and eligibility policy. No provider, prompt, configuration schema or public signature changes are needed.

## Decisions
- Remove leading ./, repeated slashes and trailing slashes; convert absolute paths contained within InitContext.Root to relative paths. Preserve first-occurrence order when collapsing aliases. (source: request)
- Reject any path containing a parent-directory component (`..`), even if cleaning would bring it inside the root; reject outside absolute paths, including root-prefix siblings. Report `protect path <input> leaves the project folder` instead of the untracked problem for these inputs. This is lexical normalization, not symlink resolution. (source: request)
- Untracked paths retain `protect path <normalized> is not a tracked file`. Eligibility uses normalized paths and normalized Contents lookup without weakening existing policy. Merge has no Root argument: normalize relative spelling in its union; absolute conversion occurs in Validate with Root. (source: request)

## Source comparison
- Addressed: request Problem/Need raw spelling failures and exact-string duplicate union are replaced by the normalization, retention and union rules above and executable outline cases below.
- Addressed: synthetic root `/work/p`, tracked `mix.exs` and `config/.credo.exs`, both supplied accepted spellings, alias pair, `../other/.credo.exs`, `/etc/passwd`, and `config/missing.exs` are preserved in acceptance. Extra rows cover request literals `./mix.exs`, `config//.credo.exs`, trailing slashes, normalized untracked diagnostics, internal `..`, and absolute-root containment boundary.
- Addressed: request's `.credo.exs`/`./.credo.exs` duplicate example is covered directly through Merge; existing init tests remain required. No requested behavior is omitted or superseded. The exact leaves-folder diagnostic is settled here from the request's required meaning; untracked text is unchanged.

## Tests
- Normalize accepted relative and in-root absolute spelling before tracked/eligibility checks and retain canonical proposal entries: add focused Validate table regressions, including eligible mix.exs content lookup (regression)
- Collapse normalized duplicates in proposal and Merge while retaining first occurrence order: add Validate and Merge union cases (unit)
- Refuse parent components and outside absolute paths with leaves-folder diagnostics, including prefix siblings: add Validate rejection cases (unit)
- Keep untracked diagnostics with normalized spelling: add Validate diagnostic cases (regression)
- Preserve existing init behavior: run existing setup tests and configured checks, including `GOFLAGS=-trimpath go test ./...`; before commit also run README's `go build ./... && go vet ./... && go test -race -count=1 ./...` (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-protect-path-spelling__validate.js"],"observers":["features/steps/k-setup-protect-path-spelling__validate.js"],"checks":[{"name":"good","command":"node features/steps/k-setup-protect-path-spelling__validate.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/k-setup-protect-path-spelling__validate.js bad","exit":1,"output":"rejected\n"}]}
