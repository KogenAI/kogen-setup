# Keep an existing steps README out of the bridge

Slug: k-setup-bridge-keeps-existing-steps-readme
Model: not applicable — the change is one path-existence check in a single init step with no evolving state
Acceptance:
- .kogen/intents/k-setup-bridge-keeps-existing-steps-readme/acceptance.feature
- features/steps/k-setup-bridge-keeps-existing-steps-readme__init.js

When a project has no Cucumber runner, init adds the Kogen bridge, which includes `features/steps/README.md`. The bridge must never replace an existing file at that path. When the path already exists (tracked or untracked, file or otherwise), init does not add the bridge: acceptance is reported as `not configured: ` with a reason that names `features/steps/README.md` and says it already exists, the existing bytes stay unchanged and the file is not part of the commit. When a parent component (`features` or `features/steps`) is not a usable directory (a regular file, or an unusable link), the bridge is likewise left out with a reason naming that component, and init does not fail with a raw operating-system error. Setup, fix, checks and protect results, and projects without that path, behave as before.

## Decisions
- The conflict is checked in `initAddBridge` on the verification copy before anything is written there, and the existing `not configured: <reason>` form is reused, so `initConfigure` (which writes and commits the README only when the bridge was added) leaves the path alone. (decision: D1, round 1) (evidence: setup/init.go) (source: request)
- A parent that is a regular file, a broken link, or a non-directory is reported as `<component> is not a usable directory, so the Cucumber bridge was left out`; an existing target is reported as `features/steps/README.md already exists, so the Cucumber bridge was left out`. (decision: D2, round 1) (assumption: exact wording beyond naming the path and saying it exists is free) (source: request)

## Source comparison
- Tracked `features/steps/README.md` with `mine`: addressed by scenario 1 (content kept, not in commit, acceptance not configured naming the path, exit 0).
- Tracked regular file `features`: addressed by scenario 2 (exit 0, reason names `features`, other configuration written and committed).
- Project with neither: addressed by scenario 3 (bridge README and `Cucumber bridge added in features/steps`).
- Existing init tests stay green: addressed by scenario 4.

## Tests
- An existing README path keeps the bridge out and its content untouched: scenario 1 (scenario)
- A non-directory path component leaves the bridge out without failing init: scenario 2 (scenario)
- A project without the path still gets the bridge: scenario 3 (regression)
- Existing init behavior is unchanged: existing setup package tests (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-bridge-keeps-existing-steps-readme__init.js"],"observers":["features/steps/k-setup-bridge-keeps-existing-steps-readme__init.js"],"checks":[{"name":"good","command":"node features/steps/k-setup-bridge-keeps-existing-steps-readme__init.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/k-setup-bridge-keeps-existing-steps-readme__init.js bad","exit":1,"output":"rejected\n"}]}
