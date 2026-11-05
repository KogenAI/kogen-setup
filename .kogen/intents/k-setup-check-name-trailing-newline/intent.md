# Refuse check names with a trailing newline

Slug: k-setup-check-name-trailing-newline
Model: not applicable — stateless validation of one proposal's check names and diagnostic wording
Acceptance:
- .kogen/intents/k-setup-check-name-trailing-newline/acceptance.feature
- features/steps/k-setup-check-name-trailing-newline__validate.js

In setup/init.go, the pattern `initCheckNameRE` (`^[a-z0-9]+(-[a-z0-9]+)*\n?$`) used by `initChecks` (called from `setup.Validate`) explicitly allows one trailing newline. As a result, a proposed check named "lint" followed by a newline is accepted and stored as given. It is written to `.kogen/project.yaml` and shown in reports with a line break in it. Later lookups by the plain name (selection, replacing a detected check of the same name, the duplicate-name test) do not match it, so a check can be duplicated or silently fail to replace its detected namesake.

After the change, a check name is accepted only when it consists entirely of lowercase ASCII letters and digits, optionally in groups joined by single dashes (`^[a-z0-9]+(-[a-z0-9]+)*$`), with nothing else: no trailing newline or any other whitespace. The optional trailing `\n` is removed from the pattern. A name that fails this rule is refused with the existing wording `check name <name> must be lowercase letters, digits and dashes`. When the refused name contains a control character (`unicode.IsControl`, e.g. a newline or a tab), `<name>` is shown as Go's `strconv.Quote` of the name (the `%q` form the file already uses for commands with control characters), so the hidden character is visible. Example: `check name "lint\n" must be lowercase letters, digits and dashes`, where `\n` is the two characters backslash and n. Every other refused name keeps the unquoted wording exactly as today, e.g. `check name Lint must be lowercase letters, digits and dashes` and `check name Docs Check must be lowercase letters, digits and dashes`.

A refused name is not added to the proposal's checks, as today. So with `lint` and `lint` + newline in one proposal, the second check is refused by the name rule, not accepted as a distinct check, and Validate returns its usual empty proposal with the problems. Nothing else changes: valid names, the reserved-name, duplicate-name, no-command and all per-check command refusals (including `check lint (true) runs nothing`), the order of problems, and the proposal and written configuration for valid proposals. No prompt, tool definition, golden file or configuration format changes.

## Decisions
- A name is valid only if it matches `^[a-z0-9]+(-[a-z0-9]+)*$` exactly; a trailing newline or any other whitespace is refused. (source: request)
- The refusal keeps the existing wording `check name <name> must be lowercase letters, digits and dashes`. (source: request)
- The name is shown quoted (Go `strconv.Quote`) when it contains a control character, so a hidden newline is visible. Names without control characters stay unquoted, so the existing refusals and the existing init tests (`check name Docs Check …`, `check name -a …`) are unchanged. (source: request)
- The request's `lint`/`true` example keeps its current outcome: the name is accepted and the existing, unchanged `check lint (true) runs nothing` refusal still applies. A `lint`/`make lint` example shows the accepted check in the proposal. (source: request)

## Source comparison
- Addressed: request Problem (the `\n?` in initCheckNameRE lets a trailing newline through, and the name is stored as given). The outcome paragraph removes the allowance and refuses such names before they reach the proposal.
- Addressed: request Need (lowercase letters, digits and single dashes only, with no trailing newline or whitespace; existing wording with the name quoted so the newline is visible). The rule and diagnostic paragraph specifies quoting for control characters.
- Addressed: synthetic `lint` + newline / `true`. Acceptance expects exactly `["check name \"lint\\n\" must be lowercase letters, digits and dashes"]`, with no checks proposed.
- Addressed with an observed caveat: synthetic `lint` / `true` "accepted as before". On the unchanged tree the name passes but Validate already reports `check lint (true) runs nothing` (observed with a Validate driver), and acceptance keeps exactly that outcome. `lint` / `make lint` is accepted with checks `[{"name":"lint","run":"make lint"}]`.
- Addressed: `Lint`, `lint_`, `-lint`, `lint--x` stay refused with the unchanged unquoted wording; `go-vet2` (run `go vet ./...`) stays accepted.
- Addressed: `lint` and `lint` + newline in one proposal. With `make lint` the only problem is the quoted name refusal. With `true`, the problems are the name refusal followed by the unchanged `check lint (true) runs nothing`, keeping today's order: name problems from initChecks come before the per-check command problems.
- Addressed: "no other whitespace". `lint` + trailing space stays refused unquoted (no control character); `lint` + tab is refused and shown quoted as `"lint\t"`.
- Addressed: existing init tests stay green. No existing test expects a name with a control character in a refusal.

## Tests
- A name with a trailing newline is refused with the quoted name and is not proposed: add a `"lint\n"` case to TestInitValidateShapes in setup/init_test.go, plus the acceptance scenario (regression)
- A name with another control character (tab) is refused and quoted: same table-driven test plus an acceptance example (unit)
- `lint` together with `lint` + newline in one proposal: the second is refused by the name rule, not accepted as a distinct check: a Validate unit case plus acceptance scenarios (regression)
- Valid names (`lint`, `go-vet2`) and existing refusals (`Lint`, `lint_`, `-lint`, `lint--x`, trailing space, reserved, duplicate, runs nothing) are unchanged: existing TestInitValidateNamesDuplicatesReservedAndUntrackedAreProblems and TestInitValidateShapes plus acceptance examples (existing)

## Feasibility
- Observed on the unchanged tree with a temporary Validate driver (go build from the repository root of a main package outside it): `lint\n`/`true` gives `["check lint\n (true) runs nothing"]`; `lint`/`true` gives `["check lint (true) runs nothing"]`; `lint`/`make lint` and `go-vet2`/`go vet ./...` are accepted; `lint` plus `lint\n` with `make lint` are both accepted as distinct checks (the bug).
- evidence: {"id":"validate-observer","kind":"observer","inputs":["features/steps/k-setup-check-name-trailing-newline__validate.js"],"observers":["features/steps/k-setup-check-name-trailing-newline__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-name-trailing-newline__validate.js --control '[\"check name \\\"lint\\\\n\\\" must be lowercase letters, digits and dashes\"]' '[\"check name \\\"lint\\\\n\\\" must be lowercase letters, digits and dashes\"]'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-name-trailing-newline__validate.js --control '[\"check lint\\n (true) runs nothing\"]' '[\"check name \\\"lint\\\\n\\\" must be lowercase letters, digits and dashes\"]'","exit":1,"output":"rejected\n"}]}
