# Make the models-file project.yaml check fail

Slug: fix-k-setup-models-file
Model: not applicable — a one-line test-script correction with no product state
Acceptance:
- .kogen/intents/fix-k-setup-models-file/acceptance.feature
- features/steps/fix-k-setup-models-file__script.js

This comes from an automated review finding (P2) on the landed k-setup-models-file Intent. In `.kogen/intents/k-setup-models-file/acceptance.feature`, the scenario "Initial and repeat init use the team file" runs its doc string with `/bin/sh -c` (dash here) under `set -eu`. Its line `! grep -q '^models:' .kogen/project.yaml` cannot fail the script, because POSIX `set -e` ignores a pipeline that starts with `!`. So the scenario still passes when init leaves a top-level `models:` key in `.kogen/project.yaml`.

Reproduced on current main (d1f9790) before shaping. Before that line, the scenario's script was given `printf 'models:\n  shape:\n    model: gpt-6.1-sol\n    effort: low\n' >> .kogen/project.yaml`. After the line, it was given `git checkout -q -- .kogen/project.yaml`. The script then exited 0. With the line replaced by the guarded form, the same mutated script exited 1, and the unmutated guarded script exited 0.

The fix replaces exactly that one line in `.kogen/intents/k-setup-models-file/acceptance.feature` with:

`if grep -q '^models:' .kogen/project.yaml; then exit 1; fi`

It keeps the same 6-space doc-string indentation. Nothing else in that feature, its step file `features/steps/k-setup-models-file__cli.js`, Go code, tests or configuration changes. No other line of that scenario script starts with `! `. Every existing test stays green: init behavior is unchanged, and so is the second k-setup-models-file scenario (`go test -count=1 ./setup ./contract ./consumes/...`).

This Intent's acceptance reads the k-setup-models-file feature file and extracts the script of "Initial and repeat init use the team file". It then checks three things:
- The script contains the guarded line and no line that starts with `! `.
- A fault is injected just before the script's only line that contains `grep -q '^models:' .kogen/project.yaml`: `models:` is appended to `.kogen/project.yaml` and a marker is echoed. A second marker and a revert are placed just after that line. The script must exit 1 after printing the first marker and before printing the second, so the models check is what stops it.
- The unmodified script exits 0 on the current init.

The scripts run with `/bin/sh -c` from the repository root, the same way the existing step runs them. They need `go` and `git` on PATH.

## Decisions
- Replace the negated grep with `if grep -q '^models:' .kogen/project.yaml; then exit 1; fi` (source: request)
- Show the bug on current main first: breaking the behavior leaves the scenario green. This was observed before shaping, and this Intent's fault scenario fails on main for that reason (exit 0 instead of 1). (source: request)
- No unrelated changes. Keep every existing test green. (source: request)

## Source comparison
- Addressed: the finding's location (`! grep -q '^models:'` in the k-setup-models-file acceptance.feature) and its POSIX `set -e` cause. See the fault scenario, which reproduces it on main.
- Addressed: the prescribed fix literal `if grep -q ...; then exit 1; fi`, expanded to the full line `if grep -q '^models:' .kogen/project.yaml; then exit 1; fi`. See the structure scenario.
- Addressed: "fails on the broken behaviour and passes on main". See the fault scenario (exit 1, stopped by the models check) and the unchanged-init scenario (exit 0).
- Addressed: "keep every existing test green; no unrelated changes". The edit is limited to one line of a test script. Configured checks and the unchanged go test scenario of k-setup-models-file cover the rest.
- Omitted: lost-coverage wording in the Need. The finding concerns a test that cannot fail, not removed coverage.

## Tests
- The models-file scenario uses the guarded check and no `!`-prefixed line: the structure scenario reads the landed feature's script (regression)
- The models-file scenario fails when project.yaml has a top-level models key at its check: the fault-injection scenario expects exit 1, with the fault marker printed and the missed marker absent (regression)
- The models-file scenario still passes on the unchanged init: the unmodified-script scenario expects exit 0 (existing)

## Feasibility
- Shell semantics observed: `/bin/sh` is dash. On main, the scenario script with a `models:` key injected before the negated line exited 0. The guarded line made it exit 1, and the unmutated guarded script exited 0. (probe: exit 0, about 1 s per run)
- evidence: {"id":"fault-observer","kind":"observer","inputs":[".kogen/intents/k-setup-models-file/acceptance.feature"],"observers":["features/steps/fix-k-setup-models-file__script.js"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/fix-k-setup-models-file__script.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/fix-k-setup-models-file__script.js bad","exit":1,"output":"rejected\n"}]}
