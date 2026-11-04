# Cap the size of each proposed configuration list

Slug: k-setup-proposal-size-bounded
Model: not applicable — Validate is a pure check of one submitted proposal; the caps add a count rule per list and no state or interacting transitions
Acceptance:
- .kogen/intents/k-setup-proposal-size-bounded/acceptance.feature
- features/steps/k-setup-proposal-size-bounded__validate.js

`setup.Validate` (setup/init.go) currently accepts any number of `setup`, `fix`, `checks` and `protect` entries in a `submit_configuration` call, as long as each entry is valid on its own. After this change, named constants in setup/init.go cap each list: at most 20 setup commands, 10 fix commands, 20 checks and 50 protect paths. Name them in the existing `const` block at the top of setup/init.go: `initMaxSetup = 20`, `initMaxFix = 10`, `initMaxChecks = 20`, `initMaxProtect = 50`.

When a submitted list has more entries than its cap, Validate adds exactly one problem for that list, with this exact text:

`<list> has <n> entries; at most <cap> are allowed; keep the ones the project needs`

Here `<list>` is the argument key (`setup`, `fix`, `checks` or `protect`), `<n>` is the number of entries in the submitted list (counted before Validate drops duplicate protect paths), and `<cap>` is that list's constant. Examples: `setup has 21 entries; at most 20 are allowed; keep the ones the project needs`, `fix has 11 entries; at most 10 are allowed; keep the ones the project needs`, `checks has 21 entries; at most 20 are allowed; keep the ones the project needs` and `protect has 51 entries; at most 50 are allowed; keep the ones the project needs`. As with every other problem, Validate then returns the zero `InitProposal` and the problems. `initConverse` already sends them back to the model as `invalid: <problems joined by "; ">` and allows one corrected answer. That path does not change.

The cap only adds a problem. Other problems Validate already reports for the same proposal, including problems about individual entries of an over-cap list, are still reported. When several lists are over their caps, each gets its own problem. The order of the cap problems relative to each other and to other problems is not part of the contract. When a field is absent, nothing is counted. When a field is not a list, only the existing `<key> must be a list` problem is reported. Lists at or under their cap behave exactly as they do today.

Only the model's proposal is counted. Checks that Detect found (`InitContext.DetectedChecks`), and any detected commands that `Merge` adds later, do not count toward a cap. With 3 detected checks and 20 proposed checks, Validate accepts the proposal and Merge returns all 23. With 3 detected checks and 21 proposed checks, the only problem is `checks has 21 entries; at most 20 are allowed; keep the ones the project needs` (21, not 24). `Merge` is unchanged and can return more than 20 checks.

Out of scope: the init prompt (`setup/prompts/init.md`), the `submit_configuration` tool definition and their golden files (`setup/testdata/prompts_golden.json`, `defs_golden.json`) stay byte-identical. No caps go on `Merge`, Detect or the written configuration. The existing tests of the `setup` package (`go test -count=1 ./setup`) keep passing.

## Decisions
- Caps: at most 20 setup commands, 10 fix commands, 20 checks and 50 protect paths, held in named constants (source: request)
- One problem per over-cap list, worded `<list> has <n> entries; at most <cap> are allowed; keep the ones the project needs`, returned to the model like other problems (source: request)
- Lists at or under their cap are unaffected (source: request)
- Detected commands that Merge adds later are not counted (source: request)
- Existing init tests stay green (source: request)

## Source comparison
- Owning file setup/init.go (Validate, initStrings, initChecks): addressed. The count rule lives in Validate's handling of the lists those helpers parse (prose above).
- Caps 20/10/20/50 and the constant names: addressed (prose; scenarios "Every list at its cap …" and each over-cap scenario).
- Problem literal `<list> has <n> entries; at most <cap> are allowed; keep the ones the project needs`: addressed. The exact strings for setup/21/20, fix/11/10, checks/21/20 and protect/51/50 are in acceptance.feature.
- "the model gets it back like other problems": addressed by the unchanged initConverse correction path (existing). No new wiring.
- "21 distinct valid setup commands yield exactly one problem naming setup, 21 and 20; 20 yield none": scenarios "21 setup commands …" and "Every list at its cap …".
- "11 fix commands, 21 checks and 51 protect paths (tracked) each yield one problem for their own list; at the cap none": one scenario per list, plus "Every list at its cap …" (protect paths are in `InitContext.Tracked`).
- "two lists over their cap yield two problems and no proposal": scenario "Two lists over their caps …" (fix 11 and protect 51, with setup and checks at their caps).
- "Detected commands merged in later by Merge are not counted": scenario "Detected checks do not add to the checks count" (21 proposed plus 3 detected yield exactly the 21-entry problem).
- "a fixture with 3 detected checks and a proposal of 20 checks passes Validate and Merge returns all of them": scenario "Detected checks are not counted and Merge returns all of them".
- "Existing init tests stay green": scenario "Existing init tests stay green" runs `go test -count=1 ./setup` and requires exit 0. The configured `go-test` check also runs them.
- Omitted: no prompt, tool-schema (`maxItems`) or golden-file change. The request asks only for Validate to refuse.

## Tests
- A list over its cap yields exactly one problem `<list> has <n> entries; at most <cap> are allowed; keep the ones the project needs` and no proposal; at the cap it yields none (setup 21/20, fix 11/10, checks 21/20, protect 51/50 tracked paths): add `TestInitValidateProposalSize` in a new setup/init_size_test.go calling `Validate` with distinct valid entries (unit)
- Two lists over their caps yield two problems and the zero proposal: a case in `TestInitValidateProposalSize` (unit)
- Detected checks are not counted: cases in `TestInitValidateProposalSize` with 3 `InitContext.DetectedChecks`. 21 proposed checks yield only the 21-entry problem. 20 proposed checks pass Validate, after which `Merge` returns all 23 checks (unit)
- Validate problems go back to the model as the correction: existing initConverse correction tests in setup (existing)
- Existing init tests stay green: existing `setup` package tests, run by the acceptance step and the configured go-test check (existing)

## Feasibility
- Generated entries are distinct and individually valid under today's Validate: 21 setup `mkdir -p build/sNN`, 11 fix `gofmt -w pkgNN`, 21 checks `check-NN`/`go vet ./pkgNN`, 51 tracked protect `docs/pNN.md` and 3 detected `detected-N`/`go test ./detectedN` gave no problems, and Merge returned 24 checks. A driver main.go in a temporary directory built with `go build -o <bin> <dir>/main.go` from the repository root (scratch probe: exit 0, 0.7 s build).
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-proposal-size-bounded__validate.js"],"observers":["features/steps/k-setup-proposal-size-bounded__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-proposal-size-bounded__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-proposal-size-bounded__validate.js --control bad","exit":1,"output":"rejected\n"}]}
