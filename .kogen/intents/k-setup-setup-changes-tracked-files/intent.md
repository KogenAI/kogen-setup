# Reject setup that changes tracked files

Slug: k-setup-setup-changes-tracked-files
Model: .kogen/intents/k-setup-setup-changes-tracked-files/model.qnt invariants=Restored,KeptRepeatable seed=17 samples=100 steps=10
Acceptance:
- .kogen/intents/k-setup-setup-changes-tracked-files/acceptance.feature
- features/steps/setup_tracked.js

Fix setup/init.go's initVerify setup loop. Before each entry save the tracked state using the existing snapshot/tree helpers. After a successful first execution compare tracked content, mode and existence with that pre-entry state. Still execute the second run on the first run's tree: existing second-run failure, timeout and changed-state decisions and wording take precedence. If repeatable but tracked paths changed on the first run, omit the command with `setup-<n> (<command>) changed <paths>`. Sort paths, show at most five, and append `, ...` when there are more. Restore changed tracked paths to their pre-entry content, mode and existence before later entries and checks, including when a second-run rejection takes precedence. Do not reset, remove or restore unrelated untracked or ignored paths. Keep first-run failure behavior unchanged. Reuse the check loop's snapshot and restoration approach rather than resetting the whole copy. No provider, prompt, configuration schema or public API changes.

## Decisions
- Ignored dependency installation remains permitted; repeatability is necessary but no longer sufficient for keeping setup. (source: request)
- Preserve not-repeatable rules and messages, with precedence over the new tracked-change reason. (source: request)

## Source comparison
- Addressed: request Problem and Need, owning setup/init.go/initVerify; the outcome paragraph replaces acceptance based only on two matching runs with per-entry tracked-state preservation while retaining repeatability.
- Addressed: request's synthetic s1=`mkdir -p deps && echo d > deps/f`, s2=`grep -q y a.txt || echo y >> a.txt`, s3=`true`, check ok=`test "$(cat a.txt)" = x`, README.md, a.txt=`x` and .gitignore=`deps/` are retained in acceptance's reproducer. Loaded project.yaml setup/check arrays and summary lines prove omission, retained ignored install and restored content observed by ok.
- Addressed: content, mode, existence, five-path limit and adjacent six-path truncation are executable cases; restoration is observed by later setup and checks. Existing init tests must remain green.
- Omitted: none of the requested behavior. No conflicting or superseded product decisions. Historical provider/Studio examples in testing guidance are not changes requested of this repository.

## Tests
- Reject a settling tracked-content mutation, restore before subsequent entries and checks, and omit it from project.yaml: synthetic fixture through real Init using existing contract fixture (regression)
- Preserve ignored and untracked paths: retained setup and checks consuming those artifacts (integration)
- Reject and restore tracked mode and existence mutations: shell mutations followed by validating checks (integration)
- Sort and cap changed paths at five, with truncation only above five: five/six-file cases (integration)
- Preserve repeatability failure precedence while restoring tracked files: second-run failure and changing second-run cases (regression)
- Keep existing init behavior: go test ./... and existing TestInitLeavesOutSetupThatCannotRunTwiceOnTheSameTree (existing)

## Feasibility
- Quint model typechecked successfully in scratch (exit 0). An attempted probe of privately retained proposal paths failed because they are not copied into scratch; it established no observer evidence.
- evidence: {"id":"setup-observer","kind":"observer","inputs":["features/steps/setup_tracked.js"],"observers":["features/steps/setup_tracked.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/setup_tracked.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/setup_tracked.js bad","exit":1,"output":"rejected\n"}]}
