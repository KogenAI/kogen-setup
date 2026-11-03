# Add a standalone setup command

Slug: k-setup-cmd-entry
Model: not applicable — this is wiring of the existing Init workflow, not a new state machine
Acceptance:
- .kogen/intents/k-setup-cmd-entry/acceptance.feature
- features/steps/cmd-entry.js

Add a developer entry point at cmd/kogen-setup, built using this repository's go.mod with `go build -o <binary> ./cmd/kogen-setup`. Invoke it as `kogen-setup <checkout>` (one directory argument). Run setup.Init in that checkout with the caller's environment, home, existing provider client and KOGEN_NODE/KOGEN_QUINT/KOGEN_CUCUMBER tools. Do not require an assembled kogen binary or adoption of the component repository. Retain the existing module dependencies; add no dependency on kogen.

Stdout contains exactly one JSON object with fields `exit` (integer), `configuration` (null when no valid configuration exists, otherwise an object with `path` equal to `.kogen/project.yaml` and `content` containing the exact written UTF-8 YAML), and `error` (null on success, otherwise the error string). Return Init's exit code unchanged; send Init's human-readable stdout and stderr to stderr, along with its error if any. Read the resulting configuration after Init rather than predicting it. This reports existing configuration too on an already-initialized checkout. A valid result is emitted on Init failures as well. Document usage and the result schema in README.md. Argument/serialization failures may use ordinary nonzero command errors; no new phase behavior is introduced.

## Decisions
- This is a developer entry point, not an addition to Kogen's user-facing CLI. No phase behavior or timeout changes are permitted. (source: request)
- Use the JSON envelope above to expose exact configuration bytes without inventing another configuration schema. (source: request)
- Keep all existing tests unchanged, including contract/TestInitFirstCommitOfAnEmptyRepository; its exact template, first commit and output assertions concern Init and do not contradict redirecting command output. No protected implementation edits are required. (source: request)
- Acceptance repositories have local user.name=Fixture and user.email=fixture@example.invalid, disabled signing, and an empty hooks directory, even with global git configuration disabled. (source: request)

## Source comparison
- Addressed: K-SETUP-CMD-ENTRY's standalone cmd/kogen-setup, own-go.mod build, checkout input, machine-readable configuration and exit code are specified above and exercised by acceptance.
- Addressed: unchanged Init/Kogen CLI, no raised timeout and no new dependency on kogen are mandatory boundaries; the existing contract and full configured checks remain intact.
- Addressed: the 14:46Z unproven protected-baseline claim does not authorize test changes; no actual conflicting assertion was found in inspected contract/files_test.go. The 17:07Z environment/git_identity_missing exit 3 fixture regression is covered by local identity setup and a separate missing-identity outcome.
- Omitted: unrelated historical provider/cache/Studio examples in the testing policy do not change this developer entry point or authorize external service calls. Acceptance uses Init's existing empty-repository route, which needs no provider.

## Tests
- Build and execute the standalone command on an empty Git checkout with local identity, preserving the first-commit behavior and reporting the exact written configuration: standalone command scenario (scenario)
- Repeating the command reports the same configuration without another commit: repeat invocation scenario (scenario)
- Preserve Init's missing-identity exit 3 and emit a null configuration without a commit: missing identity scenario (regression)
- Preserve all existing phase behavior and contract assertions without modifying them: existing go test ./... suite (existing)

## Feasibility
- Repository dependency inspection via go doc confirmed sys.NewWith, Session.Context and provider.NewClient and the existing project configuration interface; no external protocol changes are involved. (probe: exit 0, 0.2 s; NewSession does not exist, use NewWith)
- evidence: {"id":"result-observer","kind":"observer","inputs":["features/steps/cmd-entry.js"],"observers":["features/steps/cmd-entry.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/cmd-entry.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/cmd-entry.js bad","exit":1,"output":"rejected\n"}]}
