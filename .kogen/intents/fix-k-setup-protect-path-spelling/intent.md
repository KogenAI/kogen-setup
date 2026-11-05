# Drop empty entries from the protect path union

Slug: fix-k-setup-protect-path-spelling
Model: not applicable — Merge's protect union is a deterministic list transformation with no lifecycle state
Acceptance:
- .kogen/intents/fix-k-setup-protect-path-spelling/acceptance.feature
- features/steps/fix-k-setup-protect-path-spelling__merge.js

Review finding on the landed `k-setup-protect-path-spelling` change: in `setup/init.go` `initPathUnion` (the protect union used by the public `setup.Merge`), every entry now passes through `initNormalizeProtect`, which maps both `""` and `"."` to `"."`. So an empty protect entry in either `project.Detected.Protect` or `InitProposal.Protect` makes Merge inject a `"."` protect entry, where before that change the empty string stayed as it was. This was reproduced on current main with a scratch driver: `Merge(Detected{Protect: [""]}, InitProposal{Protect: ["mix.exs"]}).Protect` is `[".", "mix.exs"]`; `Merge(Detected{Protect: []}, InitProposal{Protect: [""]}).Protect` is `["."]`; `Merge(Detected{Protect: ["", "config/.credo.exs"]}, InitProposal{Protect: ["."]}).Protect` is `[".", "config/.credo.exs"]`.

Fix: `initPathUnion` drops every entry that is the empty string `""` (from either side) before it normalizes and deduplicates. The empty entry contributes nothing to the union: it does not become `"."` and does not take a position in the order. Everything else stays the same. Non-empty entries are still normalized with `initNormalizeProtect` and deduplicated in first-occurrence order. A literal non-empty `"."` entry is still kept as `"."`. `Validate`, `initNormalizeProtect`, the Merge signature and all other init behavior do not change.

The finding also says the landed unit tests pass `[]string` protect lists to `Validate`, while the tool-call harness passes `[]any`. On current main, `Validate`'s `list()` helper goes through `initStrings`, which accepts both `[]any` and `[]string`. A scratch run gave the same result for both shapes: `["./config/.credo.exs"]` → protect `["config/.credo.exs"]` with no problems. This Intent pins that in a unit test and in acceptance. No code change is needed for it.

## Decisions
- Drop only entries that are exactly the empty string, on both the detected and proposed sides of Merge's protect union; keep a literal `"."` entry as `"."`; keep first-occurrence order for the remaining normalized entries. (source: request)
- `Validate` keeps accepting protect lists as `[]string` and `[]any` with identical results; this is confirmed, not changed. (source: request)

## Source comparison
- Addressed: the request's problem (`initNormalizeProtect("")` and `"."` both give `"."`, so Merge injects `"."` where an empty string used to be kept) was reproduced on main and is covered by the failing Merge-only rows and the Validate→Merge rows with detected `[""]`.
- Addressed: "Drop empty entries in the union": the empty string is removed in `initPathUnion` (setup/init.go) rather than kept or turned into `"."`.
- Addressed: "Confirm `list()` accepts `[]string`": acceptance rows run `Validate` with the same protect input as `[]string` and as `[]any`, expecting identical output, and a unit test does the same.
- Addressed: "First reproduce it": the scenario holds on main (observed outputs quoted above), so the fix proceeds. "Keep every existing test green; no unrelated changes": existing tests stay unchanged and must pass; no other behavior changes.
- Superseded: the pre-landing behavior of keeping `""` as a protect entry is not restored. Per the request, empty entries are dropped.

## Tests
- Merge's protect union drops empty-string entries from detected and proposed lists, keeps `"."` and keeps first-occurrence order: add `TestInitMergeProtectDropsEmpty` in setup/init_test.go. It asserts `Merge(project.Detected{Protect: []string{""}}, InitProposal{Protect: []string{"mix.exs"}}).Protect` equals `[]string{"mix.exs"}`, `Merge(project.Detected{Protect: []string{}}, InitProposal{Protect: []string{""}}).Protect` equals `[]string{}`, and `Merge(project.Detected{Protect: []string{"", "config/.credo.exs"}}, InitProposal{Protect: []string{"."}}).Protect` equals `[]string{"config/.credo.exs", "."}`. It must fail on current main (regression)
- Validate accepts protect lists as `[]string` and `[]any` with identical results: add `TestInitValidateProtectListShapes` in setup/init_test.go. It calls Validate with `[]string{"./config/.credo.exs"}` and `[]any{"./config/.credo.exs"}` against a context tracking `mix.exs` and `config/.credo.exs`, and asserts both give protect `[]string{"config/.credo.exs"}` and no problems (unit)
- Existing protect spelling, validation and merge behavior stays the same: the existing setup tests (`TestInitMergeProtectPathSpelling`, `TestInitValidateProtectPathSpelling` and the rest) pass unchanged under `GOFLAGS=-trimpath go test ./...`, and before commit also README's `go build ./... && go vet ./... && go test -race -count=1 ./...` (existing)

## Feasibility
- Reproduced on current main with a scratch Go driver calling `setup.Merge` and `setup.Validate`: `[""]`+`["mix.exs"]` → `[".","mix.exs"]`; `[]`+`[""]` → `["."]`; `["","config/.credo.exs"]`+`["."]` → `[".","config/.credo.exs"]`; Validate with `[]string` and `[]any` `["./config/.credo.exs"]` both → `["config/.credo.exs"]` with no problems. (scratch probe: go run, 0.7 s)
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/fix-k-setup-protect-path-spelling__merge.js"],"observers":["features/steps/fix-k-setup-protect-path-spelling__merge.js"],"checks":[{"name":"good","command":"node features/steps/fix-k-setup-protect-path-spelling__merge.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/fix-k-setup-protect-path-spelling__merge.js bad","exit":1,"output":"rejected\n"}]}
