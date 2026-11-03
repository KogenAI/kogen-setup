# Contract suite

This package is the contract of kogen-setup with its consumer, kogen. It pins exactly what kogen uses: the exported API it calls, the behaviours it relies on and the files and commit `kogen init` leaves in a project. It runs in kogen-setup's own fast gate, `go test ./...`, so an interface change fails here first, without the kogen repository.

An intended interface change edits this contract together with paired consumer items.

Run it with the rest of the module, or alone:

```sh
go test -race -count=1 ./contract/...
```

## What it is made of

- The cases are adapted from `setup/init_test.go` (moved from kogen-shaping `shape/init_test.go` at `e572010734c34b621773cd7f401bd08218931bac`) and from kogen's call site, `cli/engine.go` at `9bf6073f8096f5a50013fc42c482695742645ac8`: `setup.Init(s.Context(), s, setup.InitInput{Client: client, Tools: tools})`, with the exit code used only when the error is nil, and `exitFor` mapping the error (`*sys.Interrupted` to its signal code, `*sys.Error` to its `Exit`, anything else to 70).
- The fixtures are synthetic only: `t.TempDir()` roots, a Git repository, project files and fake `npm` and `node` programs written by the test, a HOME of the fixture's own with a fake ChatGPT login, and `sys.NewWith(env, dir)` sessions from `kogen-loop/sys`. Git runs with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, no inherited `GIT_*` or `KOGEN_*` variable, the identity `Fixture <fixture@example.invalid>`, an empty hooks folder of its own (`core.hooksPath`) and `commit.gpgsign false`. `TestMain` sets this up for the whole process.
- The model is a loopback provider: an `httptest` server on a free port, reached through `KOGEN_PROVIDER_URL` in the session's environment, that plays scripted streamed answers and records each request. No real model runs and nothing reaches the network.
- The suite imports only the standard library, `setup`, kogen-coordinator `project` and `durable`, kogen-executor `agent`, kogen-verification `verify` and kogen-loop `provider` and `sys`. It does not read kogen-setup's own sources or goldens, uses no fixed port and no shared path, has no `t.Skip`, no sleep and no build constraint, and passes with `-count=1`, `-trimpath` and `-race`.

## Behaviours and formats pinned

Each item is asserted so that changing it fails the suite.

- `init-signature`, `api_test.go`: `setup.Init` is `func(context.Context, *sys.Session, setup.InitInput) (int, error)`.
- `init-input`, `TestInitInputFields`: `InitInput` has the fields `Client *provider.Client`, `Tools verify.Tools` and `Home string`, in that order.
- `home-from-session`, `TestInitReadsTheLoginUnderTheSessionsHome`: with `Home` empty, as kogen leaves it, the login is read under the session's HOME.
- `exit-success`, `TestInitSucceedsWithExitZero`: exit 0 and a nil error for the first commit of an empty repository, a configured project, and a project already initialized (no commit, no request, the "already initialized" lines).
- `exit-sys-error`, `TestInitRefusalsAreSysErrorsWithTheirExit`: refusals are `*sys.Error`s and Init's exit is their `Exit`: `environment/not_a_git_repo` 3, `environment/git_identity_missing` 3, `environment/no_commits` 3, `environment/dirty_tree` 5, `environment/project_config_invalid` 3, `provider/login` 4, `provider/init_invalid` 4 (two answers without a valid call), `environment/commit_failed` 3. Nothing is committed.
- `exit-interrupt`, `TestInitInterruptsExitWithTheSignalsCode`: an interrupted session gives `*sys.Interrupted` with exit 130 (SIGINT), 143 (SIGTERM) or 129 (SIGHUP), also while the model request is in flight. Nothing is written.
- `exit-internal`, `TestInitInternalFailureIsExit70`: any other failure is exit 70 with an error that is neither a `*sys.Error` nor a `*sys.Interrupted`.
- `files-template` and `one-commit`, `TestInitFirstCommitOfAnEmptyRepository`: in a repository without commits, `.kogen/project.yaml` is `project.Template()`, `.gitignore` gains the `.kogen/local/` line after its existing content, and the first commit, "Initial commit", holds exactly those two files. No model is asked. The printed `Commit:` line names HEAD.
- `files-render-config`, `files-bridge` and `one-commit`, `TestInitWritesTheConfigurationAndTheBridgeInOneCommit`: `.kogen/project.yaml` is `project.RenderConfig` of the result, `.gitignore` gains the `.kogen/local/` line, the bridge adds `features/steps/README.md` with its one line, and exactly these three files are committed in one commit, "Add Kogen configuration", whose parent is the previous HEAD and whose author is the repository's identity. Other changes in the working tree stay uncommitted. The output lines are pinned.
- `files-render-config` with commands, `TestInitRendersTheCommandsThatPassed`: setup commands and checks that pass on the copy of the committed tree are rendered; a failing check is left out and reported.
- `files-no-bridge`, `TestInitWithoutABridgeWritesNoStepsReadme`: a bridge that writes no report adds no `features/steps/README.md` and no acceptance configuration.
- `one-request`, `TestInitAsksTheShapingModelOnceWithTheSubmitTool`: one request to the default shape model and effort (`project.DefaultModels()["shape"]`), with `agent.Prompt(agent.Init)` as instructions and the `submit_configuration` tool (`agent.Defs(agent.SubmitConfigurationTool)`: name, description and parameters) as its only tool; the answer's call ends the conversation.
- `one-request` retried, `TestInitAsksOnceMoreWhenTheCallIsMissing`: an answer without the call is asked once more with "Answer by calling submit_configuration.".

## Inventory

Every exported member of `setup` that kogen uses has one row.

| Interface | Consumer | Derived from | Contract tests |
| --- | --- | --- | --- |
| `setup.Init` | kogen | `kogen/cli/engine.go` | every test |
| `setup.InitInput` | kogen | `kogen/cli/engine.go` | `TestInitInputFields` |
| `setup.InitInput.Client` | kogen | `kogen/cli/engine.go` | `TestInitInputFields`, `TestInitAsksTheShapingModelOnceWithTheSubmitTool` |
| `setup.InitInput.Tools` | kogen | `kogen/cli/engine.go` | `TestInitInputFields`, `TestInitWritesTheConfigurationAndTheBridgeInOneCommit`, `TestInitWithoutABridgeWritesNoStepsReadme` |
| `setup.InitInput.Home` (left empty) | kogen | `kogen/cli/engine.go` | `TestInitInputFields`, `TestInitReadsTheLoginUnderTheSessionsHome` |

`setup.Validate`, `setup.Merge`, `setup.InitProposal` and `setup.InitContext` are exported but no consumer uses them; `setup/init_test.go` covers them.
