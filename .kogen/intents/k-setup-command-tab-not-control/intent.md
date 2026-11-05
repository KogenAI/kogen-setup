# Accept tabs inside setup, fix and check commands

Slug: k-setup-command-tab-not-control
Model: not applicable — stateless validation of one proposal's command strings and their diagnostic wording
Acceptance:
- .kogen/intents/k-setup-command-tab-not-control/acceptance.feature
- features/steps/k-setup-command-tab-not-control__validate.js

Today `setup.Validate` (setup/init.go) refuses every proposed setup, fix and check command that contains a character for which `unicode.IsControl` is true, with `setup entry <n> command <%q> contains a control character; put one command per entry` (and the `fix entry <n> …` and `check <name> command <%q> …` forms). `unicode.IsControl` is true for the horizontal tab (U+0009). So a legitimate one-line command with a tab, for example the check `cols` with run `printf 'a<TAB>b\n' | cut -f2` (a real tab between `a` and `b`, and the two characters backslash and `n`), is refused with advice that does not apply. The rule is meant to catch line breaks and non-printing bytes that start a second command or break the YAML.

After the change, the horizontal tab no longer counts as a control character for proposed commands. Every other `unicode.IsControl` character still does, including LF, CR, BEL (0x07) and DEL (0x7f). In setup/init.go this applies to the following places, all of which use one predicate meaning "a control character other than the horizontal tab":
- the check-command refusal in Validate;
- the setup-command refusal in Validate, and the setup machine-prerequisite gate next to it (`(!<has control> || contains "\n") && initMachinePrerequisite(command)`);
- the fix-command refusal in Validate;
- the emptiness tests in `initStrings` (`strings.TrimSpace(str) == "" && !<has control>`) and `initChecks` (`strings.TrimSpace(run) == "" && !<has control>`).

As a result:
- A command with a tab and no other control character is no longer refused for that reason. It goes through every other existing rule (credential literal, runs nothing, machine prerequisite, tests in setup, names the root, leaves the project, repository state, long running, publishes, masks failure, unset variables, shell syntax) exactly as a command without the tab would. Example: setup `npm install -g x<TAB>` is now refused only as `setup command npm install -g x<TAB> is a one-time machine prerequisite, not recurring project setup`, with the raw tab in the message.
- A command that contains LF, CR or another non-tab control character is refused exactly as before. The wording is unchanged, the command is shown with Go `%q`, and the problems come in the same order.
- A command made only of whitespace (spaces and tabs, e.g. a single tab) is refused as empty: `setup must be a list of non-empty commands`, `fix must be a list of non-empty commands`, or `check <name> has no command`. `initStrings` also parses `protect`, so a protect entry made only of spaces and tabs now gets `protect must be a list of non-empty commands`. That follows from the shared rule and is not tested separately. A whitespace-only command that contains LF, CR or another non-tab control character (e.g. `\n` alone, `\r` alone) keeps today's control-character refusal.
- Check names are not affected. `initCheckNameRE` still refuses a tab in a name. The refused name is still quoted when it contains any `unicode.IsControl` character, tab included: `check name "lint\t" must be lowercase letters, digits and dashes`.
- The written configuration is unchanged in format. `project.RenderConfig` (kogen-coordinator, used through `initRenderConfig`) already writes commands as single-quoted YAML scalars with the raw tab inside. `project.LoadConfig` reads them back byte for byte. No rendering change is needed or allowed.

No prompt, tool definition, golden file, contract item or configuration format changes.

## Decisions
- A horizontal tab inside a setup, fix or check command is not by itself a control-character problem. Newlines, carriage returns and other non-printing control characters are still refused with the existing wording. (source: request)
- A command made only of whitespace, including tabs, is refused as empty with `has no command` for checks and `must be a list of non-empty commands` for lists. (source: request)
- Whitespace-only commands that contain a newline, carriage return or other non-tab control character keep their current control-character refusal. The request asks that those characters stay refused with the existing wording, and only tabs move to the empty rule. (source: request)
- The written configuration keeps the tab intact and reads back unchanged. (source: request)

## Source comparison
- Addressed: request Problem/Need, "a tab inside a setup, fix or check command is not by itself a control-character problem". The predicate change in Validate is covered by acceptance scenarios for check `cols`, setup `mix<TAB>deps.get` and fix `mix<TAB>format`.
- Addressed: synthetic "check `cols` with run `printf 'a<TAB>b\n' | cut -f2`: accepted, written, and read back byte for byte equal". Validate accepts it, and Init on a synthetic repository commits `.kogen/project.yaml` containing the line `      run: 'printf ''a<TAB>b\n'' | cut -f2'`. `project.LoadConfig` returns the identical run string. Observed on a scratch-fixed copy: exit 0, one model request, `Checks: cols`. On the unchanged tree: exit 4 with `provider/refused: ChatGPT refused the request: 400 no scripted reply` after the retry.
- Addressed: synthetic "setup command containing a newline between two commands: still refused as before". `set -e<LF>npm ci` gives exactly `setup entry 1 command "set -e\nnpm ci" contains a control character; put one command per entry`.
- Addressed: synthetic "command containing a carriage return or a bell (0x07): still refused". Covered for setup, fix and check, with the current exact wording (`\r` and `\a` in the `%q` form).
- Addressed: synthetic "a setup entry consisting of a single tab: refused as empty". The result is `setup must be a list of non-empty commands`, the same for a fix entry with `fix must be a list of non-empty commands` and for a check run with `check cols has no command`, and also for ` <TAB> `.
- Addressed with a conflict: "existing init tests stay green". Two existing tests assert the old tab refusal, which this request replaces. `TestValidateCommandControls` (setup/init_integrity_test.go) has the cases `checks mix<TAB>test`, `fix mix format<TAB>` and `fix <TAB>`. `TestValidateSetupControlCharacters` (setup/init_machine_prerequisite_test.go) has `npm install -g x<TAB>`. Those cases are updated to the new behavior. All other init tests stay unchanged and green.
- Superseded: the earlier Intent k-setup-written-config-matches-verified listed TAB among refused control characters. Its step file features/steps/k-setup-written-config-matches-verified__roundtrip.js still embeds tab-refusal cases. It is not part of this Intent's acceptance or the configured checks, and it is already stale: it calls `initRenderConfig` with two arguments, but the function takes one. It is left unchanged.
- Preserved: the check-name rule and its quoting for names with control characters, including a tab, from k-setup-check-name-trailing-newline.

## Tests
- A tab inside a check command is accepted (the reported failure): update TestValidateCommandControls in setup/init_integrity_test.go so check `cols` / `printf 'a\tb\\n' | cut -f2` gives no problems and is proposed unchanged, plus the acceptance scenario (regression)
- Tabs inside setup and fix commands are accepted: same test with setup `mix\tdeps.get` and fix `mix\tformat` instead of the removed tab-refusal cases, plus the acceptance scenario (unit)
- An accepted tab command is written and read back byte for byte: an Init integration test with initNewFx/initSubmit proposing check `cols`, asserting exit 0 and that `project.LoadConfig` returns the identical run, plus the acceptance scenario through setup.Init (integration)
- Newline, carriage return and other control characters (BEL, DEL) are still refused with the existing wording: the remaining TestValidateCommandControls cases and TestCheckInstallsDependencies's `npm test\nnpm ci` case, plus a BEL case and the acceptance scenarios (unit)
- A whitespace-only command with tabs is refused as empty: in TestValidateCommandControls and TestValidateSetupControlCharacters, single-tab setup, fix and check entries give `setup must be a list of non-empty commands`, `fix must be a list of non-empty commands` and `check test has no command` (unit)
- A tabbed command is judged by the other rules: update TestValidateSetupControlCharacters so `npm install -g x\t` gives only the one-time machine prerequisite problem (unit)
- Whitespace-only commands with a newline or carriage return keep the control-character refusal, and a tab in a check name stays refused and quoted: existing TestValidateCommandControls `\n`/`\r` cases and TestInitValidateShapes "tab name", plus acceptance scenarios (existing)

## Feasibility
- Observed on the unchanged tree with a temporary Validate driver built from the repository root: every tab case (check `cols`, setup `mix\tdeps.get`, fix `mix\tformat`, single tab, ` \t `, `npm install -g x\t`) is refused with the control-character wording. The LF, CR and BEL cases give the exact wording used in acceptance.
- Observed on a scratch copy where only the tab was excluded from that predicate in setup/init.go: the tab cases give the acceptance outcomes (accepted; `setup must be a list of non-empty commands`, `fix must be a list of non-empty commands`, `check cols has no command`; the machine prerequisite problem), and the LF, CR and BEL cases are unchanged.
- Observed: `project.RenderConfig` single-quotes `printf 'a\tb\\n' | cut -f2` as `'printf ''a<TAB>b\n'' | cut -f2'`, and `project.LoadConfig` returns it unchanged. No rendering change is needed.
- Observed: the embedded Init driver (loopback model, synthetic README-only repository) built with `go build` from the repository root gives exit 4, 2 requests and no config on the unchanged tree. On the scratch-fixed copy it gives exit 0, 1 request, `Checks: cols` and the read-back check `cols`.
- evidence: {"id":"tab-observer","kind":"observer","inputs":["features/steps/k-setup-command-tab-not-control__validate.js"],"observers":["features/steps/k-setup-command-tab-not-control__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-command-tab-not-control__validate.js --control '[\"setup must be a list of non-empty commands\"]' '[\"setup must be a list of non-empty commands\"]'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-command-tab-not-control__validate.js --control '[]' '[\"setup must be a list of non-empty commands\"]'","exit":1,"output":"rejected\n"}]}
