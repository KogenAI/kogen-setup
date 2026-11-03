# Deduplicate whitespace-equivalent commands

Slug: k-setup-merge-equivalent-commands
Model: not applicable — deterministic list transformation, with no meaningful state machine
Acceptance:
- .kogen/intents/k-setup-merge-equivalent-commands/acceptance.feature
- features/steps/equivalent_commands.js
- features/steps/init_fix_steps.js

Replace exact command equality in setup/init.go Merge and initUnion with whitespace-normalized comparison. Trim both ends; collapse runs of ASCII spaces and tabs outside single and double quotes to one space. Preserve all quoted bytes and quote characters; escaped quotes do not end a quoted span. Interior newlines are not collapsed. Keep the first surviving command's original bytes and name. Retain existing same-name proposed-check replacement before deduplication and existing survivor order. Do not parse semantic equivalence, reorder flags, detect subsets, execute normalized text, or add dependencies. Protect entries are paths rather than commands: preserve their existing exact-string union behavior even if this requires separating their union from initUnion.

## Decisions
- Preserve first original command and name, whitespace-insensitive command equality outside quotes, and existing ordering (source: request).
- Keep arguments, flags, quote spelling, quoted whitespace and argument order distinct; no semantic equivalence (source: request).

## Source comparison
- addressed: Request Problem and Need, owning setup/init.go Merge/initUnion: transformation described above replaces exact equality for checks/setup/fix; acceptance's unit observations cover first retention, tabs, trailing newline, quote distinctions, flags and order.
- addressed: Synthetic acceptance's detected test=`go test ./...`, proposed unit=`go  test ./...`, and repeated `npm ci`/`npm  ci ` are literal executable inputs; quoted echo and race counterexamples remain distinct in exact ordered expected results.
- addressed: Synthetic acceptance requires unit-level Merge/initUnion and one init run; the feature exercises both and runs setup.Init through the existing loopback harness. Existing init tests remain required via configured Go checks.
- omitted: no requested behavior omitted. The Protect path union is explicitly unchanged, not newly interpreted as shell commands. README and testing rules remain applicable; unrelated historical examples in supplied policy create no additional feature scope.

## Tests
- Equivalent check Run values retain first original name/text after existing name replacement: add focused Merge regression cases and execute unit observations (regression).
- Setup/fix and initUnion normalize boundary whitespace and outside spaces/tabs with stable first retention: add table-driven result tests and execute unit observations (unit).
- Quoted text, quote spelling, distinct flags/arguments/order remain distinct: add quote-aware normalization result cases and exact ordered unit observations (unit).
- Preserve same-name replacement and exact Protect path union: retain TestInitMergeProposedCheckReplacesDetectedOthersFollow and add a path-whitespace preservation case (unit).
- Init verifies and writes an equivalent command only once: execute existing Init harness with two equivalent true checks and assert saved checks and absence of second verification (integration).
- Existing init behavior remains green: run configured checks and README race suite (existing).

## Feasibility
- Existing init harness accepted duplicate true checks and reported both verification lines and both saved names on unchanged code (probe 1: exit 0); this confirms the end-to-end regression fixture reaches command merging without external services.
- evidence: {"id":"comparison-controls","kind":"observer","inputs":["features/steps/equivalent_commands.js"],"observers":["features/steps/equivalent_commands.js"],"checks":[{"name":"good","command":"node features/steps/equivalent_commands.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/equivalent_commands.js bad","exit":1,"output":"rejected\n"}]}
