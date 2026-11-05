# Refuse fix commands that ignore their own failure

Slug: k-setup-fix-masks-failure
Model: not applicable — one more stateless lexical rule in Validate's fix loop; verification, merging and the correction round are unchanged
Acceptance:
- .kogen/intents/k-setup-fix-masks-failure/acceptance.feature
- features/steps/k-setup-fix-masks-failure__validate.js

Today `Validate` in `setup/init.go` applies the existing recognizer `initMasksFailure` to checks (`check <name> (<run>) ignores its own failure`) and to setup commands (`setup command <command> ignores its own failure`), but its fix loop never calls it. A fix such as `gofmt -w . || true` therefore passes Validate; Init verifies fix commands by exit status alone, so a fixer that fails every time is kept as passed, written to `.kogen/project.yaml` and later reported as having run successfully. (Observed on the unchanged tree: `Validate({"fix":["gofmt -w . || true"]}, ...)` returns no problems and a proposal whose Fix is `["gofmt -w . || true"]`.)

After this change, Validate's fix loop (`for i, command := range fix` in `Validate`) also calls `initMasksFailure(command)` — the same function, unchanged, that setup and checks use — and for each fix entry it recognizes appends exactly this problem, naming the full submitted command:

`fix command <command> ignores its own failure`

for example `fix command gofmt -w . || true ignores its own failure`. Like any other problem, it makes Validate return the zero `InitProposal{}` with the accumulated problem list, so Init's existing correction round reports it to the model. Placement mirrors the setup loop: the call sits after the `initRunsNothing` check and is independent of it (not `else if`), and it is skipped for entries already rejected earlier in the loop by the credential-literal or control-character branches (which `continue`). Each entry is judged separately, so in a list with several fix commands only the masking entry is named.

Unchanged: `initMasksFailure` itself (which tails count as masking: unquoted `|| true`, `|| :`, `|| exit 0`, `; true`, `; :`, `; exit 0`, and a trailing `&`), the check and setup wording and rules, every other fix refusal, fix commands that do not mask failure, Init's verification of fix commands, and the configuration written for valid proposals.

## Decisions
- The refusal wording is `fix command <command> ignores its own failure`, the same shape as the setup wording. (source: request)
- Fix commands are judged by the existing `initMasksFailure` recognizer used for setup and checks; no new or fix-specific masking forms. (source: request)
- A fix command that both runs nothing and masks failure (for example `printf ok; true`) reports both problems, as the setup list already does for the same command, because a fix is judged the way the other two lists are. (source: request)

## Source comparison
- Addressed: Problem/Need — fix `gofmt -w . || true` is refused with `fix command gofmt -w . || true ignores its own failure` and a zero proposal (acceptance scenario "Refuse a fix command that ignores its own failure").
- Addressed: Need "the same recognition already used for setup and checks" — the other recognized tails `; true`, `|| :`, `|| exit 0` and trailing `&` on `gofmt -w .` are refused with the same wording (outline "Refuse the other recognized masking tails"); real recovery `gofmt -w . || (echo failed; exit 1)` stays accepted.
- Addressed: synthetic acceptance fix `gofmt -w .` accepted as before, with the returned fix list `["gofmt -w ."]` unchanged (written configuration for valid proposals unchanged).
- Addressed: the same masking command as a check (`check format (gofmt -w . || true) ignores its own failure`) and as a setup command (`setup command gofmt -w . || true ignores its own failure`) keeps its existing wording.
- Addressed: several fix entries `gofmt -w .`, `gofmt -w . || true`, `mkdir -p tmp` — only the masking entry is named.
- Addressed: "Existing init tests stay green" — all existing setup tests keep passing except the expectations that encode the replaced behavior, which the Build updates (see Superseded).
- Superseded (code now): `setup/init_test.go` `TestInitValidateFailureMasks` ends by asserting that fix `false || true` has no problems; it must instead expect `["fix command false || true ignores its own failure"]`. `TestInitValidateSetupFixRunsNothing` expects fix `printf ok; true` to report only `runs nothing`; it must also expect `fix command printf ok; true ignores its own failure` after it, as it already does for setup.
- Superseded (historical acceptance of earlier completed Intents, not edited by this Build): `.kogen/intents/k-setup-setup-masks-failure/acceptance.feature` "Preserve fix acceptance" (fix `npm ci || true` accepted), `.kogen/intents/k-setup-check-masks-failure/acceptance.feature` row `false; true | fix | none`, and `.kogen/intents/k-setup-setup-fix-run-nothing/acceptance.feature` row `fix | printf ok; true` (only `runs nothing`) describe the replaced fix behavior. This request supersedes them; their files belong to those Intents and stay unchanged.
- Omitted: no change to Init's verification of fix commands, to merging, to the init prompt or tool definition, or to the golden files.

## Tests
- A fix command recognized by `initMasksFailure` is refused with `fix command <command> ignores its own failure` and a zero proposal: update the fix assertion in `TestInitValidateFailureMasks` to expect that problem for `false || true`, and add fix cases for `gofmt -w . || true`, `gofmt -w .; true`, `gofmt -w . || :`, `gofmt -w . || exit 0` and `gofmt -w . &` (regression).
- A fix command that does not mask failure stays accepted with its fix list unchanged: Validate cases for `gofmt -w .` and `gofmt -w . || (echo failed; exit 1)` (unit).
- Only the masking entry among several fix entries is named: Validate case for fix `gofmt -w .`, `gofmt -w . || true`, `mkdir -p tmp` (unit).
- Runs-nothing and masking problems accumulate for fix as for setup: update `TestInitValidateSetupFixRunsNothing` to expect `fix command printf ok; true ignores its own failure` after the runs-nothing problem (unit).
- Check and setup masking wording is unchanged: existing `TestInitValidateFailureMasks` check cases and `TestInitValidateSetupFailureMasks` (existing).
- Other init behavior is unchanged: the configured checks and `go build ./... && go vet ./... && go test -race -count=1 ./...` (existing).

## Feasibility
- Unchanged-tree Validate on the fixture proposals (scratch copy of HEAD, `setup.Validate` with `InitContext{Root:"/fixture",Tracked:["README.md"]}`): fix `gofmt -w . || true`, `; true`, `|| :`, `|| exit 0`, `&`, real recovery and the three-entry list all return no problems with Fix unchanged; setup `gofmt -w . || true` returns `setup command gofmt -w . || true ignores its own failure`; check `format` returns `check format (gofmt -w . || true) ignores its own failure`; fix `printf ok; true` returns only `fix command printf ok; true runs nothing`.
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-setup-fix-masks-failure__validate.js"],"observers":["features/steps/k-setup-fix-masks-failure__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-masks-failure__validate.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-fix-masks-failure__validate.js bad","exit":1,"output":"rejected\n"}]}
