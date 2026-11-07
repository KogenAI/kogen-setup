# Bound init Git path arguments

Slug: k-init-large-file-list
Model: not applicable — this changes transport size for path lists, not workflow state or transitions
Acceptance:
- .kogen/intents/k-init-large-file-list/acceptance.feature
- features/steps/k-init-large-file-list__init.js

Fix Studio issue 7838c100: init must complete on projects with very large dependency trees instead of passing an unbounded file list to Git. Every init Git invocation taking path lists must use bounded batches or a supported pathspec-file interface. Preserve small-project behavior, configuration files, one init commit, verification of the committed snapshot, and the user's dirty files. Acceptance uses plain generated files and a local literal scripted setup response, with no network installs or live provider requests. Do not edit existing .kogen configuration, models, or other protected files. The requested Intent artifacts are the explicit exception to the request's instruction not to edit .kogen/; generated fixture repositories are external temporary directories.

## Decisions
- Use the recommended 32768-byte upper bound on Git argv, including the git name and NUL terminators, batching by encoded byte size rather than path count; a pathspec-file implementation is equally acceptable where the particular Git subcommand supports it. (assumption: approval confirms the recommended 32768-byte Git argv bound and accounting convention) (source: request)
- Reproduce the issue with changed tracked plain files so init must restore committed contents in its verification copy; a clean large tree alone would not exercise the existing unbounded archive command. (evidence: setup/init.go) (source: request)
- Exercise the standalone compiled command with a local scripted provider, literal Node-project manifest, and no npm invocation or network install. Keep each scenario step within 120 seconds. (evidence: README.md; cmd/kogen-setup/main.go; setup/init_test.go) (source: request)
- Preserve configuration output, committed file set and commit subject, the one branch commit, dirty tracked contents, and committed-snapshot checks on both fixture sizes; retain existing project regression coverage for other unchanged behavior. (evidence: setup/init.go; setup/init_test.go; README.md) (source: request)

## Source comparison
- Addressed: request Need 1 and Acceptance 1/3 are covered by the large-tree scenario and the recording Git wrapper, with the bounded-argv contract above. The motivating command is the archive restoration in setup/init.go, but the contract applies to every init path-list Git call, not just that call.
- Addressed: request Need 2 and Acceptance 2 are covered by the small-project scenario and retained existing regression checks. Literal baseline configuration, team lineup, committed file set and subject are in acceptance.feature. Preserve files and commit semantics, rather than inventing a new initializer or changing prompts.
- Addressed: the supplied reproducer scale and plain-file/no-install constraints are encoded in acceptance.feature and its literal generated fixture. Dirty tracked files strengthen the reproducer without replacing the large-tree requirement.
- Addressed: the delivery note's undefined-binding defect is avoided by exact reusable definitions. The request explicitly requires the k-init-large-file-list prefix, new files named k-init-large-file-list__<suffix>.js directly in features/steps, and no other Intents' bindings; the complete package follows those requirements.
- Addressed: naming, placement, no further questions, 120-second step limit, and existing .kogen protection are retained. No supplied behavior is intentionally omitted or superseded.
- The controls.json alternate CLI is only an isolated known-good implementation for the supplied fixture cases, not a proposed production design or permission to change the workflow. It initializes a committed clone and transfers the resulting commit while preserving fixture dirty files. Implement the requested bounded-path transport in the production workflow instead; do not introduce this control's alternate clone-and-transfer design.

## Tests
- Large path lists must not cause init argument-list failure: generated large dirty tracked Node-project fixture through the compiled standalone CLI (regression)
- Every init Git argv stays bounded: recording Git wrapper observes and measures all init invocations for both fixture sizes (integration)
- Small-project behavior remains unchanged: assert success JSON, exact baseline generated files, committed file set, one commit and subject, preserved dirty files, and retained snapshot checks (scenario)
- Other init semantics remain unchanged: retain the current project check suite and useful setup and contract tests (existing)

## Feasibility
- The declared observer controls qualify the submitted assertion bytes using an actual successful small fixture and the same observed result with one deliberately oversized recorded Git argv. These are technical readiness checks, not outputs attributed to the product request.
- evidence: {"id":"init-observer","kind":"observer","inputs":["features/steps/k-init-large-file-list__init.js",".kogen/intents/k-init-large-file-list/acceptance.feature"],"observers":["features/steps/k-init-large-file-list__init.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-init-large-file-list__init.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-init-large-file-list__init.js bad","exit":1,"output":"git argv exceeds 32768 bytes\n"}]}
- Repository inspection identified the unbounded git archive shell path list in initCommittedCopy. No protected production edit is required.
- A scratch small-fixture probe after correcting the expected subject to the observed existing value succeeded and supplied the exact configuration and models literals now in acceptance.feature. Earlier probes exposed an incorrect subject expectation, missing standalone NODE_PATH, and the absence of private retained proposal paths in scratch copies; these failures established no feature support.
- Documentation discovery searched for authoritative Git archive and restoration documentation. The git-scm.com git-archive reference was retrieved with status retrieved and untrusted=true at https://git-scm.com/docs/git-archive; its synopsis and path description document positional archive paths, not a pathspec-from-file option. Prefer bounded archive batches rather than assuming that option is universally available. Documentation is technical evidence only, not scope authority.
