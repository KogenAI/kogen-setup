# Refuse long-running fix commands

Slug: k-setup-fix-long-running
Model: not applicable — one more stateless lexical rule in Validate; the existing single correction round is unchanged
Acceptance:
- .kogen/intents/k-setup-fix-long-running/acceptance.feature
- features/steps/k-setup-fix-long-running__validate.js

Today `Validate` in `setup/init.go` applies `initLongRunning` to setup commands and checks only. A proposed fix command that never exits on its own (a watcher, a dev server) passes Validate. Init then runs it during verification, waits up to the per-command limit (`initCommandTimeout`, 10 minutes) and leaves it out. Every retry waits the same way, and the model is never told what was wrong.

After this change, Validate's fix loop also calls `initLongRunning(command)`. A fix command it recognises adds this problem, which names the full submitted command:

`fix command <command> does not exit on its own (watch or server mode); use a command that runs once`

It uses the same wording as the setup problem, with `fix command` in place of `setup command`. Put the check in the fix loop after the "changes the repository state" check and before the "publishes or deploys" check, as the setup loop does. Fix entries that are already skipped (a credential literal, a control character) stay skipped. The problem goes back to the model through the existing single correction round (`invalid: ` followed by the problems joined with `; `), before anything runs, so the refused command never runs.

Boundaries:
- `initLongRunning` itself does not change: use only the patterns it already recognises and add none. For example, `prettier --watch .` is not one of those patterns, so it still gives no long-running problem in fix, setup or checks.
- Setup and check problems, their wording and their order do not change.
- `initCommandTimeout`, the verification order, the fix run-once policy and the number of correction rounds do not change.
- The prompt (`setup/prompts/init.md`), the tool definition and their golden files do not change.

This replaces one existing behavior. `TestInitValidateLongRunning` in `setup/init_long_running_test.go` currently expects `"fix": ["npm run dev"]` to give no problem. Update that test so it expects the new fix problem after the setup problem. The earlier Intent `k-setup-refuse-long-running-commands` said to keep fix unaffected. This request supersedes that rule.

## Decisions
- The fix problem text is exactly `fix command <command> does not exit on its own (watch or server mode); use a command that runs once`. It names the full submitted command, matching the setup wording. (source: request)
- Fix commands are matched only by the patterns `initLongRunning` already recognises. No new patterns are added, so `prettier --watch .` stays unrecognised. (source: request)
- Setup and check behavior does not change. (source: request)

## Source comparison
- Addressed: Need, "Validate applies initLongRunning to fix commands with the problem `fix command <command> does not exit on its own (watch or server mode); use a command that runs once`". Covered by the acceptance scenarios "A watch-mode fix is refused…", the outline "Fix commands that initLongRunning already recognises…" and the first Tests line.
- Addressed with a substitution: the request's example `prettier --watch .` is not recognised by the existing `initLongRunning` patterns, and the request forbids new patterns. It allows "any pattern initLongRunning already recognises", so the acceptance uses `tsc --watch`, plus `npx jest --watch`, `npm run dev`, `mix phx.server`, `echo ok && npm start` and `sleep 2m` in the outline. The corrected one-shot fix stays the request's literal `prettier --write .`.
- Addressed: "The recognised patterns are the existing ones; no new patterns are added". Covered by the scenario "No new patterns: prettier --watch stays unrecognised in fix, setup and checks". There, `prettier --watch .` in fix, setup and a check gives no problem, while `tsc --watch` in the same fix list is refused.
- Addressed: "fix `[\"prettier --write .\"]` yields no such problem". Covered by the scenario "A watch-mode fix is refused while the one-shot prettier --write fix is accepted", which expects exactly one problem, and that problem names only the watch command.
- Addressed: "the same command in setup and in checks still yields its existing problem text". Covered by the scenario "Setup and checks keep their existing problem text…", which expects the check, setup and fix problems in order.
- Addressed: the init run with a fake model. A loopback model first proposes fix `tsc --watch`, then `prettier --write .`. The step checks that the second request carries `invalid: fix command tsc --watch does not exit on its own (watch or server mode); use a command that runs once`, that the written `.kogen/project.yaml` holds fix `prettier --write .`, that the watch stand-in never ran, that the one-shot fixer ran once, that the tree is clean and that Init took under 20 s. That is far below the 10-minute per-command limit. In the fixture, the `tsc` stand-in sleeps 40 s, so on the unchanged tree Init takes over 40 s, makes one request and keeps `tsc --watch` (observed).
- Addressed: "Existing init tests stay green". The final step runs `go test ./setup -count=1`. The one existing assertion that contradicts the request (fix `npm run dev` accepted) is updated, as described above.
- Superseded: the `k-setup-refuse-long-running-commands` rule "Keep fix unaffected", and its acceptance example that expects `"fix":["npm run dev"]` to give no problem.
- Omitted: no timeout change, process killing, prompt edit or new pattern, because the request asks for none.

## Tests
- A fix command recognised by initLongRunning gives `fix command <command> does not exit on its own (watch or server mode); use a command that runs once`: in `TestInitValidateLongRunning`, add fix cases for the existing patterns (for example `tsc --watch`, `npm run dev`) and change the final block's expectation for `"fix": ["npm run dev"]` to include the fix problem after the setup problem (unit)
- The one-shot fix `prettier --write .` gives no long-running problem: add it to the negative fix cases in `TestInitValidateLongRunning` (unit)
- No new patterns are added: add `prettier --watch .` to the negative cases in `TestInitValidateLongRunning`, for checks and for fix (unit)
- Setup and check commands keep their existing problem text: the existing setup and check cases in `TestInitValidateLongRunning` stay unchanged (existing)
- Init sends the fix problem back in the single correction round, never runs the refused fixer, and writes the corrected fix: add an init test modeled on `TestInitCorrectsLongRunningBeforeVerification`. The model first proposes a watch-mode fix that would touch a marker, then a one-shot corrected fix that exits 0. Assert that the second request contains the fix problem, that `f.config().Fix` holds the corrected fix and that the marker is absent (integration)
- All existing init behavior is preserved: `go build ./... && go vet ./... && go test -race -count=1 ./...` (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-fix-long-running__validate.js"],"observers":["features/steps/k-setup-fix-long-running__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-long-running__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-long-running__validate.js --control bad","exit":1,"output":"rejected\n"}]}
