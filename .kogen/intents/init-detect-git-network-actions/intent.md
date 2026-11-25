# Detect remote Git actions in checks

Slug: init-detect-git-network-actions
Model: not applicable — classification of a proposal does not change persistent state
Acceptance:
- .kogen/intents/init-detect-git-network-actions/acceptance.feature
- features/steps/init-detect-git-network-actions__validate.js
- features/steps/init-detect-git-network-actions__driver/main.go

Extend literal Git network detection beyond `ls-remote` to `fetch`, `pull`, and `clone`. Report the existing network refusal for checks that use a non-local literal repository source, or that pull by a configured remote name. Preserve local Git operations. Implementation and native-test edits are limited to `setup/init_remote_host.go`, `setup/init_remote_host_test.go`, and `setup/init.go`. Validation does not execute proposed commands or resolve configured names to their targets.

## Decisions
- Classify literal Git fetch, pull, and clone by the repository operand, not by a destination, refspec, or option value; recognize literal non-loopback URLs and Git SSH-style host targets while leaving paths, file URLs, and loopback sources non-remote. Keep the existing literal scanner and ls-remote behavior. (decision: D1, round 1) (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go) (source: request)
- Exercise the existing check refusal through setup.Validate. Keep its diagnostic text and preserve separate publishing refusals and other unrelated validation; the existing network classifier call sites need no new policies or configuration. (decision: D3, round 1) (evidence: setup/init.go; setup/init_test.go) (source: request)
- For a pull repository operand in remote-name form, refuse a name configured in the validation repository, not every bare argument. Use only the presence of the named remote, never its configured URL or destination. A plain local path that is not a remote name remains non-remote, and explicit local path syntax selects a path even when its basename is configured. (decision: D4, round 1) (evidence: setup/init.go; setup/init_remote_host.go) (source: request)
- Preserve local Git operations: the named-pull refusal applies to a configured remote name, not an unconfigured bare local source; check name membership only and do not resolve the destination. (decision: D5, round 1) (evidence: setup/init.go; setup/init_remote_host.go) (revises: D2 because The local Git probe demonstrated that a bare operand can be a local path and that a configured remote with the same spelling takes precedence.) (source: request)

## Source comparison
- Addressed: ev-a4336254 matches the inspected Git branch in `setup/init_remote_host.go`, its `ls-remote` cases in `setup/init_remote_host_test.go`, and the network problem emitted by `Validate` in `setup/init.go`. Superseded: restricting literal Git network recognition to `ls-remote`; Decision D1 and the preserved remote-source example retain that action's existing classification.
- Addressed: Acceptance 1–3 map to the fetch URL, named pull, and clone URL scenarios. The old-recognition, URL-only pull, and omitted-clone overlays isolate those mistakes. Additional examples exercise pull with a URL, a Git SSH-style source, and a repository operand following flags.
- Addressed: Acceptance 4 maps to the separate local fetch and clone scenarios and their blanket-classification overlays. The named pull and local pull scenarios distinguish configured remote-name form from an ordinary bare local path; a blanket bare-argument refusal fails. The fixture deliberately gives one source both a local pathname and a configured remote name. A clone destination cannot turn a local source into a remote check.
- Addressed: Acceptance 5 maps to the exact ordered problems array returned by the real proposal validator, including the check name and submitted command. The validation-bypass overlay leaves detection in place and suppresses enforcement of the new actions in checks.
- Addressed: publishing is out of scope; the preservation scenario expects the existing publishing problem only. Omitted as requested: mapping configured remote names to their targets and blocking local Git operations. There is no inference of an implicit upstream or resolution of Git aliases, URL rewrites, or shell expansions. The name-only check can enumerate local Git remote names; it does not retrieve their destinations or call any remote. No new validation policy is added to other proposal lists. Conflicting: none; no protected artifact needs an implementation edit. (evidence: setup/init.go; setup/init_remote_host.go)

## Tests
- Detect a literal remote Git source, not its other operands: extend TestInitContactsRemoteHost with fetch, pull URL, clone, and local cases (regression)
- Distinguish a configured pull name from a bare local path: validate both forms against the local Git fixture (integration)
- Report the existing network refusal and leave local checks and the separate publishing diagnostic intact: compare complete problems arrays returned by Validate in the acceptance scenarios (scenario)
- Preserve existing commands and wrapper behavior: keep TestInitContactsRemoteHost and TestInitValidateWrappedRemoteHost (existing)

## Feasibility
- Run the configured Cucumber command from the repository root with the listed feature in `KOGEN_ACCEPTANCE_FEATURES` and a writable `KOGEN_ACCEPTANCE_REPORT`. The steps require Go 1.27.2, Git, the configured Node and Cucumber, and a writable temporary directory. The step creates a local Git repository and two bare repositories, adds one remote name without making a connection, and builds a temporary Go driver. The driver receives the fixture root as its sole argument, decodes one JSON object with a `checks` entry containing `name` and `run` from stdin, calls `setup.Validate(args map[string]any, setup.InitContext{Root: root})`, and writes just its JSON problems array to stdout, normalizing nil to `[]`. Validate uses `sh -n` for shell syntax; no proposed command runs and no credentials, provider or network service is needed. (evidence: .kogen/project.yaml; go.mod; setup/init.go)
- Local Go 1.27.2 and Git 2.54.0 were available. Git help printed command syntax and option arity (usage exit 129, 0.1 s). The local shell was `/bin/sh`, with Node v24.21.0 and Cucumber 13.3.0; the existing detector test passed (exit 0, 1.4 s). An initial generator command accidentally referenced a missing script and produced no evidence (exit 2, 0.1 s); the inline generator succeeded (exit 0, 0.1 s).
- A baseline driver probe observed the existing remote ls-remote diagnostic and an empty problems array for the fetch URL (exit 0, 0.8 s). An initial scratch overlay passed focused URL, wrapper and local-destination checks (exit 0, 1.5 s). A local Git experiment showed that a same-named configured remote takes precedence over a bare local repository path, while an explicit path takes the local source (exit 0, 0.2 s); a separate name-only query printed the configured name and did not list its target (exit 0, 0.1 s).
- The revised overlays were generated in scratch (exit 0, 0.1 s). All patches applied or passed apply check, the focused detector and existing wrapper tests passed, and the corrected driver distinguished the configured pull name from both bare and explicit local paths using the real fixture (exit 0, 2.0 s). The final-byte comparator accepted the observed baseline diagnostic and rejected the missing diagnostic against that expectation (exits 0 and 1, 0.0 s and 0.1 s).
- evidence: {"id":"validate-problems-observer","kind":"observer","inputs":["features/steps/init-detect-git-network-actions__validate.js"],"observers":["features/steps/init-detect-git-network-actions__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/init-detect-git-network-actions__validate.js --observe '[\"check probe (git ls-remote https://example.invalid/repo.git) contacts a remote host; checks must not depend on the network\"]' '[\"check probe (git ls-remote https://example.invalid/repo.git) contacts a remote host; checks must not depend on the network\"]'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/init-detect-git-network-actions__validate.js --observe '[]' '[\"check probe (git ls-remote https://example.invalid/repo.git) contacts a remote host; checks must not depend on the network\"]'","exit":1,"output":"rejected\n"}]}

## Original request

Evidence: ev-a4336254 setup/init_remote_host.go recognizes git ls-remote as a network command, while setup/init_remote_host_test.go covers ls-remote but not other literal Git actions that contact remotes. setup/init.go uses initContactsRemoteHost to reject network-dependent checks.

Expected: Detect literal Git fetch, pull, and clone commands that contact a remote host so checks cannot pass validation while depending on those network actions.

Scope: setup/init_remote_host.go, setup/init_remote_host_test.go, setup/init.go. Out of scope: changing publishing refusals, blocking local Git operations, or resolving remote names that require Git configuration.

Acceptance:
1. A Git fetch with a literal remote URL is detected. Wrong-implementation: checking only ls-remote leaves fetch able to contact a host.
2. A Git pull with a configured remote name is refused as a network-dependent check. Wrong-implementation: requiring a URL argument misses the common remote-name form.
3. A Git clone from a literal remote URL is detected. Wrong-implementation: omitting clone leaves a direct network operation outside the refusal.
4. Local fetch sources and local clone paths are not classified as remote. Wrong-implementation: treating every Git action as network-dependent falsely refuses offline commands.
5. Validation reports the existing network refusal for these actions in checks. Wrong-implementation: helper-only coverage does not ensure the check validation path enforces the rule.
