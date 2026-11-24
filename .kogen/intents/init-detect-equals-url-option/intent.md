# Detect equals-form remote URL options

Slug: init-detect-equals-url-option
Model: not applicable — literal command classification is stateless
Acceptance:
- .kogen/intents/init-detect-equals-url-option/acceptance.feature
- features/steps/init-detect-equals-url-option__validate.js
- features/steps/init-detect-equals-url-option__driver/main.go

Detect literal remote URLs in equals-form URL options for curl and wget. Replace the unconditional exclusion of dash-prefixed arguments for this case, retaining positional URL handling and the existing URL host classifier. Production and regression-test edits are limited to setup/init_remote_host.go and setup/init_remote_host_test.go. No network command is executed by acceptance: it submits command text to the existing setup.Validate boundary. (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go; setup/init.go)

## Decisions
- Detect a literal remote URL supplied as an equals-form URL option to curl or wget, and preserve the existing handling of positional URLs and non-remote hosts. (decision: D1, round 1) (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go) (source: request)
- Out of scope: adding new network commands, resolving variables, or changing URL host classification. (decision: D2, round 1) (evidence: setup/init_remote_host.go) (source: request)
- Exercise the classification through setup.Validate with a checks entry containing name and run, using InitContext{} and comparing the complete ordered problems array; retain focused TestInitContactsRemoteHost coverage and extend its case table for the regression. (decision: D3, round 1) (evidence: setup/init.go; setup/init_remote_host_test.go; features/steps/init-network-wrappers__driver/main.go) (source: request)

- Use --url solely as a synthetic equals-form option spelling in the local parser fixture, not as a supported curl or wget option-name contract; acceptance asserts the classification of the value and the diagnostic for the actual submitted command, not the spelling. (decision: D4, round 1) (evidence: setup/init_remote_host.go) (assumption: The request leaves the option spelling unspecified; the fixture chooses one without executing either network command.) (source: request)

## Source comparison
- Addressed: request Expected and Acceptance 1–2 map to the two remote equals-form scenarios, covering curl and wget separately. Acceptance compares actual Validate diagnostics rather than searching source text. controls.json contains both the old skip-all-dashes implementation and a curl-only implementation as wrong controls.
- Addressed: request Acceptance 3 maps to the local equals-form scenario outline for both commands, with localhost and file URL values; the corresponding wrong control incorrectly treats these URL values as remote.
- Addressed: request Acceptance 4 maps to the positional scenario outline and retention of the existing TestInitContactsRemoteHost cases; the corresponding wrong control discards positional URLs.
- Addressed: request scope limits implementation edits to setup/init_remote_host.go and setup/init_remote_host_test.go. Acceptance artifacts and bounded implementation controls are verification machinery, not an expansion of production scope. No new commands, variable resolution, host-classification changes, settings, dependencies or external-service calls are requested.
- Addressed: evidence ev-186285d0 is consistent with the inspected initAnyRemoteURL implementation skipping dash-prefixed arguments. The unchanged tree probe detected the positional remote URL and returned no problems for the remote equals-form curl option, reproducing the gap. (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go)
- Superseded: after contract feedback, equals-form scenarios describe the observable value classification without asserting the unstated --url option name; the synthetic spelling is isolated in the fixture and Decision D4.
- Omitted: none. Conflicting: none. Superseded: only the blanket skipping of equals-form URL-bearing options, not positional parsing or URL host classification.

## Tests
- Detect curl equals-form remote URLs: extend TestInitContactsRemoteHost with the reproducer and exercise Validate in the curl scenario (regression)
- Detect wget equals-form remote URLs: extend TestInitContactsRemoteHost with the reproducer and exercise Validate in the wget scenario (regression)
- Keep localhost and file URLs non-remote in equals-form options: add focused table cases and compare empty Validate problems for both commands (unit)
- Preserve positional URL results: retain existing TestInitContactsRemoteHost cases and compare Validate problems for representative remote and non-remote positional URLs (existing)

## Feasibility
- Go 1.27.2 is available; the existing focused TestInitContactsRemoteHost passed. A scratch-built Validate driver returned the existing remote-host diagnostic for a positional remote URL, and empty arrays for a remote equals-form curl option and a localhost equals-form wget option. This is local lexical parsing; no curl/wget runtime or network capability is assumed. (probe 1: exit 0, 1.3 s)
- The protected comparator accepted the real positional Validate output and rejected an empty problem array against that expected output using its final submitted bytes. These focused controls exercise the same comparison as every Then independently of the missing-feature failures. Control overlays were generated from the inspected source and formatted with gofmt. (observer probes: exits 0 and 1, 0.1 s each; artifact generation: exit 0, 0.1 s)
- evidence: {"id":"validate-problem-observer","kind":"observer","inputs":[".kogen/intents/init-detect-equals-url-option/observer-good.json",".kogen/intents/init-detect-equals-url-option/observer-bad.json"],"observers":["features/steps/init-detect-equals-url-option__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/init-detect-equals-url-option__validate.js --observer .kogen/intents/init-detect-equals-url-option/observer-good.json .kogen/intents/init-detect-equals-url-option/observer-good.json","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/init-detect-equals-url-option__validate.js --observer .kogen/intents/init-detect-equals-url-option/observer-bad.json .kogen/intents/init-detect-equals-url-option/observer-good.json","exit":1,"output":"rejected\n"}]}

## Original request

Evidence: ev-186285d0 setup/init_remote_host.go has initAnyRemoteURL skip every argument beginning with a dash before checking for a URL. setup/init_remote_host_test.go tests curl with a positional URL, but not the equals form of its URL option.

Expected: Detect a literal remote URL supplied as an equals-form URL option to curl or wget, and preserve the existing handling of positional URLs and non-remote hosts.

Scope: setup/init_remote_host.go, setup/init_remote_host_test.go. Out of scope: adding new network commands, resolving variables, or changing URL host classification.

Acceptance:
1. curl with an equals-form URL option pointing to a remote host is detected. Wrong-implementation: skipping all dash-prefixed arguments continues to miss the URL.
2. wget with an equals-form URL option pointing to a remote host is detected. Wrong-implementation: fixing only curl leaves the same option gap for the other supported command.
3. Equals-form URL options for localhost and file URLs are not classified as remote. Wrong-implementation: flagging every option value as remote rejects local checks.
4. Existing positional URL cases retain their current results. Wrong-implementation: replacing positional argument handling with equals-form-only parsing breaks already covered behavior.
