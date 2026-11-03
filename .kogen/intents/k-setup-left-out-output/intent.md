# Show left-out command output on stderr

Slug: k-setup-left-out-output
Model: not applicable — bounded diagnostic rendering adds no workflow state
Acceptance:
- .kogen/intents/k-setup-left-out-output/acceptance.feature
- features/steps/left-out-output.js
- features/steps/left-out-driver.go.txt

In setup/init.go initVerify preserve existing command selection, execution, configuration, stdout and exit behavior. For every left-out setup or check emit its captured combined command output tail through stderr progress immediately after the corresponding running/checking line, before subsequent progress. First-run setup failures and failing checks use r.Output; second-run failure or changed-tree non-repeatability uses again.Output. Successful retained commands emit no extra output even when they print text. Empty capture adds no lines; a terminal newline ends the preceding line rather than adding an extra empty line. Preserve interior empty lines. Truncate by Unicode code points, not bytes. Do not change provider transport or add live-provider tests.

## Decisions
- Emit the last 20 output lines, each prefixed with `  | `, keeping at most 200 Unicode characters of content excluding the prefix, without a truncation suffix. (source: answer 1)
- Preserve stdout, committed configuration and exit codes; this is diagnostic stderr progress only. (source: request)

## Source comparison
- Addressed: request's setup/init.go initVerify sites near 742, 760 and 798 drop r.Output/again.Output; the outcome and scenarios cover these without changing Left out summaries.
- Addressed: every left-out setup includes the changed-tree not-repeatable branch near 774, with second-run output in its scenario.
- Addressed: the README.md-only fixture proposes `echo boom-setup >&2; exit 4`, bad `echo boom-check; exit 7`, good `true`; executable acceptance preserves the exact Left out line, associates both tails, tests 500 lines and second-run output. Passing noisy commands are also covered.
- Addressed: answer 1(a) fixes `  | `, 200 Unicode characters excluding prefix and no suffix. Long-output acceptance and implementation boundary tests enforce it.
- Addressed: existing stdout tests remain unchanged; configured checks still apply. No requested behavior or settled literal is omitted, conflicting or superseded. No new setting or command execution is authorized.

## Tests
- Left-out setup first failures and checks expose stdout/stderr under matching progress while passing commands remain silent: synthetic Init fixture (regression)
- Second-run failure reports second output only: repeatability scenario (regression)
- Second-run tree changes report second output only: changed-tree scenario (regression)
- Tail keeps last 20 lines and truncates at 200 Unicode code points: long-check scenario and callable rendering tests for 19/20/21 lines, 199/200/201 code points including multibyte text, empty output and terminal newline (unit)
- Stdout, configuration selection and exits remain unchanged: retain existing Init assertions and add synthetic fixture configuration assertions keeping only good (integration)

## Feasibility
- evidence: {"id":"output-observer","kind":"observer","inputs":["features/steps/left-out-output.js"],"observers":["features/steps/left-out-output.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/left-out-output.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/left-out-output.js --control bad","exit":1,"output":"rejected\n"}]}
