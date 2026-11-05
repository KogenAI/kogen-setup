# Refuse dependency installation in fix commands

Slug: k-setup-fix-installs-dependencies
Model: not applicable — pure command validation has no meaningful state
Acceptance:
- .kogen/intents/k-setup-fix-installs-dependencies/acceptance.feature
- features/steps/k-setup-fix-installs-dependencies__validate.js

`setup.Validate` (setup/init.go) already refuses a check whose command installs dependencies, using `initInstallsDependencies`, but accepts the same commands as fix commands. Fix commands run after builds to tidy the tree; an install there changes the dependency folder and lockfiles at an unexpected time and is not repeated by later setup. After this change, the fix loop in `Validate` refuses a fix command that `initInstallsDependencies` recognizes, with the problem `fix command <command> installs dependencies; put the install in setup`, where `<command>` is the full original fix command. The recognition itself (installer list, separators, whole leading words) is reused unchanged; it is not extended, narrowed or duplicated. Fix commands that do not install, setup commands (which may install), the existing check refusal, every other existing refusal and the proposal returned for valid input stay as they are. This replaces the current acceptance of installing fix commands (for example `npm ci` or `npm install` as a fixer).

## Decisions
- A fix command for which `initInstallsDependencies(command)` is true adds exactly one problem `fix command <command> installs dependencies; put the install in setup`, with the full original command (for example `fix command npm install installs dependencies; put the install in setup` and `fix command mix deps.get installs dependencies; put the install in setup`). Any problem makes `Validate` return the zero `InitProposal`, as for every other problem. (source: request)
- Placement in the fix loop, mirroring the check loop's ordering of the install problem before runs-nothing/masks-failure: after the existing credential-literal and control-character branches (both still `continue` first, so their entries keep exactly their current single problem) and before the existing "runs nothing" problem. So `npm ci || true` as a fix yields, in order, `fix command npm ci || true installs dependencies; put the install in setup` then `fix command npm ci || true ignores its own failure`; a fix entry containing a control character such as `mix format\nmix deps.get` keeps only its existing control-character problem. (source: request)
- Non-installing fix commands such as `npm run format` and `gofmt -w .` are accepted and returned unchanged in the proposal's Fix list. Setup `npm install` remains accepted; check `npm install` keeps its existing `check <name> (npm install) installs dependencies; put the install in setup` refusal. (source: request)

## Source comparison
- Addressed: Problem and Need (refuse installing fix commands with the exact wording, same recognition as checks) are covered by the first Decision and the acceptance outline for `npm install` and `mix deps.get` as fixers, plus `npm ci` and `npm i` from the same existing recognizer.
- Addressed: synthetic acceptance examples — fix `npm install` refused, fix `mix deps.get` refused, fix `npm run format` accepted with the unchanged proposal, setup `npm install` accepted, check `npm install` keeps its refusal — are each executable scenarios.
- Addressed: "other refusals do not change" is pinned by the `npm ci || true` ordering scenario (existing masks-failure refusal kept) and the control-character scenario (existing refusal kept alone).
- Conflicting existing expectations superseded: `setup/init_check_installs_test.go` asserts that fix `npm ci` yields no problems, and `setup/init_credentials_test.go` asserts that fix `npm ci` (in its list of non-credential commands) yields no problems; both encode the old acceptance that the request replaces, so the Build updates those expectations (the request's "existing init tests stay green" applies to all other tests). Earlier Intents' acceptance files (k-setup-check-installs-dependencies "Leave setup and fix installation alone" and k-setup-setup-masks-failure "Preserve fix acceptance" for `npm ci || true`) describe the superseded fix behavior; they are historical and are not edited by this Intent.
- Omitted: no change to the installer list, to setup validation, to Merge, to Init's verification or to the prompt; none is requested.

## Tests
- Refuse installing fix commands (`npm install`, `mix deps.get`, `npm ci`, `npm i`) with the exact problem and zero proposal: add Validate unit table cases in setup (for example in setup/init_check_installs_test.go or a new setup/init_fix_installs_test.go) (unit)
- Accept non-installing fix commands (`npm run format`) with the unchanged proposal: Validate unit case asserting no problems and Fix equal to the input (unit)
- Keep setup `npm install` accepted and check `npm install` refused with its existing wording: existing check table plus a Validate case for setup (existing)
- Keep other fix refusals and their order (`npm ci || true` gives install then ignores-failure; control-character entry keeps only its control-character problem): Validate unit cases (unit)
- Replace the old fix-install acceptance: update the fix `npm ci` expectation in setup/init_check_installs_test.go and remove or re-expect `npm ci` in the fix no-problem list of setup/init_credentials_test.go (unit)
- Preserve all other init behavior: go build ./..., go vet ./..., go test -race -count=1 ./... and the configured checks (existing)

## Feasibility
- evidence: {"id":"validate-observer","kind":"observer","inputs":["features/steps/k-setup-fix-installs-dependencies__validate.js"],"observers":["features/steps/k-setup-fix-installs-dependencies__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-installs-dependencies__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-installs-dependencies__validate.js --control bad","exit":1,"output":"rejected\n"}]}
