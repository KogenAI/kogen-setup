# Refuse credential literals in init commands

Slug: k-setup-refuse-secret-literals
Model: not applicable — stateless command validation and diagnostic redaction
Acceptance:
- .kogen/intents/k-setup-refuse-secret-literals/acceptance.feature
- features/steps/k-setup-refuse-secret-literals__validate.js

Update setup/init.go Validate's setup, fix and check loops, beside the publishing/deployment restrictions. Init commits public configuration; credential-bearing commands must not reach that configuration or command progress/log output. Validate must reject them before execution, returning an empty proposal as it does for other validation problems. No provider, prompt, tool schema or configuration format changes are required.

Recognize credentials by name (token, secret, password, passwd, api key, authorization, bearer), including compound names such as NAME_TOKEN, API_KEY and npm's _authToken; match names case-insensitively. Cover assignment prefixes, name=value arguments and name/value arguments, quoted header values, and scheme://user:password@host URLs. Do not guess from entropy. Inspect command parts split on ;, &&, ||, | and newlines. A pure environment reference ($NAME or ${NAME}, optionally shell-quoted) is not a literal; empty assignments are not literals. Ordinary commands remain accepted subject to existing rules.

Return one credential problem per offending command entry, using the entire command with every credential value replaced by ***: `<list> command <redacted command> contains a credential literal; read it from the environment instead`. Use setup, fix and check as the list labels. Retain surrounding syntax, quotes, URL username and noncredential text. Credential rejection takes precedence over other diagnostics for that entry, including control-character diagnostics, so no alternative problem echoes the literal. Do not sanitize a command and then accept or execute it. Preserve existing unrelated validation.

## Decisions
- Refuse literal credentials rather than attempting to store them safely; direct the user to environment references. (source: request)
- Preserve the synthetic npm, curl, git clone, empty API_KEY and npm ci cases exactly in acceptance. (source: request)

## Source comparison
- Addressed: request Problem and Need; the outcome and recognition paragraphs replace today's acceptance of literal credentials in Validate, without adding entropy guessing or provider work.
- Addressed: request's problem form; the diagnostic paragraph specifies setup/fix/check labels and redacted values, including safe precedence over existing echoing errors.
- Addressed: all six Synthetic acceptance inputs and their expected outcomes appear in acceptance.feature; additional rows exercise the requested name families, environment reference syntax and command separators.
- Addressed: existing init tests stay green; retain all useful tests and run configured checks. No requested behavior is omitted or superseded. README's build, vet and Go test conventions remain applicable.

## Tests
- Reject and redact named credential assignments, flags, headers and URL passwords across setup/fix/check: focused Validate cases plus the synthetic regressions in acceptance.feature (regression)
- Accept environment references, empty assignments and ordinary commands without entropy guessing: focused Validate cases and safe-command acceptance examples (unit)
- Inspect each separator-delimited part including newline and avoid leaking through another diagnostic: focused Validate cases and separator acceptance examples (unit)
- Preserve unrelated init behavior: existing init tests and configured build/vet/format/go-test checks (existing)

## Feasibility
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":["features/steps/k-setup-refuse-secret-literals__validate.js"],"observers":["features/steps/k-setup-refuse-secret-literals__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-secret-literals__validate.js --control '[\"fix command tool --token=*** contains a credential literal; read it from the environment instead\"]' '[\"fix command tool --token=*** contains a credential literal; read it from the environment instead\"]'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-secret-literals__validate.js --control '[\"fix command tool --token=abc123 contains a credential literal; read it from the environment instead\"]' '[\"fix command tool --token=*** contains a credential literal; read it from the environment instead\"]'","exit":1,"output":"rejected\n"}]}
