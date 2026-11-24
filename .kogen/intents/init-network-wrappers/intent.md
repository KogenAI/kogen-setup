# Detect init network commands through wrappers

Slug: init-network-wrappers
Model: not applicable — literal command classification has no meaningful state
Acceptance:
- .kogen/intents/init-network-wrappers/acceptance.feature
- features/steps/init-network-wrappers__validate.js
- features/steps/init-network-wrappers__driver/main.go

Detect remote-host commands behind the common transparent prefixes sudo, env, command and time. Replace the first-word-only limitation in initContactsRemoteHost without broadening the existing network command vocabulary or changing literal-host, loopback, file-URL or local-Git-path classification. Recognize the named prefixes in command parts, including repeated prefixes, and inspect the underlying literal command rather than assuming a wrapper implies a remote target. Preserve the existing literal-only interpretation; this is not shell execution or general shell evaluation.

Implementation scope is setup/init_remote_host.go, setup/init_remote_host_test.go and setup/init_test.go. Extend focused helper regression coverage and validation coverage in those test files; keep useful existing tests. No new dependencies, options, network command names or host classifications are requested. Acceptance invokes the public Validate interface with proposals, not the network commands themselves.

## Decisions
- Detect remote-host commands behind common transparent prefixes such as sudo, env, command and time, while preserving the existing literal-host and loopback behavior. (decision: D1, round 1) (constraint: Recognize the four named literal prefixes, including consecutive prefixes, before applying the existing command and target classification.) (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go) (source: request)
- Do not add network command names or change which hosts count as remote. (decision: D2, round 1) (constraint: Preserve the existing direct-command cases, quoted and dynamic target handling, and non-remote classifications.) (evidence: setup/init_remote_host.go; setup/init_remote_host_test.go) (source: request)
- Validate refuses a check and a fixer that contact a remote host through a supported wrapper, with the existing role-specific diagnostic. (decision: D3, round 1) (constraint: Exercise the public Validate entry point for both roles, not only the private classifier.) (evidence: setup/init.go) (source: request)

## Source comparison
- Addressed: request evidence ev-8a50130c identifies first-word-only detection in setup/init_remote_host.go and missing wrapper regression coverage in setup/init_remote_host_test.go. The outcome above replaces that limitation; acceptance.feature's remote-check outline preserves the supplied sudo curl reproducer and covers direct and wrapped curl, wget, ping, ssh and git ls-remote.
- Addressed: request acceptance 2 and the Expected preservation clause map to the non-remote outline, including localhost, existing loopback addresses, file URLs, local Git paths and literal-only target interpretation. Host rules and the existing command vocabulary remain unchanged under D2.
- Addressed: request acceptance 3 maps to both validation outlines and their complete role-specific diagnostic expectations, observed through setup.Validate. The fixer outline covers the role connection independently of helper-only tests.
- Addressed: all three requested wrong-implementation counterexamples map to controls.json: first-word-only inspection, unconditional wrapper rejection, and a helper change disconnected from validation. The validation-disconnection overlay is deliberately wrong proof material, not permission to expand production scope to setup/init.go.
- Addressed: the requested production scope remains the three paths above. New acceptance artifacts use only this Intent's prefixed bindings and driver. No requested behavior or settled non-secret literal is intentionally omitted, conflicting or superseded beyond the explicitly replaced first-word-only limitation.

## Tests
- Recognize direct and wrapped remote commands: extend TestInitContactsRemoteHost in setup/init_remote_host_test.go with the named prefixes and retain direct-command coverage (unit)
- Preserve literal-host and non-remote behavior: extend the same table with wrapped local targets and retain useful existing negative cases (regression)
- Refuse wrapped remote checks and fixers through validation: add focused Validate assertions in setup/init_test.go and execute the public-interface acceptance outlines with exact problems (integration)

## Feasibility
- The existing TestInitContactsRemoteHost passed on the unchanged tree with Go 1.27.2; the public driver returned the existing diagnostic for the direct reproducer and an empty problem list for the wrapped reproducer. No remote command was executed. (probe: exit 0)
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":[".kogen/intents/init-network-wrappers/observer-good.json",".kogen/intents/init-network-wrappers/observer-bad.json","features/steps/init-network-wrappers__driver/main.go"],"observers":["features/steps/init-network-wrappers__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/init-network-wrappers__validate.js --observer .kogen/intents/init-network-wrappers/observer-good.json","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/init-network-wrappers__validate.js --observer .kogen/intents/init-network-wrappers/observer-bad.json","exit":1,"output":"rejected\n"}]}
