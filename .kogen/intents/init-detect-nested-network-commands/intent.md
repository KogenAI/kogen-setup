# Detect remote calls in command substitutions

Slug: init-detect-nested-network-commands
Model: not applicable — command classification is stateless
Acceptance:
- .kogen/intents/init-detect-nested-network-commands/acceptance.feature
- features/steps/init-detect-nested-network-commands__validate.js
- features/steps/init-detect-nested-network-commands__driver/main.go

Refuse a setup, fix, or check command when a literal remote-host command runs inside shell command substitution, while continuing to ignore remote-command text that is only quoted. Replace top-level-only detection with classification of active substitution bodies using the existing command and host rules. Implementation and native regression-test edits are confined to `setup/init_remote_host.go`, `setup/init_remote_host_test.go`, and `setup/init.go`. This is static validation, not shell execution, host resolution, or a general shell safety guarantee. (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go; setup/init.go)

## Decisions
- Use the existing literal command and host rules within active command substitutions, including nested substitutions and both shell substitution forms. Single-quoted or escaped substitution text is inert; double quotes alone do not prevent substitution. Do not resolve dynamic hosts or change recognized direct commands. (decision: D1, round 1) (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go) (source: request)
- Enforce the nested refusal in all three proposal lists. Preserve the existing check and fix diagnostics and direct-command policy; do not add a direct remote-host refusal to setup. For setup, identify the submitted command and report that it contacts a remote host. (decision: D2, round 1) (evidence: setup/init.go) (assumption: The new setup refusal uses the existing fix-style wording with the setup command prefix.) (source: request)
- Exercise the behavior through setup.Validate, the proposal validation entry point, with one proposal entry per scenario and the zero-value InitContext. Compare the complete ordered list of problems. Validate may syntax-check with sh -n as before but must not execute proposed commands. (decision: D3, round 1) (evidence: setup/init.go; features/steps/init-detect-equals-url-option__driver/main.go) (source: request)

## Source comparison
- Addressed: ev-fb5dcfd6 corresponds to the inspected `initCommandParts` and `initContactsRemoteHost` top-level scan and the existing direct-command and quoted-text cases in `TestInitContactsRemoteHost`. Request acceptance 1 is reproduced by the remote check scenario; the deeper-substitution scenario distinguishes recursive inspection from a single-level scan. (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go)
- Addressed: request acceptance 2 and 3 map to the localhost, single-quoted, and escaped-text scenarios. The fix scenario covers the complementary active expansion inside double quotes rather than treating all quoted text alike.
- Addressed: request Expected and acceptance 4 are covered at `setup.Validate` by the check, fix, and setup refusal scenarios asserting the exact problems. The direct setup scenario guards its current policy; existing direct check and fix coverage remains. (evidence: setup/init.go; setup/init_test.go)
- Superseded: the top-level-only scan, not the direct command list, host rules, diagnostic precedence, or unrelated validation. Omitted as requested: executing submitted commands, resolving dynamic hosts, and changing which direct commands are recognized. Conflicting: none. The three scoped Go files can change without editing a protected artifact.

## Tests
- Classify literal remote commands inside active substitutions and reuse localhost handling: extend TestInitContactsRemoteHost with remote, localhost, nested and active quoting cases (regression)
- Do not classify substitution text that is only literal: extend TestInitContactsRemoteHost with single-quoted and escaped cases (unit)
- Refuse nested remote calls and report the correct list-specific problem: run the check, fix and setup scenarios through Validate and compare the complete problems array (scenario)
- Preserve classification of direct commands and the existing direct setup policy: retain TestInitContactsRemoteHost and TestInitValidateWrappedRemoteHost and run the direct setup preservation scenario (existing)

## Feasibility
- Run the configured Cucumber command from the repository root with KOGEN_ACCEPTANCE_FEATURES set to the listed feature and KOGEN_ACCEPTANCE_REPORT set to a writable report path. The steps use Go 1.27.2, the configured Node and Cucumber, a writable temporary directory and the same local `sh` syntax checker used by Validate. (evidence: go.mod; .kogen/project.yaml; setup/init.go)
- The driver builds once per Cucumber process. It reads one JSON proposal object on stdin, calls `setup.Validate(args map[string]any, setup.InitContext{})`, and emits the returned problems as a JSON string array on stdout, normalizing nil to `[]`. Command values are JSON input, never passed to a shell for execution. The scenarios assert output at the proposal validation boundary and use no provider, credentials or network service.
- The local tools were Go 1.27.2, Node v24.21.0, Cucumber 13.3.0, and `/usr/bin/sh`. Existing focused remote-host tests passed (probe: exit 0, 2.2 s); the module list showed no shell parser. The built baseline driver returned a direct check refusal and no problems for the nested check, nested fix, or direct setup probes (exit 0, 1.0 s). The scratch correct overlay also passed the focused tests with added classifier cases (controls generation: exit 0, 1.7 s; JSON normalization: exit 0, 0.1 s).
- Quote semantics were cross-checked against the retrieved POSIX Shell Command Language, §2.2.3 and §2.3 (https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html; retrieved excerpt, untrusted tool data). This informs static syntax handling, not product scope.
- The same assertion used by each Then accepted the observed direct-check refusal and rejected the observed empty array against that expectation with the final submitted observer (exits 0 and 1, each 0.1 s).
- evidence: {"id":"validate-problems-observer","kind":"observer","inputs":[".kogen/intents/init-detect-nested-network-commands/observer-good.json",".kogen/intents/init-detect-nested-network-commands/observer-bad.json"],"observers":["features/steps/init-detect-nested-network-commands__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/init-detect-nested-network-commands__validate.js --observe .kogen/intents/init-detect-nested-network-commands/observer-good.json '[\"check probe (curl https://example.invalid/health) contacts a remote host; checks must not depend on the network\"]'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/init-detect-nested-network-commands__validate.js --observe .kogen/intents/init-detect-nested-network-commands/observer-bad.json '[\"check probe (curl https://example.invalid/health) contacts a remote host; checks must not depend on the network\"]'","exit":1,"output":"rejected\n"}]}

## Original request

Evidence: ev-fb5dcfd6 In setup/init_remote_host.go, initCommandParts splits on shell separators and initContactsRemoteHost checks the first word of each part. setup/init_remote_host_test.go covers direct remote commands and quoted text, but not a remote command inside command substitution.

Expected: Refuse a setup, fix, or check command when a literal remote-host command runs inside shell command substitution, while continuing to ignore remote-command text that is only quoted.

Scope: setup/init_remote_host.go, setup/init_remote_host_test.go, setup/init.go. Out of scope: executing proposed commands, resolving dynamic hosts, or changing which direct commands are recognized.

Acceptance:
1. A command substitution containing curl to a literal remote host is detected by the remote-host check. Wrong-implementation: scanning only top-level command parts misses the nested network call.
2. A command substitution containing curl to localhost is not treated as a remote host. Wrong-implementation: treating every nested URL as remote falsely refuses a local check.
3. A quoted string that merely contains command-substitution text is not treated as an executed network call. Wrong-implementation: scanning quoted text as shell syntax creates a false refusal.
4. Validation reports the existing network refusal for nested remote calls in checks and fixes. Wrong-implementation: updating only the helper without exercising its validation call sites leaves the gap in user-facing behavior.
