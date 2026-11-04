# Report one-time setup in committed configuration

Slug: k-setup-initialized-reports-bootstrap-setup
Model: not applicable — a read-only report over an already committed list has no meaningful state
Acceptance:
- .kogen/intents/k-setup-initialized-reports-bootstrap-setup/acceptance.feature
- features/steps/k-setup-initialized-reports-bootstrap-setup__notes.js

Today, when `.kogen/project.yaml` is already committed at HEAD, `initRun` in `setup/init.go` prints `Kogen is already initialized in <root>` and the `Next:` lines from `initNextLines`, and returns. It says nothing about committed setup commands, even ones that new proposals now refuse, such as a machine-wide package manager bootstrap (`mix local.hex --force`) or a global tool install (`npm install -g typescript`). Every run then repeats them.

After this change the already-initialized path checks each committed `commands.setup` entry. It uses the same predicates `initValidate` applies to proposed setup commands:
- `initMachinePrerequisite(command)`: one-time machine bootstrap and machine-wide installs.
- `initPublishesOrDeploys(command)`: publish or deploy commands.

It prints exactly one line for each entry where either predicate is true:

`Note: setup command (<command>) looks like a one-time machine bootstrap`

`<command>` is the committed entry's exact string. Entries for which both predicates are false print nothing.

The committed configuration stays authoritative and unchanged. Init writes, stages and commits nothing, runs no setup command, makes no model request and still exits 0. Only setup entries are checked; fix and checks entries are not. Nothing else changes: the proposal validation in `initValidate`, the predicates themselves, the first-run and leftover-commit paths, and the `Next:` lines.

## Decisions
- Line format, exactly: `Note: setup command (<command>) looks like a one-time machine bootstrap`, with the committed command verbatim inside the parentheses. Publish or deploy commands use the same wording, because the request specifies a single line format for every flagged command. (source: request)
- The Note lines are printed with `s.Puts`, the same result stream as the "already initialized" line. They come immediately after that line and before any `Next:` lines, one per flagged entry, in committed `commands.setup` order. (source: request)
- Flagged means `initMachinePrerequisite(command) || initPublishesOrDeploys(command)` on the committed string as-is. `initLongRunning` is not applied, because the request's Need names only one-time machine bootstrap, machine-wide installs and publish/deploy. Long-running setup entries print no Note. (source: request)
- No setup entries, or only unflagged entries, print no Note line. The rest of the output stays as it is today. (source: request)
- Nothing is written, committed or run. Working tree and HEAD are identical before and after. Exit stays 0. (source: request)

## Source comparison
- Addressed: the request's "Need" (check committed setup with the proposal predicates for one-time machine bootstrap, machine-wide installs and publish/deploy; print the exact Note line after the "already initialized" line; unflagged entries print nothing; write, commit and run nothing). Covered by the Decisions above and by every acceptance scenario.
- Addressed: the request's synthetic acceptance, all through the real `kogen-setup` CLI on a committed configuration with no model call. Each example is its own scenario in acceptance.feature, and every scenario also checks HEAD, refs, Git status and working-tree bytes before and after:
  - `mix local.hex --force` with `mix deps.get`: one Note, for the first only.
  - `npm install -g typescript`: one Note.
  - `go mod download` only: no Note.
  - No setup commands: no Note.
- Addressed: the publish/deploy predicate. The scenario with `go mod download`, `npm publish` and `terraform apply` expects Notes for the last two only, in order. This tells apart an implementation that applies only `initMachinePrerequisite`.
- Conflicting, resolved: the request's owning-file list names `initLongRunning`, but its Need lists only bootstrap, machine-wide installs and publish/deploy. The Need governs, so `initLongRunning` is not applied. No acceptance pins long-running behavior.
- Preserved: the committed `.kogen/project.yaml` is not rewritten. The existing tests `TestInitAlreadyInitializedChangesNothing` and `TestInitAlreadyInitializedPrintsWhatIsMissing` stay green unchanged, because their configurations have no flagged setup.

## Tests
- Each flagged committed setup entry prints one Note line after the already-initialized line, before the Next lines, in configured order: add a Go test in `setup/init_test.go` that uses `initNewFx(t, false)` with a committed `.kogen/project.yaml` and checks with `initWantLines`, covering `mix local.hex --force`, `npm install -g typescript`, `npm publish` and `terraform apply`. The acceptance CLI scenarios also cover this. (integration)
- Unflagged committed setup entries and an empty setup list print no Note line: cover `mix deps.get`, `go mod download` and `setup: []` in the same Go test and in the acceptance scenarios. (integration)
- The already-initialized CLI run exits 0, reports the unchanged configuration and leaves HEAD, refs, Git status and working-tree bytes unchanged: the acceptance scenarios through `kogen-setup`, plus the existing `TestInitAlreadyInitializedChangesNothing` for no commit and no model request. (scenario)
- Proposal validation and the predicates are unchanged: the existing tests in `setup/init_machine_prerequisite_test.go`, `setup/init_long_running_test.go` and the publishing tests keep passing unchanged. (existing)

## Feasibility
- Probe: on the unchanged tree, `go build -o <tmp>/setup ./cmd/kogen-setup`, then running it on a fresh repository with committed `.kogen/project.yaml` setup `['mix local.hex --force','mix deps.get']`, exited 0. Stderr was exactly `Kogen is already initialized in <root>`, `Next: set commands.acceptance in .kogen/project.yaml`, `Next: add the project's checks to commands.checks in .kogen/project.yaml`. Stdout was the JSON result with the unchanged configuration, and `git status --porcelain` was empty. The same output appeared for `setup: []` and for a config of just `version: 1`. (probe: exit 0)
- Probe: the drafted step helpers ran all five scenario configurations against the unchanged binary. Each exited 0 with only the three lines above (no Note) and identical before/after snapshots. This is the expected missing-feature red for the flagged scenarios. (probe: exit 0)
- evidence: {"id":"notes-observer","kind":"observer","inputs":["features/steps/k-setup-initialized-reports-bootstrap-setup__notes.js"],"observers":["features/steps/k-setup-initialized-reports-bootstrap-setup__notes.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-initialized-reports-bootstrap-setup__notes.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-initialized-reports-bootstrap-setup__notes.js bad","exit":1,"output":"rejected\n"}]}
