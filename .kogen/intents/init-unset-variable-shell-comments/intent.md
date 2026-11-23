# Ignore shell comments in unset-variable checks

Slug: init-unset-variable-shell-comments
Model: not applicable — the change is a stateless lexical rule in a text scanner
Acceptance:
- .kogen/intents/init-unset-variable-shell-comments/acceptance.feature
- features/steps/init-unset-variable-shell-comments__validate.js

When init checks a proposed setup, fix or check command for variables that are not set, `initUnsetVariables` in `setup/init_unset_variable.go` treats variable-looking text inside a shell comment as live. After this change, text in an unquoted shell comment is ignored: an unset variable that appears only there is not reported. Expansions in executable text, including text before the comment marker on the same line, are still reported, and a `#` inside single or double quotes, escaped, or inside a word (such as `a#b`, `$#` or `${#}`) never starts a comment. The change is confined to `setup/init_unset_variable.go` and `setup/init_unset_variable_test.go`: the scanner is not replaced by a full shell parser, and outside-project path checks are unchanged.

## Decisions
- An unquoted `#` that starts a word (at the start of the command or after whitespace, `;`, `&`, `|`, `(` or `)`) begins a comment that runs to the next newline or the end of the command; nothing in it is reported and nothing in it counts as an assignment. (evidence: setup/init_unset_variable.go) (source: request)
- A `#` inside single quotes, inside double quotes, after a backslash, or inside a word is not a comment marker, so a later live reference is still reported. (decision: D2, round 1) (evidence: setup/init_unset_variable.go) (source: request)
- The comment rule is added inside the existing character scanner, and Validate's problem text and its once-each, first-seen ordering are unchanged. (decision: D3, round 1) (evidence: setup/init_unset_variable.go; setup/init_unset_variable_test.go) (source: request)
- An unquoted word-initial # begins a shell comment running to the next newline or end of command; its content is neither reported nor treated as assignment. (decision: D1, round 1) (constraint: Quoted, escaped or mid-word # (a#b, $#, ${#}) is not a comment) (constraint: Text before the marker is still scanned) (evidence: setup/init_unset_variable.go; setup/init.go) (assumption: Validate refuses commands containing newlines, so newline termination is only observable through a direct unit test of initUnsetVariables; I ran a scratch Go test of the correct patch, which passed.) (source: request)

## Source comparison
- Request: ignore variable-looking text in shell comments while still checking executable text: addressed by D1.
- Request acceptance 1 (unset variable only after an unquoted comment marker is not reported): addressed by D1 and scenario "Text after an unquoted comment marker is not a reference".
- Request acceptance 2 (unset variable before the marker is still reported): addressed by scenario "An unset variable expanded before the comment marker is still reported".
- Request acceptance 3 (marker inside single or double quotes does not hide a later live reference): addressed by D2 and scenario "A marker inside quotes or a word does not hide a later live reference".
- Out of scope and unchanged: a full shell parser, and outside-project path checks.

## Tests
- A variable only inside an unquoted comment is not reported, and a variable before the marker still is: add cases to the table of `TestValidateUnsetVariables` in `setup/init_unset_variable_test.go` (unit)
- Markers in quotes, after a backslash or inside words (`a#b`, `$#`, `${#}`) do not hide a later reference: add cases to the same table (unit)
- A comment ends at a newline, so a later line is still scanned: add `TestInitUnsetVariablesCommentEndsAtNewline` calling `initUnsetVariables` directly, since Validate refuses commands containing newlines (unit)
- The requested behavior through Validate for setup, fix and check commands: the acceptance scenarios (scenario)

## Feasibility
- none
