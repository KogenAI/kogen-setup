# Refuse publishing commands during init

Slug: k-setup-refuse-publishing-commands
Model: not applicable — this adds a stateless command validation predicate; the existing bounded correction conversation is unchanged
Acceptance:
- .kogen/intents/k-setup-refuse-publishing-commands/acceptance.feature
- features/steps/k-setup-refuse-publishing-commands__accept.js

In setup/init.go, Validate must refuse model-proposed setup, fix and check commands containing a listed publishing/deploying action before initVerify can execute them. Split on semicolons, &&, ||, pipes and newlines, trim each part, and match its initial program and subcommand as whole whitespace-delimited words: git push, npm publish, yarn publish, pnpm publish, cargo publish, gem push, twine upload, docker push, mix hex.publish, terraform apply, kubectl apply, helm install, helm upgrade. Do not scan arbitrary argument text for these words. No generalized shell security parser, wrapper recognition or additional command classes are requested.

A matched part with a standalone --dry-run argument is exempt; standalone -n is also exempt for the publishing actions (git push through mix hex.publish), not the deploying actions (terraform, kubectl, helm). Exemption applies to that part, not other parts in the command. A rejection problem includes the original complete command, the check name for checks (or setup/fix context), and the literal phrase `publishes or deploys`. Use the existing one-correction mechanism, not a new retry or execution policy. Preserve detected commands and all unrelated validation, merge and verification behavior. Do not change prompts or provider integrations.

## Decisions
- Dry-run commands remain allowed; normal publishing/deploying proposals are refused across setup, fix and checks. (source: request)
- The correction may drop the sole git push check, yielding `Checks: none found` with no remote push. (source: request)

## Source comparison
- addressed: Request Problem/Need, owning setup/init.go Validate and initLocalToolsRE precedent: the predicate and diagnostic above enforce the prompt's existing restriction before execution, without changing the prompt.
- addressed: Request's complete 13-action list, five separator forms, dry-run exceptions and detected-command exclusion: prose above and the validation scenario below preserve them. Publishing -n is limited to the publishing group; deploying --dry-run remains exempt as requested.
- addressed: Synthetic acceptance a/b/c refusals, d/e/f acceptance, setup terraform apply -auto-approve and one corrected init run: feature preserves exact commands and check names. Init fixture uses the repository's scripted local provider and a bare local Git remote with a pre-receive marker, never a live service.
- addressed: Existing init tests stay green: retain tests and run configured checks plus README's full test command. No requested behavior is deliberately omitted or superseded.

## Tests
- Refuse each listed action in proposed setup, fix or checks, including all specified separators and command-word boundaries: focused Validate table regression and acceptance capture (unit)
- Permit dry-run parts and unrelated commands; leave detected commands unchanged: Validate table and detected-context capture (unit)
- Never execute rejected git push and accept a correction that drops it: Init with scripted provider, real local Git remote, correction/output/configuration assertions (integration)
- Preserve existing init behavior: existing init and contract tests plus go build ./..., go vet ./..., go test -race -count=1 ./... (existing)

## Feasibility
- evidence: {"id":"observers","kind":"observer","inputs":["features/steps/k-setup-refuse-publishing-commands__accept.js"],"observers":["features/steps/k-setup-refuse-publishing-commands__accept.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-publishing-commands__accept.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-publishing-commands__accept.js --control bad","exit":1,"output":"rejected\n"}]}
