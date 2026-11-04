# Report checks that cannot fail in committed config

Slug: k-setup-initialized-reports-vacuous-checks
Model: not applicable — a read-only report over an already committed check list has no meaningful state
Acceptance:
- .kogen/intents/k-setup-initialized-reports-vacuous-checks/acceptance.feature
- features/steps/k-setup-initialized-reports-vacuous-checks__notes.js

A committed check that can never fail lets a build pass without testing anything. Examples are a check that only prints (`echo ok`) and one that ends in `|| true`. Today, when `.kogen/project.yaml` is already committed at HEAD, `initRun` in `setup/init.go` prints three things and returns:
- `Kogen is already initialized in <root>`;
- a `Note: setup command (<command>) looks like a one-time machine bootstrap` line for each flagged setup entry;
- the `Next:` lines from `initNextLines`.

It says nothing about committed checks that cannot fail, so they look like a regression suite when they are not.

After this change, the already-initialized branch also looks at each committed `commands.checks` entry (`cfg.Checks`, each a `project.Check` with `Name` and `Run`), in configured order. It uses the existing predicates on the committed `Run` string exactly as written:
- if `initRunsNothing(Run, true)` is true, the reason is `runs nothing`;
- otherwise, if `initMasksFailure(Run)` is true, the reason is `masks its failure`;
- otherwise the check prints nothing.

For each flagged check it prints exactly one line with `s.Puts`, the same stream as the "already initialized" line:

`Note: check <name> (<command>) cannot fail: <reason>`

`<name>` is the check's `Name` and `<command>` is its `Run`, both verbatim.

Committed configuration stays authoritative and unchanged. Init writes, stages and commits nothing. It runs no setup, fix or check command, makes no model request and still exits 0. The working tree and HEAD are identical before and after.

Nothing else changes:
- the proposal validation in `initValidate`, including its check-only `initRunsNothing(c.Run, false)` call that accepts print-only proposed checks;
- the predicates themselves;
- the existing setup-command Note lines;
- the first-run and leftover-commit paths;
- the `Next:` lines.

Only checks are reported. Setup and fix entries get no new Note lines.

## Decisions
- Line format, exactly: `Note: check <name> (<command>) cannot fail: runs nothing` or `Note: check <name> (<command>) cannot fail: masks its failure`. The committed name and command appear verbatim. (source: request)
- Placement: the check Note lines come after the "already initialized" line, one per flagged check, in committed `commands.checks` order. They come after any existing setup-command Note lines, because setup precedes checks in the configuration. They come before any `Next:` lines. (source: request)
- "Runs nothing" uses `initRunsNothing(command, true)`, so a check that only prints (`echo ok`) counts as runs nothing. The request's example `test: echo ok` must be reported as `runs nothing`. Proposal validation calls the predicate with `false` for checks and would not flag it. That proposal behavior is left unchanged. (source: request)
- A check that matches both predicates (for example `echo ok || true`) prints one line, with `runs nothing`. This follows the request's "one line per flagged check" and the same runs-nothing-before-masks precedence that `initValidate` uses for checks. (source: request)
- Checks for which neither predicate is true print nothing. (source: request)
- Nothing is written, committed or run. Working tree and HEAD are identical before and after. Exit stays 0. (source: request)

## Source comparison
- Addressed: the request's Need, in full:
  - committed configuration stays authoritative and unchanged;
  - the runs-nothing and masks-failure predicates are applied to each committed check on the already-initialized path;
  - one `Note: check <name> (<command>) cannot fail: <runs nothing|masks its failure>` line per flagged check, after the "already initialized" line;
  - other checks print nothing;
  - nothing is written, committed or run.

  The Decisions above and every acceptance scenario cover these.
- Addressed: the request's synthetic acceptance. It is init-level, through the real `kogen-setup` CLI, on a committed configuration with no model call. Each example is a scenario in acceptance.feature:
  - `test: echo ok` gives a `runs nothing` Note;
  - `test: go test ./... || true` gives a `masks its failure` Note;
  - `test: go test ./...` gives no Note;
  - two flagged checks give two lines in configuration order.

  The two-flagged scenario uses checks `lint: touch check-ran || true`, `unit: go test ./...` and `smoke: echo ok`. It expects the `lint` (masks) line before the `smoke` (runs nothing) line, so grouping lines by reason fails. Running `lint` would create `check-ran`, so the unchanged-tree assertion also shows that no check was run.
- Addressed: "Working tree and HEAD identical before and after". Every scenario compares HEAD, refs, `git status --porcelain=v1 --untracked-files=all --ignored` and the working-tree file hashes before and after the run. It also checks that the reported configuration equals the committed bytes.
- Conflicting, resolved: the request says init refuses printing checks in new proposals. Since `k-setup-check-installs-dependencies`, `initValidate` actually accepts print-only proposed checks (`initRunsNothing(c.Run, false)`). The request's explicit example `test: echo ok` → `runs nothing` governs this report, so the report uses `initRunsNothing(command, true)`. Proposal validation is not changed.
- Added for precision, derived from the request: a check matching both predicates (`echo ok || true`) prints exactly one `runs nothing` line. A committed bootstrap setup Note is followed by the check Note. Both are pinned in acceptance.
- Preserved: the existing tests `TestInitAlreadyInitializedChangesNothing`, `TestInitAlreadyInitializedPrintsWhatIsMissing` and `TestInitAlreadyInitializedReportsOneTimeSetup` stay green unchanged, because their configurations have no flagged checks.

## Tests
- Each committed check that runs nothing or masks its failure prints one Note line with its reason, in configured order, after the already-initialized line and any setup Notes and before the Next lines: add a table-driven Go test TestInitAlreadyInitializedReportsVacuousChecks in setup/init_test.go using initNewFx(t, false) with a committed .kogen/project.yaml and initWantLines, with cases `echo ok` (runs nothing), `go test ./... || true` (masks its failure), `echo ok || true` (one runs-nothing line), two flagged checks around an unflagged one in order, and a bootstrap setup entry plus a flagged check; the acceptance CLI scenarios also cover this (integration)
- An unflagged committed check such as `go test ./...` prints no Note line: a case in TestInitAlreadyInitializedReportsVacuousChecks and the acceptance scenario for a real check (integration)
- The already-initialized CLI run exits 0, reports the unchanged configuration, runs no check, and leaves HEAD, refs, Git status and working-tree bytes unchanged: the acceptance scenarios through kogen-setup, plus head and dirty-path assertions in TestInitAlreadyInitializedReportsVacuousChecks (scenario)
- Proposal validation and the predicates stay unchanged: the existing TestInitValidateRunsNothing and TestInitValidateFailureMasks keep passing unchanged (existing)

## Feasibility
- Probe: on the unchanged tree, `go build -o <tmp>/kogen-setup ./cmd/kogen-setup` was run against a fresh repository. Its committed `.kogen/project.yaml` had checks `test: 'echo ok'` and `vet: 'go test ./... || true'`. The run exited 0, with stderr exactly `Kogen is already initialized in <root>` and `Next: set commands.acceptance in .kogen/project.yaml`. Stdout was the JSON result with the unchanged configuration, and `git status --porcelain` was empty. (probe: exit 0)
- Probe: the drafted step helpers' `prepare`/`run` were run against the unchanged binary for `{"setup":[],"checks":[{"name":"test","run":"echo ok"}]}` and for a fixture with setup `mix local.hex --force` and three checks. Both exited 0 with identical before/after snapshots and reported configuration equal to the written bytes. They printed no check Note, which is the expected missing-feature red, and the existing setup Note still appeared. (probe: exit 0)
- evidence: {"id":"notes-observer","kind":"observer","inputs":["features/steps/k-setup-initialized-reports-vacuous-checks__notes.js"],"observers":["features/steps/k-setup-initialized-reports-vacuous-checks__notes.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-initialized-reports-vacuous-checks__notes.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-initialized-reports-vacuous-checks__notes.js bad","exit":1,"output":"rejected\n"}]}
