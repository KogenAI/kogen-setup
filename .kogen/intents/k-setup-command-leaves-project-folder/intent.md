# Refuse commands that leave the project folder

Slug: k-setup-command-leaves-project-folder
Model: not applicable — this adds stateless command validation; the existing bounded correction conversation is unchanged
Acceptance:
- .kogen/intents/k-setup-command-leaves-project-folder/acceptance.feature
- features/steps/k-setup-command-leaves-project-folder__validate.js

Extend setup/init.go Validate beyond its existing literal absolute-root rejection. Commands verified in a copy of the committed tree must not depend on parent directories or the caller's home. Apply the new rule to proposed setup, fix and check commands. Preserve existing absolute-root validation and all other validation, merging and verification behavior. Do not execute the supplied commands to detect escapes.

## Decisions
- Reject words equal to `..` or beginning `../`, and words whose `/../` traversal escapes the project after lexical path normalization. Do not reject an internal traversal such as `sub/../file` or `sub/../app`. Reject `~/`, bare `~`, `$HOME` and `${HOME}` references outside single-quoted literal text. Double quotes do not exempt these references. Treat shell whitespace and operators as word boundaries; ignore single-quoted text rather than recursively interpreting commands inside it. This is lexical validation, not a new shell interpreter or symlink sandbox. (source: request)
- Return `setup command <command> reaches outside the project folder; use a path inside the project`, `fix command <command> reaches outside the project folder; use a path inside the project`, or `check <name> (<command>) reaches outside the project folder; use a path inside the project`, matching the existing kind/command diagnostic conventions. (source: request)
- Keep the existing one correction opportunity in initConverse: invalid proposals feed problems back once and a second invalid proposal stops with init_invalid; no additional retries. (source: request)

## Source comparison
- Addressed: request Problem and Need map to the stateless Validate rule and exact diagnostic conventions above and the executable rejection rows. The copy-of-committed-tree workflow is retained, not replaced.
- Addressed: all seven Synthetic acceptance examples are literal executable rows, alongside bare tilde, HOME spellings, double-quoted paths, normalized escaping traversal and single-quoted literal counterexamples covering Need's boundaries.
- Addressed: the existing initNamesRoot absolute-path rule remains; existing init tests and configured build/vet/test/format checks must stay green. The caller's single correction opportunity is preserved through the existing initConverse path and its tests.
- No requested behavior is omitted or superseded. The `/../` wording is resolved using the request's explicit normalization exception, not a blanket substring prohibition. No external protocol or provider change is needed.

## Tests
- Refuse relative parent escapes in all command roles with the exact problem and empty proposal: add focused Validate regression tables and execute Validate through the acceptance Go driver (regression).
- Refuse home-anchored and HOME references outside single quotes, including double quotes; accept literal single-quoted content: add focused Validate tables with these boundaries (unit).
- Accept normalized internal paths and ordinary project commands: acceptance rows and focused Validate tables (unit).
- Preserve absolute-root rejection, unrelated validation and the one-correction limit: keep existing init tests and run configured go-test plus README build/vet/race checks (existing).

## Feasibility
- evidence: {"id":"problems-observer","kind":"observer","inputs":["features/steps/k-setup-command-leaves-project-folder__validate.js"],"observers":["features/steps/k-setup-command-leaves-project-folder__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-command-leaves-project-folder__validate.js good","exit":0,"output":""},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-command-leaves-project-folder__validate.js bad","exit":1,"output":""}]}
