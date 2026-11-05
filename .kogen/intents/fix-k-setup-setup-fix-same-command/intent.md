# Drop duplicate fixes only after verification

Slug: fix-k-setup-setup-fix-same-command
Model: not applicable — one deterministic filter over lists that verification has already decided; no interacting state
Acceptance:
- .kogen/intents/fix-k-setup-setup-fix-same-command/acceptance.feature
- features/steps/fix-k-setup-setup-fix-same-command__init.js

Review finding on the landed k-setup-setup-fix-same-command (location: `setup/init.go`, `initMerge` drops). Init decides that a fix is dropped as "already in setup" or "already in checks" in `initMerge`, before anything is verified. When the matching setup command or check then fails verification and is left out, the command ends up in neither saved list and the output still prints `Dropped: fix: <command> (already in setup)`. Shaping reproduced this on unchanged main through `Init` with the scripted-provider fixture: setup `printf 'fixed\n' > README.md` (README.md committed as `draft\n`) is left out with `setup-1 (printf 'fixed\n' > README.md) changed README.md`. The same fix is never run, saved `fix` is `[]`, and stdout still has `Dropped: fix: printf 'fixed\n' > README.md (already in setup)`. A check with the same command (`tidy`) shows the same thing with `(already in checks)`. So does a setup and fix `test -f MISSING.md` that fails (`setup-1 (test -f MISSING.md) failed with status 1`).

The change: during `Init`, a fix is dropped only when it duplicates a setup command or check that verification **kept**. The comparison uses `initCommandKey`, as now. Setup and checks are already verified before fixers, so the drop decision moves to that point in `initVerify`: after setup, acceptance-runner and check verification and before the fixer loop. The kept `res.setup` and `res.checks` are the reference. A fix that matched only setup commands or checks that were left out is no longer dropped. It is verified as an ordinary fixer and is either kept in `fix` or left out with the existing fixer diagnostics. The unverified, pre-verification drop of such fixes is removed.

Unchanged:
- the fixer verification itself;
- the `Dropped: fix: <original command> (already in setup)` / `(already in checks)` wording, one line per dropped fix, in merged fix order, printed at the same place in the summary (after `Replaced:` lines, before `Protect:`);
- setup wins when both a kept setup command and a kept check match;
- dropped fixes are not run;
- fixers that remain are numbered `fix-1`, `fix-2`, … in order among the fixers actually verified, as today;
- the public `Merge(detected, proposed) InitProposal`. It stays a pre-verification merge with its current results, including its cross-list fix filtering, and its existing tests stay unchanged. Only Init's verification path stops relying on that pre-verification filtering.
- `initCommandKey`, `initUnion`, check replacement/deduplication, validation, detection, the root-script overlap selection (`initSelectOverlap`) and every other output line.

No other behavior changes.

## Decisions
- Fix the finding by computing the drops after verification, the first option the request offers, not by rephrasing the lines. A fix is dropped (and not run) only when its `initCommandKey` equals that of a setup command or check that verification kept. The reason is `setup` when a kept setup command matches, otherwise `checks`. (source: request)
- A fix whose only matches were left-out setup commands or checks is verified as a normal fixer. It is saved in `fix` when it passes and listed under `Left out:` with the existing `fix-N (...)` wording when it fails. No `Dropped:` line is printed for it. (source: request)
- Keep the existing drop wording, ordering, placement and the "redundant fixes are not verified" behavior for fixes that match kept setup or checks. Keep `Merge` unchanged. Make no unrelated changes. (source: request)

## Source comparison
- Addressed: the request's scenario ("setup command then fails verification and is left out" → command in neither list, output still claims a duplicate). Reproduced on main (see prose) and encoded as acceptance scenarios 1 and 3, plus a required Go regression test that fails on main.
- Addressed: the same pre-verification drop with reason `checks`, from the same `initMerge` code: acceptance scenario 2.
- Addressed: "Compute drops after verification, or rephrase them": computing after verification is chosen (Decisions 1).
- Addressed: "Add a test" and "Keep every existing test green; no unrelated changes": Tests section, and acceptance scenario 6 runs `go test ./setup -count=1`.
- Preserved: landed k-setup-setup-fix-same-command behavior when setup and checks pass (`Dropped: fix: test  -f README.md (already in setup)`, `Dropped: fix: test -r README.md (already in checks)`, no `kogen: running fix-` progress): acceptance scenario 4 and existing `TestInitDropsRedundantFixBeforeVerification`. Also preserved: `Merge` results and the existing `TestInitMergeDrops*` and `TestInitMergeFixPreservesQuotedWhitespace` tests.
- Boundary: drops compare against the setup and checks kept by `initVerify`. Root-script overlap selection afterwards removes only work that another kept command already performs, and it is unchanged.

## Tests
- A fix duplicating a setup command that verification left out is verified as a fixer and no longer reported as dropped: add a Go regression test in `setup` using the `initNewFx`/`initSubmit` fixture. Setup and fix are both `printf 'fixed\n' > README.md` and README.md is committed as `draft\n`. Assert saved `fix` is `["printf 'fixed\\n' > README.md"]`, setup is empty and stdout has no `Dropped:` line; this test fails on current main. Acceptance scenarios 1 and 3 cover the same rule. (regression)
- A fix duplicating a check that verification left out is verified as a fixer: Go test (same fixture, check `tidy`) and acceptance scenario 2. (regression)
- A fix duplicating kept setup or kept checks is still dropped, unrun, with the existing reason line: existing `TestInitDropsRedundantFixBeforeVerification` and acceptance scenario 4. (existing)
- Drop decisions are per command and the remaining fixers keep `fix-N` numbering among verified fixers: acceptance scenario 5. (integration)
- `Merge` keeps its pre-verification results: existing Merge tests unchanged. (existing)
- Every existing test stays green: acceptance scenario 6 (`go test ./setup -count=1`) and the configured checks. (existing)

## Feasibility
- Reproduced on unchanged main in a scratch copy (`go test ./setup -run '^TestZZProbe$' -count=1`, exit 0, ~2 s). Setup `printf 'fixed\n' > README.md` printed `Left out: setup-1 (printf 'fixed\n' > README.md) changed README.md` plus `Dropped: fix: printf 'fixed\n' > README.md (already in setup)`, saved fix `[]`, no fix run. Check `tidy` printed `Left out: tidy (printf 'fixed\n' > README.md) changed README.md` plus `Dropped: ... (already in checks)`. `test -f MISSING.md` printed `Left out: setup-1 (test -f MISSING.md) failed with status 1` plus a `Dropped:` line. Kept setup `test -f README.md` still printed `Dropped: fix: test  -f README.md (already in setup)` with no fix run.
- evidence: {"id":"init-observer","kind":"observer","inputs":["features/steps/fix-k-setup-setup-fix-same-command__init.js"],"observers":["features/steps/fix-k-setup-setup-fix-same-command__init.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-setup-fix-same-command__init.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-setup-fix-same-command__init.js bad","exit":1,"output":"rejected\n"}]}
