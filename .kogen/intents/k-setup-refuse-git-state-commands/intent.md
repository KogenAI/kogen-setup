# Refuse repository-mutating init commands

Slug: k-setup-refuse-git-state-commands
Model: not applicable — deterministic command validation adds no meaningful state; retain the existing bounded correction conversation
Acceptance:
- .kogen/intents/k-setup-refuse-git-state-commands/acceptance.feature
- features/steps/k-setup-refuse-git-state-commands__validate.js

Extend setup/init.go Validate so recurring setup, fix and check proposals cannot rewrite repository state merely because verification occurs on a disposable committed-tree copy. Split command parts on `;`, `&&`, `||`, `|`, and newlines, inspect their first two whitespace-separated words, and refuse git reset, clean, checkout, restore, stash, commit, rebase, merge, cherry-pick, tag, branch, am and apply. Exempt git apply only when the same part contains the exact word `--check`. Do not execute any proposed command during Validate. Keep existing publishing/deployment refusals and unrelated validation unchanged. No shell-parser expansion, wrapper detection or global Git-option handling is requested.

Report one repository-state problem per offending command using the existing contextual style: `setup command <full command> changes the repository state`, `fix command <full command> changes the repository state`, or `check a (<full command>) changes the repository state` (with the actual check name). Return no valid proposal when problems exist. Keep the existing one correction opportunity before verification; this feature does not add retries or change provider interfaces.

## Decisions
- Apply the refusal to setup, fix and checks, using literal initial command words in each split part. (source: request)
- Preserve read-only Git commands, submodule update --init, and apply --check; preserve git push's existing publishing refusal. (source: request)
- Use the existing contextual diagnostic convention, retaining the complete original command. (source: request)

## Source comparison
- Addressed: request Problem and Need, including all thirteen Git actions, five separators, diagnostic suffix and one correction opportunity, by the outcome above and acceptance examples; disposable verification is not a safety exemption.
- Addressed: all Synthetic acceptance literals are executable examples below, including reset plus npm ci, stash plus make test, clean -fdx, diff --exit-code plus make test, submodule update --init, and both apply outcomes.
- Addressed: Need's seven read-only commands and Problem's checkout -- ., branch -D, commit/rebase/merge/tag examples are retained in acceptance. Existing init behavior and tests remain required.
- Omitted: no requested behavior. Superseded: the current git-push-only command-word refusal is extended, not removed. No external protocol or library capability changes are needed.

## Tests
- Reject every listed Git state command in all three proposal kinds with contextual diagnostics: add focused table-driven Validate regression tests (regression)
- Split all five separators and exempt only exact --check in the same git apply part: acceptance outline and focused Validate tests (unit)
- Accept the seven read-only commands, submodule update --init and apply --check: acceptance outline and focused Validate tests (unit)
- Give an invalid proposal one correction opportunity before any verification: retain existing conversation tests and add a state-command correction case using the existing init fixture, asserting feedback, two requests and corrected configuration (integration)
- Preserve existing publishing refusal and all init behavior: existing init suite plus configured checks and README race suite (existing)

## Feasibility
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":["features/steps/k-setup-refuse-git-state-commands__validate.js"],"observers":["features/steps/k-setup-refuse-git-state-commands__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-git-state-commands__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-git-state-commands__validate.js --control bad","exit":1,"output":"rejected\n"}]}
