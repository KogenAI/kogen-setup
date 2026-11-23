# Report argument-count errors as JSON

Slug: standalone-cli-json-usage-errors
Model: not applicable — a stateless argument check at the start of a command, with no state to model
Acceptance:
- .kogen/intents/standalone-cli-json-usage-errors/acceptance.feature
- features/steps/standalone-cli-json-usage-errors__usage.js

The standalone command `cmd/kogen-setup` documents its stdout as one JSON object with `exit`, `configuration` and `error`. Today, when it is run with anything other than exactly one checkout argument, it prints plain usage text to stderr, writes nothing to stdout and exits 2, so a caller that parses stdout gets nothing. Keep the JSON contract on that path.

When the argument count (after the program name) is not exactly one, the command writes to stdout exactly one JSON object `{"exit":2,"configuration":null,"error":"usage: kogen-setup <checkout>"}` followed by a newline, writes the line `usage: kogen-setup <checkout>` (with its newline, nothing else) to stderr, and exits 2. This covers both no argument and more than one argument. One valid checkout argument behaves exactly as today. The Claude Code hook subcommand and Init behavior are untouched.

The existing command test `cmd/kogen-setup/main_test.go` (`TestUsageWithoutExactlyOneCheckout`) currently asserts empty stdout for these cases; update it to assert the JSON object above, the stderr usage line and exit 2 for both cases. No other change is needed to the README, which already documents the JSON stdout.

## Decisions
- The usage error's JSON `error` field is the usage message without the trailing newline, `exit` is 2 and `configuration` is null, matching the documented schema; stderr keeps the existing usage line byte for byte. (evidence: cmd/kogen-setup/main.go; cmd/kogen-setup/main_test.go; README.md) (source: request)
- Both the missing-argument and the too-many-arguments case use the same path and output. (source: request)
- Valid one-argument invocations, and the hook subcommand dispatch that precedes the argument check, are unchanged. (evidence: cmd/kogen-setup/main.go) (source: request)
- The old assertion in `TestUsageWithoutExactlyOneCheckout` that stdout is empty is replaced, since it contradicts the requested contract. (evidence: cmd/kogen-setup/main_test.go) (source: request)

## Source comparison
- Addressed: argument-count errors emit one JSON result on stdout, usage on stderr, exit 2, for zero and for two arguments (scenarios 1 and 2).
- Addressed: a valid checkout argument keeps the Init result JSON and exit code (scenario 3).
- Omitted by request: the Claude Code hook protocol and Init behavior for valid arguments.
- Superseded: the existing test expectation of empty stdout on usage errors.

## Tests
- No checkout argument yields the JSON object, the stderr usage line and exit 2: update cmd/kogen-setup/main_test.go TestUsageWithoutExactlyOneCheckout, and the "No checkout argument" scenario (scenario)
- Too many arguments yield the same JSON, stderr and exit code: the "no argument" and "two arguments" subtests, and the "Too many arguments" scenario (scenario)
- One valid checkout keeps the Init JSON and exit code: existing TestEmptyGitRepositoryInitializes and the "One valid checkout argument" scenario (existing)

## Feasibility
- evidence: {"id":"usage-observer","kind":"observer","inputs":["features/steps/standalone-cli-json-usage-errors__usage.js"],"observers":["features/steps/standalone-cli-json-usage-errors__usage.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/standalone-cli-json-usage-errors__usage.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/standalone-cli-json-usage-errors__usage.js bad","exit":1,"output":"rejected\n"}]}
