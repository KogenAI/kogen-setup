# Refuse check names longer than 64 characters

Slug: k-setup-check-name-length-bounded
Model: not applicable — stateless validation of one proposal's check names and the wording of one refusal
Acceptance:
- .kogen/intents/k-setup-check-name-length-bounded/acceptance.feature
- features/steps/k-setup-check-name-length-bounded__validate.js

In setup/init.go, `initChecks` (called from `setup.Validate`) checks a proposed check name only against `initCheckNameRE` (`^[a-z0-9]+(-[a-z0-9]+)*$`); its length is not limited. Observed on the unchanged tree: a name of 65 `a` characters with run `make lint` is accepted into the proposal's checks, so a name of thousands of characters would be run through progress lines, written to `.kogen/project.yaml` and repeated in every report line and left-out entry that names the check.

After the change, `initChecks` refuses a check name longer than 64 characters with exactly `check name <first 20 characters>… is longer than 64 characters`, where `…` is the single character U+2026 (HORIZONTAL ELLIPSIS) placed directly after the 20 characters, with no space. Characters are Unicode code points (Go runes): the length is the name's rune count and the shown prefix is its first 20 runes (never a split UTF-8 sequence). Example: a name of 65 `a` characters gives `check name aaaaaaaaaaaaaaaaaaaa… is longer than 64 characters` (61 characters), and a name of 5000 `a` characters gives the same 61-character problem. When those 20 characters contain a control character (`unicode.IsControl`), they are shown as Go's `strconv.Quote` of the 20 characters, followed by `…`, as the existing character-rule refusal already quotes names with control characters; example: `lint` + newline + 60 `a` characters gives `check name "lint\naaaaaaaaaaaaaaa"… is longer than 64 characters` (where `\n` is the two characters backslash and n).

The length rule is checked before the character rule, so a name longer than 64 characters that also breaks the character rule gets only the length refusal (one problem, not two); example: `A` followed by 64 `a` characters gives only `check name Aaaaaaaaaaaaaaaaaaaaa… is longer than 64 characters`. The reserved names (`acceptance`, `model`) are short and keep their refusal; a refused long name is not added to the proposal's checks, so it can neither be used twice nor reach the per-check command problems. As today, Validate returns its usual empty proposal whenever there are problems.

Nothing else changes: names of 64 characters or fewer follow exactly today's rules and wording (a 64-character `a` name passes the name rule; with run `make lint` it is accepted into the proposal as given, and with run `true` the only problem stays the existing `check <name> (true) runs nothing`), the character-rule refusal (`check name Lint must be lowercase letters, digits and dashes`), the reserved, duplicate and no-command refusals, the order of problems, and the proposal and written configuration for valid proposals. No prompt, tool definition, golden file or configuration format changes.

## Decisions
- A check name longer than 64 characters is refused with `check name <first 20 characters>… is longer than 64 characters`; names of 64 characters or fewer are not affected. (source: request)
- A name that is both too long and breaks the character rule gets one refusal, the length refusal, because the length rule is checked first. (source: request)
- "Characters" in the request's wording are Unicode code points (Go runes) for both the 64 limit and the 20-character prefix, and `…` is U+2026 directly after the prefix. (source: request)
- The refusal must be short and readable, so when the 20-character prefix contains a control character it is shown quoted with Go `strconv.Quote`, matching the existing character-rule refusal, and a newline never enters the problem raw. (source: request)

## Source comparison
- Addressed: request Problem (name length not limited). Observed on the unchanged tree with a temporary Validate driver: 65 `a` characters / `make lint` is accepted into the checks with no problem; acceptance expects the length refusal and no checks.
- Addressed: request Need wording `check name <first 20 characters>… is longer than 64 characters` with the fixed bound 64, and "much shorter than the name": acceptance checks the exact 61-character problem for 65 and for 5000 `a` characters, and that the problem is shorter than 100 characters for the 5000-character name.
- Addressed with an observed caveat: synthetic "`a` repeated 64 times, run `true`: accepted". On the unchanged tree that name passes the name rule but Validate already refuses the check with `check aaaa…(64 a) (true) runs nothing`; that refusal is unchanged and outside this request. Acceptance keeps exactly that single problem (no name refusal) and also shows the 64-character name with run `make lint` accepted into the proposal's checks as given.
- Addressed: "A 65-character name that also breaks the character rule gets one refusal, not two": `A` + 64 `a` gives exactly one problem, the length refusal.
- Addressed: `go-vet2` (run `go vet ./...`) stays accepted; `Lint` keeps `check name Lint must be lowercase letters, digits and dashes`.
- Addressed: "Existing init tests stay green": no existing test uses a name longer than 64 characters.
- Owning file: setup/init.go (`initCheckNameRE`, `initChecks`).

## Tests
- A name longer than 64 characters is refused with the bounded wording and is not proposed (65 and 5000 `a` characters): add cases to TestInitValidateShapes in setup/init_test.go, plus acceptance scenarios (unit)
- A name of exactly 64 characters still passes the name rule and is proposed as given: a TestInitValidateShapes case or a Validate unit assertion, plus acceptance scenarios (unit)
- A too-long name that also breaks the character rule gets only the length refusal: TestInitValidateShapes case (`A` + 64 `a`) plus acceptance scenario (unit)
- A too-long name whose first 20 characters contain a control character shows them quoted: TestInitValidateShapes case (`lint\n` + 60 `a`) plus acceptance scenario (unit)
- `go-vet2` accepted and `Lint` refused with the unchanged wording, and the other existing name refusals: existing TestInitValidateShapes and TestInitValidateNamesDuplicatesReservedAndUntrackedAreProblems plus acceptance scenarios (existing)

## Feasibility
- Observed on the unchanged tree with a temporary Validate driver (a main package outside the repository, built with `go build` from the repository root): `a`×64 / `true` gives `["check aaaa…(64 a) (true) runs nothing"]`; `a`×64 / `make lint` and `a`×65 / `make lint` are both accepted into the checks; `A` + `a`×64 gives the character-rule refusal with the full name; `Lint` gives `check name Lint must be lowercase letters, digits and dashes`.
- evidence: {"id":"validate-observer","kind":"observer","inputs":["features/steps/k-setup-check-name-length-bounded__validate.js"],"observers":["features/steps/k-setup-check-name-length-bounded__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-name-length-bounded__validate.js --control '[\"check name aaaaaaaaaaaaaaaaaaaa… is longer than 64 characters\"]' '[\"check name aaaaaaaaaaaaaaaaaaaa… is longer than 64 characters\"]'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-check-name-length-bounded__validate.js --control '[]' '[\"check name aaaaaaaaaaaaaaaaaaaa… is longer than 64 characters\"]'","exit":1,"output":"rejected\n"}]}
