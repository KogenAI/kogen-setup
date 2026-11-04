# Move init lineups to the models file

Slug: k-setup-models-file
Model: not applicable — file/API wiring preserves the existing init lifecycle rather than introducing a new state machine
Acceptance:
- .kogen/intents/k-setup-models-file/acceptance.feature
- features/steps/k-setup-models-file__cli.js

Move the chosen team lineup out of project.yaml into project.ModelsPath (.kogen/models.yaml), using project.ModelsTemplate() for defaults and project.LoadModels(root) for existing lineups. Project.yaml retains commands, checks, acceptance, protection and all other configuration, without its top-level models key. Preserve one commit, one shaping request, command rendering and mutation-path reporting.

Require landed coordinator main with `go get github.com/KogenAI/kogen-coordinator@main`, updating go.mod/go.sum as needed and retaining the real github.com/KogenAI/kogen-loop module path. The checkout already pins v0.0.0-20261104010828-f15509472852 with the expansion API. Use its actual format: `models:` wrapping the role mappings. Remove only the top-level project lineup, never a models-header substring within a command scalar. Include the models file in init's writes, snapshots/restores, staging and single commit, including empty repositories and commit-leftover paths. Read existing lineups through the new API rather than legacy project defaults; do not overwrite existing team choices. Keep asked-once, render and five-path mutation-display behavior otherwise unchanged. Update affected setup, contract and consumes tests and documentation without weakening their useful coverage.

## Decisions
- No new command, flag or option; only the lineup location changes. (source: request)
- Expand then contract: coordinator expansion lands first; this independent consumer follows K-SETUP-LOOP-MODULE-PATH and requires coordinator main. No paired landing. (source: request)
- Use the landed expansion API's wrapped models format, correcting the failed attempt's unwrapped fixture. (source: request)

## Source comparison
- Addressed: original Need's write/read, project separation and one commit through the outcome above and initial/repeat CLI acceptance. Full setup/contract/consumes regression execution retains the suite's remaining behavior.
- Superseded: the historical 763c1ecc render diff's unwrapped top-level role format by the delivery requirement to use landed coordinator main. Installed f15509472852 emits and requires `models:` wrapping roles. The repeat fixture is therefore `models:\n  shape:\n    model: gpt-6.1-sol\n    effort: low\n`, not the earlier unwrapped counterexample that LoadModels rejects.
- Addressed: TestInitWritesTheConfigurationAndTheBridgeInOneCommit, asked-once tests, TestInitRenderKeepsCommandsContainingModelsHeader and TestInitMutationPathListAtFive must retain their existing guarantees with the new file. The seven reported consumer failures motivate updating these expectations rather than removing tests.
- Superseded: original pinned-only compatibility and paired-landing Decision by Revised decision and delivery's expansion-first prerequisite. No private candidate source or coordinator implementation is required.
- Addressed: the automatic retry's builder-reported contradiction is historical, unproven stop evidence; installed module inspection independently confirms the wrapper. This Intent fixes the fixture/API contradiction without requiring protected production edits.

## Tests
- Store default/chosen lineup separately and commit it together with existing init artifacts: initial CLI scenario plus updated init and contract tests (integration)
- Read and preserve an existing wrapped team lineup without another commit or shaping request: repeat CLI scenario plus updated existing asked-once tests using the new file (regression)
- Preserve commands containing models headers while omitting the project lineup: update TestInitRenderKeepsCommandsContainingModelsHeader (regression)
- Include the models file in owned mutation paths, rollback and leftover handling while retaining the five-path display boundary: update TestInitMutationPathListAtFive and affected lifecycle tests (regression)
- Keep setup, contract and consumer behavior with the expanded coordinator and real loop module path: full setup/contract/consumes acceptance gate plus configured checks and go test -race -count=1 ./... (existing)

## Feasibility
- Inspected installed coordinator f15509472852 project/models.go and render.go: ModelsTemplate emits a wrapper, LoadModels requires it, while legacy RenderConfig still appends project models. Setup must explicitly separate its project rendering. (probe: exit 0, 1.2 s)
- Existing `go test ./setup ./contract` passed on the unchanged tree (exit 0, 9.7 s); acceptance runs existing complete packages, not unwritten named tests.
- Documentation search for the coordinator models API returned unrelated GitHub sources, not authoritative API documentation. No API documentation body was obtained; installed required module source supplies direct technical evidence.
