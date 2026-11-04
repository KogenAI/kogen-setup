# Refuse shell syntax errors during setup

Slug: k-setup-refuse-shell-syntax-errors
Model: not applicable — this is a stateless validation predicate; existing init conversation and verification lifecycle remain unchanged
Acceptance:
- .kogen/intents/k-setup-refuse-shell-syntax-errors/acceptance.feature
- features/steps/k-setup-refuse-shell-syntax-errors__validate.js

Extend setup/init.go Validate to parse every proposed setup, fix and check command using `sh -n -c <command>`, without executing it. A shell syntax rejection adds `<list> command <command> is not valid shell syntax: <first line of the shell's message>`, with list spelled setup, fix or check, and the original non-secret command text. Use the shell's actual diagnostic first line, not a hardcoded platform-specific English message. Additional existing validation problems remain applicable. Preserve credential redaction: do not introduce raw credential disclosure through this diagnostic for commands already refused as containing credential literals.

Run the parser with an empty environment, without setting its working directory to InitContext.Root (the project folder is not used). Distinguish a started shell's nonzero parse exit from failure to start sh: the latter skips this rule without a problem. A parse-successful command gets no new problem regardless of runtime behavior, missing programs or missing files. No execution, provider request, project access or runtime verification belongs in this predicate. Keep other validation policies, initConverse's existing repair attempt and initVerify's runtime filtering unchanged. Syntax problems now reach the model through the existing Validate/initConverse path rather than first being discovered by initVerify and silently losing the intended command. No new flags, settings, dependencies or prompt changes are needed.

## Decisions
- Reject shell syntax errors in setup, fix and check before verification and return the stated problem to the model (source: request).
- Parse only; successful syntax is unaffected by hypothetical execution, including missing programs/files (source: request).
- Skip the rule if sh cannot start; pass an empty parser environment and do not use the project folder (source: request).
- Preserve existing validation and runtime verification behavior except the new syntax refusal (source: request).

## Source comparison
- Addressed: the request's owning file `setup/init.go`, `Validate`, repair through `initConverse`, and contrast with `initVerify` are specified above and exercised by public Validate and real Init acceptance. The local Init harness deliberately has no second scripted reply: observing a second request and no verification proves handback, not successful model repair; add a focused repair integration test using existing init fixtures during implementation.
- Addressed: all four malformed examples (`echo "unterminated`, `go test ./... &&`, `if true; then echo x`, `echo $(date`), dangling pipe, all four valid counterexamples (`npm ci`, `go test ./... | tail -n 5`, `nonexistent-program --flag`, `gofmt -l -w .`) and `touch marker; echo "x` appear in acceptance.feature. Missing file and a valid touch command distinguish parsing from execution. Marker absence is observed directly around Validate; Init is observed never entering fix verification.
- Addressed: the exact diagnostic template, original command text, first-line-only message, empty environment, no project folder, and unavailable sh branch have executable scenarios. Existing validation may additionally reject an input for its original policy (for example setup echo); syntax assertions select the new diagnostic without removing old rules.
- Addressed: existing init tests must stay green; README and configured build, vet, formatting and go-test commands remain unchanged. The full README race suite is required before delivery. No protection conflict is required by edits to setup/init.go or ordinary implementation tests.
- Omitted: no requested feature behavior. No supplied non-secret commands or examples are superseded. Historical testing-policy anecdotes do not change this feature's scope.

## Tests
- Reject unbalanced quotes, unclosed command substitution, dangling && or pipe and unmatched if/fi in each relevant command list with command text and shell diagnostic first line: add focused Validate shell syntax regression cases and acceptance table (regression).
- Accept syntactically valid setup/fix/check commands regardless of missing executable/file or runtime behavior, without executing any command: add Validate subprocess cases and marker assertions (integration).
- Invoke sh with -n -c and the intact command, empty environment, and no project working directory: recording-shell acceptance and focused Validate process tests (integration).
- Skip syntax validation when sh cannot start: missing-PATH acceptance and focused Validate test (integration).
- Hand syntax problems back through initConverse without verification and permit the model's corrected proposal: acceptance through setup.Init plus a new repair test using existing init fixtures (integration).
- Preserve existing init validation and verification tests: run go build ./..., go vet ./..., go test -race -count=1 ./... and configured checks (existing).

## Feasibility
- Documentation: general POSIX search retrieved secondary sources; origin-scoped discovery at https://pubs.opengroup.org returned unsupported. Fetch of https://pubs.opengroup.org/onlinepubs/9799919799/utilities/sh.html returned retrieved but untrusted data, including -c command-string semantics; it is not treated as authority or instructions. The actual local shell is the acceptance diagnostic oracle; no external service is involved.
- Local probe: `go run ./features/steps/testdata/init_harness.go '{"fix":["touch marker; echo \"x"]}'` exited 0 in 0.8 s. Unchanged behavior made one model request, entered fix verification, omitted fix after status 2, and wrote config. This establishes the baseline harness route and the missing-feature distinction, not the changed behavior.
- evidence: {"id":"syntax-observer","kind":"observer","inputs":["features/steps/k-setup-refuse-shell-syntax-errors__validate.js","features/steps/testdata/init_harness.go"],"observers":["features/steps/k-setup-refuse-shell-syntax-errors__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-shell-syntax-errors__validate.js --control '{\"problems\":[\"setup command echo is not valid shell syntax: first\"],\"marker\":false,\"shell\":{\"args\":[\"-n\",\"-c\",\"text\"],\"env\":[],\"cwd\":\"outside\"},\"init\":{\"requests\":2,\"config\":\"\",\"status\":\"\",\"verified\":false}}' '{\"problems\":[\"setup command echo is not valid shell syntax: first\"],\"marker\":false,\"shell\":{\"args\":[\"-n\",\"-c\",\"text\"],\"env\":[],\"cwd\":\"outside\"},\"init\":{\"requests\":2,\"config\":\"\",\"status\":\"\",\"verified\":false}}'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-refuse-shell-syntax-errors__validate.js --control '{\"requests\":1,\"verified\":true}' '{\"requests\":2,\"verified\":false}'","exit":1,"output":"rejected\n"}]}
