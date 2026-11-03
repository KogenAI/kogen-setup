# Bound init commands with a timeout

Slug: k-setup-command-timeout
Model: not applicable — wire the existing synchronous sys timeout result into command filtering without a new persistent state machine
Acceptance:
- .kogen/intents/k-setup-command-timeout/acceptance.feature
- features/steps/command_timeout.js

Bound every setup, check and fixer executed by initExec in setup/init.go, whether detected or proposed, using sys.Options.Timeout. Introduce one named constant initCommandTimeout = 10 * time.Minute, with no new flag or configuration. Tests lower this constant only in a disposable source copy to one second. Keep Env and KillGroupOnExit behavior. Classify Result.TimedOut before exit status, including a timeout whose termination handler exits successfully. A normal timeout is an omitted command, not an Init error: continue and write/commit configuration as before. Preserve genuine execution errors.

For each timed-out command, report `<name> (<command>) timed out after <limit>` in Left out:, using a concise duration (10m at the production default, 1s at the seam), not failed-with-status wording. Second-run setup timeout may retain existing not-repeatable context but must name the timeout and limit. Show its captured output tail on stderr with existing formatting and truncation. A first-run setup timeout must not get a second run. Timeout applies independently to both setup runs, checks and fixers. Preserve successful-command stdout, configuration formats, ordinary failures and exit codes. Process groups must be gone after timeout, through existing sys custody rather than a new process supervisor.

## Decisions
- Fixed ten-minute per-command limit, one constant, no flag; timeout omits and continues with diagnostic output (source: request).

## Source comparison
- Addressed: request k-setup-command-timeout, owning setup/init.go/initExec and all initVerify command categories: outcome above and scenarios below replace unbounded execution and status-only failure classification.
- Addressed: supplied README-only reproducer with setup `sleep 30`, slow `echo before; sleep 30`, good `true`, fixer `sleep 30`: first scenario preserves literal inputs, expected status 0, omitted names, stderr tail, one setup run, retained good only and no live groups.
- Addressed: requested inside-limit counterexample: second scenario keeps setup, check and fixer running `sleep 0.8` at a one-second seam. Third covers second-run setup timeout.
- Addressed: configuration/exit/stdout compatibility and no new flag: existing suites remain required; acceptance inspects real Init output and parsed written configuration, not invented test names.
- Omitted: none of the requested product behavior. No changes to provider transport, Build verifier limits or public Init interface are intended. The new constant name is the technical test seam, not an additional user option.

## Tests
- Bound each command category and continue after timeout, retaining only passing commands: README-only real Init fixture (regression).
- Emit timeout wording and output tail, skip timed-out setup retry, and leave no live groups: captured Init output and OS group observations (scenario).
- Keep commands completing just inside the limit unchanged: one-second seam with 0.8-second setup/check/fixer (integration).
- Bound setup second run as well as first: marker-conditioned setup command (regression).
- Classify TimedOut before status including a TERM handler exiting zero: add a focused init verification regression during implementation (regression).
- Preserve ordinary failures, successful stdout/configuration and exit semantics: existing setup and contract suites (existing).

## Feasibility
- Local dependency inspection found sys.Options.Timeout and Result.TimedOut in pinned kogen-loop/sys; timeout waits for group disappearance and returns captured output. Existing harness build/run succeeded with check good=true and exit 0 (probe: exit 0, 0.8 s). An initial guessed module lookup found no kogen-sys module; actual imports resolved kogen-loop/sys. An attempted probe of privately retained proposal bytes could not access them in the scratch copy and supplies no control evidence.
- evidence: {"id":"timeout-observer","kind":"observer","inputs":["features/steps/command_timeout.js"],"observers":["features/steps/command_timeout.js"],"checks":[{"name":"good","command":"node features/steps/command_timeout.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/command_timeout.js --control bad","exit":1,"output":"rejected\n"}]}
