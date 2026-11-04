# Refuse checks that mask their own failure

Slug: k-setup-check-masks-failure
Model: not applicable — literal command validation has no meaningful state
Acceptance:
- .kogen/intents/k-setup-check-masks-failure/acceptance.feature
- features/steps/k-setup-check-masks-failure__validate.js

Extend setup/init.go Validate's checks loop to refuse literal failure-masking tails through its existing problem list. Do not execute proposed commands to classify them. Preserve existing validation and setup/fix behavior. A runs-nothing command retains its existing diagnostic only.

## Decisions
- Recognize unquoted literal final `|| true`, `|| :`, `|| exit 0`, `; true`, `; :`, `; exit 0`, and a final background `&` without wait. Use the diagnostic `check <name> (<command>) ignores its own failure`. (source: request)
- Keep conservative recognition: real recovery commands, if/case blocks and quoted text are not grounds for this new refusal. Quoted echo remains subject to runs-nothing. Pipeline endings such as `cmd1 | cat` motivate the problem but are not an additional rejection class beyond the enumerated literal syntax. (source: request)
- Apply this refusal only to proposed checks, not setup or fix commands. (source: request)

## Source comparison
- Addressed: request Problem/Need and synthetic acceptance map to the decisions and all outline rows, including masked/masked2/masked3, honest and quoted, exact diagnostics and the README-only fixture.
- Addressed: existing runs-nothing precedence and unchanged init tests are required by the outcome and Tests below.
- Addressed: request recovery examples and if/case/quoted exceptions are executable rows. Background with wait is the adjacent allowed boundary.
- Omitted: no new general shell analyzer or pipeline refusal is authorized by the enumerated Need; the Problem's `cmd1 | cat` is motivation, not a requested extra tail. No supplied literal is replaced.
- Superseded: automatic retry's invalid report is addressed by separate independently reported outline examples, each with one direct JSON assertion rather than assertions on test-runner summaries.

## Tests
- Literal mask tails and background refusal: add focused Validate regression cases and execute the outline against public Validate (regression)
- Recovery, quoting, blocks and wait boundaries: add Validate table cases and execute allowed outline rows (unit)
- Setup/fix and existing no-op rules remain unchanged: outline rows plus existing TestInitValidateRunsNothing (regression)
- Existing init behavior stays green: run configured checks and existing init suite unchanged (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-check-masks-failure__validate.js"],"observers":["features/steps/k-setup-check-masks-failure__validate.js"],"checks":[{"name":"good","command":"node features/steps/k-setup-check-masks-failure__validate.js good","exit":0,"output":""},{"name":"bad","command":"node features/steps/k-setup-check-masks-failure__validate.js bad","exit":1,"output":""}]}
