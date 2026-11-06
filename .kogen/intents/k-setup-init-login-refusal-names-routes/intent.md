# Name the sign-in routes when init has no login

Slug: k-setup-init-login-refusal-names-routes
Model: not applicable — one refusal gains fixed detail lines and the standalone command prints them; there is no state or interacting rule to model
Acceptance:
- .kogen/intents/k-setup-init-login-refusal-names-routes/acceptance.feature
- features/steps/k-setup-init-login-refusal-names-routes__refusal.js

Today `kogen init` refuses with `provider/login: not signed in; run kogen provider login for a supported provider` (exit 4) when no provider is signed in. This refusal comes from `initSelectRoute` (setup/init_route.go line 44) when it finds no usable route and no saved OpenAI-compatible key. The refusal names no provider and no command that can be copied. An unattended agent reads "login" as the browser-based ChatGPT step and stops. Yet the Anthropic API key route and the Claude Code token route both read a secret from standard input. The sibling refusals already name the command (for example `run kogen provider login anthropic`).

What changes:
- **The refusal in `initSelectRoute`.**
  - It keeps Class `provider`, Reason `login`, Exit 4 and its Detail byte for byte: `not signed in; run kogen provider login for a supported provider`. So `err.Error()`, the first line, stays `provider/login: not signed in; run kogen provider login for a supported provider`.
  - It gains detail lines in `sys.Error`'s `Lines` field. `Render()` prints them under the first line, each indented by two spaces, and other refusals in Kogen already carry their detail lines this way (evidence: pinned kogen-loop sys/error.go `Lines` and `Render()`; kogen-coordinator project/config.go and git/commit.go set `Lines`).
  - The lines are exactly these five, in this order (assumption: the user confirms the label wording and the variable name `CLAUDE_CODE_OAUTH_TOKEN`):
    1. `browser sign-in: kogen provider login chatgpt`
    2. `no browser, Anthropic API key on standard input: printf '%s' "$ANTHROPIC_API_KEY" | kogen provider login anthropic`
    3. `no browser, Claude Code token on standard input: printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" | kogen provider login claude-code`
    4. `kogen provider --help lists every route`
    5. `with anthropic or claude-code, init then needs the configuration-first files described in docs/getting-started.md ("Without ChatGPT")`
  - With those lines, `Render()` of the refusal is the following six lines (evidence: sys/error.go `Render()` writes `Error()` and then each line indented by two spaces) (assumption: the user confirms the label wording above):
    ```
    provider/login: not signed in; run kogen provider login for a supported provider
      browser sign-in: kogen provider login chatgpt
      no browser, Anthropic API key on standard input: printf '%s' "$ANTHROPIC_API_KEY" | kogen provider login anthropic
      no browser, Claude Code token on standard input: printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" | kogen provider login claude-code
      kogen provider --help lists every route
      with anthropic or claude-code, init then needs the configuration-first files described in docs/getting-started.md ("Without ChatGPT")
    ```
  - The lines are fixed text. `$ANTHROPIC_API_KEY` and `$CLAUDE_CODE_OAUTH_TOKEN` are literal characters, not expanded. Nothing reads environment variables or stored credentials to build the lines, so no output contains a secret value.
- **The standalone `cmd/kogen-setup`.**
  - When Init returns an error, the command writes to stderr the `sys.Error`'s `Render()`, found with `sys.AsError`: the error line plus its indented detail lines. This is the repository's entry point to Init, and today it prints only `err.Error()`, so the requested lines would be invisible there (evidence: cmd/kogen-setup/main.go `fmt.Fprintln(os.Stderr, err)`; README "Standalone developer entry point").
  - An error that is not a `sys.Error` is written as before, `err.Error()` and a newline (evidence: cmd/kogen-setup/main.go).
  - The JSON `error` field on stdout stays `err.Error()`, so for this refusal it is the unchanged first line only. That keeps existing readers of the first line working (evidence: README documents `error` as "the error string"; cmd/kogen-setup/main.go sets it from `err.Error()`).
  - The JSON `exit` and the process exit code stay 4.
  - The README's standalone paragraph says that any error goes to stderr with its indented detail lines.

Unchanged:
- The OpenAI-compatible refusal keeps its text and gets no lines. It is a different refusal with its own text, which the request does not quote (evidence: setup/init_route.go lines 39-42).
- The refusal still creates no `.kogen`, makes no provider request and leaves a clean status with no new commit (evidence: setup/init_test.go `TestInitWithoutLoginWritesNothing`).
- Every other refusal, route selection and the successful paths stay as they are. With a saved ChatGPT login, Init proceeds as before (evidence: setup/init_test.go `TestInitConfiguresAProjectWithoutChecksAndAddsTheBridge` prints `Initialized Kogen in` after one model request). It prints none of these lines.

## Decisions
- The refusal keeps class `provider/login`, exit 4 and its first line byte for byte, and adds the routes as separate lines after it. (source: request)
- The lines come in this order: the browser route `kogen provider login chatgpt`; the two standard-input routes in the exact piped form, `printf '%s' "$ANTHROPIC_API_KEY" | kogen provider login anthropic` and the same for `claude-code`; the line `kogen provider --help lists every route`; and, for the non-ChatGPT routes, the pointer to the configuration-first files in `docs/getting-started.md` ("Without ChatGPT"). (source: request)
- The label wording of each line is `browser sign-in:`, `no browser, ... on standard input:` and `with anthropic or claude-code, init then needs ...`. The Claude Code piped form reads `"$CLAUDE_CODE_OAUTH_TOKEN"`. (assumption: the user confirms this label wording and the variable name CLAUDE_CODE_OAUTH_TOKEN for "the same for claude-code") (source: request)
- The added lines are the `sys.Error` detail lines (`Lines`), which `Render()` indents by two spaces under the unchanged first line. (evidence: kogen-loop sys/error.go `Render()`; kogen-coordinator project/config.go and git/commit.go use `Lines` for detail) (source: request)

## Source comparison
- Addressed: "the refusal keeps its class, reason and exit code (`provider/login`, exit 4)" and "The existing first line stays byte-identical". Detail, Class, Reason and Exit are unchanged. Scenario 1 asserts the JSON `error`, the JSON `exit` and the process exit.
- Addressed: the routes as concrete lines with the exact piped form, the `kogen provider --help lists every route` line and the "Without ChatGPT" pointer. Scenario 1 asserts the exact consecutive stderr lines; the Go test asserts `Lines` exactly.
- Addressed: "Nothing in the text contains a secret value" and "No output line contains the value of an environment variable or a stored credential".
  - Both scenarios set `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` to fixture values.
  - Scenario 2 also saves a ChatGPT login with fixture tokens.
  - Both assert that none of those values appears on stdout or stderr.
- Addressed: "The same refusal under a home with a saved ChatGPT login is not produced (init proceeds as before)".
  - Scenario 2 runs the same standalone command with a saved ChatGPT login and a local scripted provider that answers with an empty proposal.
  - "As before" is observed as the existing success outcome: exit 0, one provider request, an `Initialized Kogen in` line, a written configuration and a new commit (evidence: setup/init_test.go success tests; features/steps/fix-k-setup-written-config-matches-verified__failed-write.js uses the same scripted provider and reaches the configuration write after one request).
  - It also asserts that the output contains none of `not signed in`, `kogen provider login` or `kogen provider --help`.
- Addressed: the request's acceptance runs `kogen init` in a clean home, in a Git repository with an identity and one commit.
  - This repository's entry point to Init is the README's standalone `kogen-setup` command, so the scenarios run that.
  - The assembled `kogen` reports a `sys.Error` through `Render()` (evidence: kogen features/steps/model_family_profiles_driver.go uses `se.Render()` as the message).
  - The standalone printed only `err.Error()`, so it now prints `Render()` to stderr.
- Preserved as requested, with an observation: the pointer says that init then needs the configuration-first files. The current `initSelectRoute` also accepts a saved Anthropic key or Claude Code token as a discovery route (evidence: setup/init_route.go lines 22-37). The request settles the copy, so the line is kept and not reworded.
- Omitted: the historical provider, Studio and cache notes in the testing rules concern unrelated systems.

## Tests
- The no-login refusal keeps Class `provider`, Reason `login`, Exit 4 and its Detail, and has exactly the five Lines in order: update `TestInitWithoutLoginWritesNothing` in setup/init_test.go to also assert that `e.Lines` equals the five strings and `e.Render()` equals the six-line rendering above. Keep its existing assertions (no `.kogen`, no request, clean status). (unit)
- The standalone command prints the refusal's detail lines on stderr, keeps the JSON `error` and exit, and leaks no environment value: acceptance scenario 1 runs the built `./cmd/kogen-setup` with an empty home. (scenario)
- A saved ChatGPT login still proceeds without the refusal and without leaking the saved tokens: acceptance scenario 2. (scenario)
- The class, reason and exit of the no-login case: the existing `not signed in` case in contract/exit_test.go. (existing)

## Feasibility
- Read, not probed:
  - The refusal is built in `initSelectRoute` (setup/init_route.go line 44) with `sys.Fail`.
  - `sys.Error` in the pinned kogen-loop (v0.0.0-20261104031734-708a69af07b8, sys/error.go) has `Lines []string`. Its `Render()` writes `Error()` and then each line indented by two spaces.
  - `cmd/kogen-setup/main.go` currently prints `fmt.Fprintln(os.Stderr, err)`, so the lines need the standalone change to show up there.
  - Environment variables do not count as a login: `provider.RequireLogin` reads only saved credentials. The fixture's `ANTHROPIC_API_KEY` therefore leaves the home without a login.
- evidence: {"id":"refusal-observer","kind":"observer","inputs":["features/steps/k-setup-init-login-refusal-names-routes__refusal.js"],"observers":["features/steps/k-setup-init-login-refusal-names-routes__refusal.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-init-login-refusal-names-routes__refusal.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-init-login-refusal-names-routes__refusal.js bad","exit":1,"output":"rejected\n"}]}
