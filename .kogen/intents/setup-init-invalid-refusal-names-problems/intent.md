# Show the reasons when init refuses twice

Slug: setup-init-invalid-refusal-names-problems
Model: not applicable — the change builds one error value from the reasons of the last answer; it has no state to model
Acceptance:
- .kogen/intents/setup-init-invalid-refusal-names-problems/acceptance.feature
- features/steps/setup-init-invalid-refusal-names-problems__driver.js

When the shaping model fails twice to return a valid configuration, `kogen init` ends with `provider/init_invalid: the model did not return a valid configuration; nothing was written` and no reasons. Today the refusal is built with `sys.Fail("provider", "init_invalid", "the model did not return a valid configuration; nothing was written", 4)`, which has no detail lines, in `initConverse` (setup/init.go, at `attempt == 2`, ignoring the `problems` of the answer it just validated) and in `initClaudeConverse` (setup/init_route.go, after the loop, where the problems only went into `feedback`; a missing or non-object structured answer gives `feedback` the text `Answer with a valid configuration.` and no problems). `Validate` returns its problems as plain sentences, for example `setup must be a list` (from `initStrings`). The same run prints the progress line `kogen: init gpt-6.1-sol/high input=200 cached=0 output=40 reasoning=10 wall_ms=` (the wall time varies) right before the refusal, so the user knows the model answered but not why the answer was refused.

This change makes the refusal carry the reasons of the last rejected answer as detail lines (`Lines` of the `*sys.Error`, which `se.Render()` in cmd/kogen-setup/main.go prints as two-space-indented lines), on both routes that ask the model: the provider route and the claude-code route.

One helper in the setup package, `initInvalidError(problems []string) *sys.Error`, builds the refusal for both routes. It returns class `provider`, reason `init_invalid`, exit 4 and the existing `Detail` text unchanged. Its `Lines`:

- When the last answer was validated and rejected, one line per problem of that last answer, in the order Validate returned them, each exactly as Validate wrote it. Problems of the first answer are not shown when the last answer has its own.
- When the last answer called no `submit_configuration` (provider route) or gave no structured object (claude-code route), the helper receives no problems and `Lines` is exactly one line: `the last answer did not call submit_configuration`. Reasons of an earlier answer are not shown then.
- At most five problem lines are shown. With more, `Lines` holds the first five problems and then one line `and ` + the number left over + ` more problems` (`and 1 more problem` for one left over). With seven problems `problem 1` to `problem 7`, `Lines` is `problem 1` to `problem 5` and `and 2 more problems`; with six it ends with `and 1 more problem`.

Unchanged: `Detail`, class, reason and exit code 4; nothing is written; two requests are sent; the correction sent back to the model; Validate, its wording and its checks; the success path. No new flag, setting or environment variable. No change to kogen-loop's `sys` package, the executor or the provider client. Existing tests change only if they compared the whole error and now see its `Lines`.

The Build also adds focused, model-free Go tests in `setup/init_invalid_lines_test.go`, using the existing fixtures `initNewFx`, `initSubmit`, `initAnswerText`, `f.write`, `f.commitAll` and `f.wantError("provider", "init_invalid", 4)`: `TestInitInvalidLinesNamesTheRejectedReason`, `TestInitInvalidLinesShowsOnlyTheLastAnswer`, `TestInitInvalidLinesNoCallInTheLastAnswer` and `TestInitInvalidLinesBoundsTheList`. The acceptance feature does not depend on them: its step copies the setup package to a scratch directory and adds its own driver test there.

## Decisions
- One helper `initInvalidError(problems []string) *sys.Error` in the setup package builds the refusal for both routes, with an empty problem list meaning the last answer had no call, because Validate never returns an empty list for a rejected answer (evidence: setup/init.go; setup/init_route.go) (source: request)
- The provider route keeps `problems` scoped to the current attempt, and the claude-code route resets its problem list at the start of each round, so only the last answer's reasons are shown (evidence: setup/init.go; setup/init_route.go) (source: request)
- Five problem lines are shown at most, as a constant, followed by `and N more problems` / `and 1 more problem`; no setting (source: request)
- Acceptance drives the real init run through the scripted provider fixtures with a driver Go test the step writes into a scratch copy, so it never relies on test names the Build invents; the claude-code route is covered by the shared helper only, since no claude-code run is allowed (evidence: setup/init_test.go) (source: request)
- One helper initInvalidError(problems) builds the refusal for both routes; empty problems means no call (decision: D1, round 1) (constraint: Detail, class provider, reason init_invalid, exit 4 unchanged) (constraint: at most five problem lines then 'and N more problem(s)') (evidence: setup/init.go; setup/init_route.go) (assumption: The scratch copy ran the acceptance feature with cucumber: all 5 scenarios passed on the correct overlay and each wrong overlay failed its scenario. The claude-code route was only compiled, not run.) (source: request)

## Source comparison
- Refusal carries the reasons of the last rejected answer on both routes: addressed by `initInvalidError` and scenarios 1 and 2.
- No call or no structured object: single line `the last answer did not call submit_configuration`: addressed by scenario 3.
- Bound of five lines and the leftover count (`problem 1` to `problem 7`): addressed by scenarios 4 and 5.
- Detail, class, reason, exit 4, two requests, nothing written, correction sent to the model, Validate: unchanged; the driver test checks the detail, nothing written, HEAD and two requests on each run.
- setup/init_test.go TestInitTwoInvalidAnswersEndWithNothingWritten pins `Detail`, not `Lines`: it stays valid.

## Tests
- The reason of a rejected last answer is shown (expected 1, 2): TestInitInvalidLinesNamesTheRejectedReason in setup/init_invalid_lines_test.go, the same invalid answer twice gives `Lines` `setup must be a list` (integration)
- Only the last answer's reasons are shown (expected 2): TestInitInvalidLinesShowsOnlyTheLastAnswer, first answer `setup` invalid and second answer `fix` invalid gives `fix must be a list` (integration)
- An answer without the call says so (expected 3): TestInitInvalidLinesNoCallInTheLastAnswer, an invalid answer then a text answer gives the single no-call line (integration)
- A long list of problems is bounded (expected 4): TestInitInvalidLinesBoundsTheList, `initInvalidError` with seven problems and with six (unit)
- Detail, exit code, writes and request count are unchanged: TestInitTwoInvalidAnswersEndWithNothingWritten (existing)

## Feasibility
- none
