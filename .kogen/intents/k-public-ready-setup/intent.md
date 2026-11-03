# Prepare public setup documentation

Slug: k-public-ready-setup
Model: not applicable — documentation cleanup has no meaningful state machine
Acceptance:
- .kogen/intents/k-public-ready-setup/acceptance.feature
- features/steps/public-ready.js

Make this repository understandable and usable from a plain public clone of KogenAI/kogen-setup with the Go toolchain. Change README and documentation only, including committed historical Intent prose where necessary. Preserve executable behavior and every existing assertion. Do not change .kogen/project.yaml, Go files, dependencies, existing step definitions, models, or executable scenario semantics. Neutralize identifying examples in old records without changing what the records say. Do not rewrite Git history.

## Decisions
- Explain the component's role in Kogen, retain the standalone command and its JSON/exit contract, and give public clone, build and test instructions. Use the Go version required by go.mod; retain the existing build/vet/race test command and synthetic golden-update guidance. Remove obsolete private-module setup rather than replacing it with credentials, mirrors or environment workarounds. (source: request)
- Use https://kogen.dev or https://github.com/KogenAI/kogen for Kogen-wide reader links. State contact@kogen.dev exactly once in README for inquiries. All reader-facing links throughout the tree must resolve publicly, including local relative targets. Synthetic loopback transport endpoints in executable fixtures are not reader links. (source: request)
- Do not add security, contribution or branding policy files, contribution refusals, maintenance promises, or commentary on disabled issues/pull requests. GitHub settings are already settled and require no API or account changes. (source: request)
- Audit the entire committed tree, including hidden Intent records, for identifying home/runner paths, the four supplied runner host names, personal names, internal landing/delivery notes and private URLs. Replace identifying examples with neutral placeholders such as <checkout>; preserve the meaning and settled behavior of each record. Synthetic test paths remain synthetic. (source: request)
- Only README/documentation implementation edits are authorized. The local lineup override is not repository content and must neither be edited nor reported as a repository finding. The actual project configuration uses plain commands and needs no edit. (source: request)
- Add docs/public-readiness.md as the owner-facing audit result, not an onboarding policy. Include sections `## Current tree`, `## Public links`, and `## Historical findings`. Audit all reachable repository history read-only and list each historical hit with full commit id, repository-relative file and a sanitized description of what was found, not the original private text. Include personal-name and internal-note findings, not only mechanically recognizable paths. State explicitly when a category has no hits. Record history coverage and any limitations honestly; unavailable history is not evidence of no hits. The owner decides what to do; this change must never rewrite history. (source: request)

## Source comparison
- Addressed: K-PUBLIC-READY-SETUP Problem and Need — Decisions and acceptance cover public onboarding, role, contact, public links, forbidden policy files/copy, whole-tree identifying content, preservation of behavior and history inventory. Existing checks remain mandatory and unchanged.
- Addressed: re-filed 3 Nov Scope and Previous attempt — no configuration edit is required; host-only lineup changes are excluded, not sanitized. Only documentation implementation changes are allowed.
- Addressed: h16 review — old committed Intent records are included in the tree audit and may receive neutral prose substitutions without changing their contracts. The supplied identifying path and host examples are represented by patterns in acceptance rather than newly publishing them verbatim.
- Addressed: README supplied with request — preserve the accurate component, standalone entry point, packages, test commands, golden workflow and license information; remove its obsolete private-module paragraph and add public checkout prerequisites/instructions and the single inquiry address. Unavailable workflows and private workspace links must not survive elsewhere.
- Omitted: no requested outcome. No history rewrite, repository-settings mutation, dependency upgrade or runtime feature is authorized. Review the complete documentation, not only the deterministic textual predicates; predicates cannot establish absence of every personal name or maintenance promise.

## Tests
- Public README contains usable setup/test instructions and one inquiry address without private setup advice: read actual README through public-ready scenarios (scenario)
- No forbidden policy files or identifying runner/home examples survive in documentation, including old Intent records: tree-content predicates and complete documentation review (regression)
- All reader links resolve publicly, all personal/internal references are neutralized, and historical hits are listed without rewriting history: audit report scenarios plus final independent review of link results, full tree and history inventory (integration)
- Runtime behavior and assertions are unchanged: retain all configured checks and existing acceptance scenarios; documentation-only implementation diff review (existing)

## Feasibility
- An isolated scratch probe downloaded the pinned coordinator module through the public Go proxy with private-module bypass settings empty, fresh module cache and checksum verification enabled: exit 0. A second probe ran go test ./... with the same public settings and a fresh cache: exit 0, both contract and setup packages passed. This establishes public dependency/test feasibility on the inspected tree, not all network/link availability.
- The scratch copy has no Git metadata: read-only git history queries there returned `fatal: not a git repository (or any of the parent directories): .git`. Historical findings must be gathered in the implementation checkout with actual history; do not invent findings from this probe.
- Documentation search for pinned component repositories returned generic unrelated GitHub results (retrieved, not useful technical evidence). Fetch of https://github.com/KogenAI/kogen returned a retrieved, untrusted HTML response; it is not proof that every repository link works. Final link audit remains required. No external protocol changes are involved.
