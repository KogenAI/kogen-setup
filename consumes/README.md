# Setup's producer dependencies

These packages run independently with `go test ./consumes/kogen-coordinator/...`,
`go test ./consumes/kogen-executor/...`, `go test ./consumes/kogen-loop/...`, and
`go test ./consumes/kogen-verification/...`. They use producer exports, temporary
roots and HOME, loopback HTTP, and the Executor Claude runtime fixture; they do
not use a real provider or Claude installation. Git's system and global settings
are disabled for the fixture repositories. Names below refer to tests in the named
consumer package, not to producer implementation tests.

## Audit method

The inventory was assembled by inspecting imports and package-qualified names in
each non-test Go file in `setup/` and `cmd/kogen-setup/main.go`, then tracing each
receiver variable and returned value at its use sites. In particular the inventory
includes fields and methods on `Repo`, `Session`, `Response`, `Call`, `Usage`,
`Config`, `Detected`, `Role`, executor sessions/results and verification results.
`setup/overlap.go` uses the same `Check` fields as `init.go`; `setup/policy.go`
uses the generic tool lookup. The command also dispatches the executor hook and
loads a repository's saved config, so it is included explicitly below. Assertions
are selected for the values and effects those call sites consume, rather than
unrelated producer features.

## Coordinator — `TestRepositoryAndConfig`

| Consumed export / receiver or field | Production sites and purpose | Assertion |
| --- | --- | --- |
| `git.Open`, `Repo.Dir`, `RequireIdentity`, `Head` | `setup/init.go:initRun`, `cmd/kogen-setup/main.go:main`: locate checkout, require commit identity and find HEAD | Opens an isolated initialized repo with local identity and an initially empty HEAD. |
| `Repo.ChangedPaths`, `Show`, `OK`, `GitDir` | `initRun`, `initConfigure`, `initCommittedCopy`, `initVerify`, `initWriteFiles`: inspect dirty paths and committed tree | Commits a config, reads its committed bytes and tree listing, finds Git directory and sees the subsequent dirty config. |
| `Repo.Observing`, `RunEnv`, result `Status`, `Stdout`, `Stderr` | `initVerify`, `initCheckDirs`, `initTreeState`: inspect/clean scratch tree with optional locks disabled | Observing Git status returns the changed config, and a missing path reports a nonzero status and stderr. |
| `Repo.CommitPaths` | `initCommit`: commit only selected setup files | The selected config is committed and its returned abbreviated id matches HEAD. |
| `git.UnsetPrefix` | `initCommittedCopy`: avoid inherited Git directory overrides during archive | Checks the prefix unsets the Git directory override. |
| `project.ConfigPath`, `Template`, `RenderConfig`, `LoadConfig`, `Config.Setup/Fix/Checks/Protect/Acceptance`, `Acceptance.Run/StepsDir`, `Check.Name/Run` | `initRun`, `initConfigure`, `initNextLines`, `initRenderConfig`, `initWriteFiles`, command `main`: write/read YAML and report resulting configuration | Rendered commands and acceptance round-trip through the public loader; neither the rendered configuration nor the template has a models section, the template loads with the team file present, and the separate models template loads default roles through `LoadModels`. |
| `Detect`, `Detected.Setup/Fix/Checks/Protect/Runner` | `initConfigure`, `initDetectedJSON`, `Merge`, `initSelectOverlap`: propose commands and runner from tracked manifests | npm and Mix fixtures check detected setup, fix, checks, protected paths and runner. |
| `ModelsPath`, `ModelsTemplate`, `LoadModels`, `DefaultModels`, `ModelRoles`, `Role.Provider/Model/Effort/Executor`, `Role.External`, `ExecutorClaudeCode` | `init_route.go:models`, `initRenderModels`, `initAsk`: select role settings and executor | Template model defaults round-trip; external and native role selection is checked. |
| `AcceptanceCommand`, `ProjectRunner`, `KogenRunner` | `initExistingRunner`, `initAddBridge`: construct runner command | Both forms have the executable and complete arguments used to run the requested steps directory. |

## Executor — `TestClaudeRounds`, `TestHookAndToolDefinitions`

| Consumed export / receiver or field | Production sites and purpose | Assertion |
| --- | --- | --- |
| `agent.AsAny` | `initConverse`: pass tool definitions to the provider | Submission definition survives conversion. |
| `claudecode.New`, `Options.Home/Env/Stderr/Token/HookCommand`, `executor.Task.Role/Root/Home/Dir/Model/Effort/Schema/Brief`, `RoleShape`, `Brief.Stable/Dynamic` | `initClaudeConverse`: start shape session using selected route and task | A synthetic installed executable responds to the real adapter's version, auth and stream protocol. The first prompt contains both brief components. |
| `Executor.Start`, `Session.Round`, `Input.Feedback`, `RoundResult.Structured`, `Session.Close` | `initClaudeConverse`: validate configuration, send correction on retry and close | Two real rounds return structured JSON; the second process receives feedback, and the session is closed. |
| `HookSubcommand`, `RunHook` | `cmd/kogen-setup/main.go:main`, `initClaudeConverse`: dispatch protection hook | Calls the hook with a temporary read-only policy and asserts its denial of a write. |

## Loop — `TestRespondAndConversation`, `TestSessionExecutionAndInterrupt`, `TestRoutesAndDefinitions`

| Consumed export / receiver or field | Production sites and purpose | Assertion |
| --- | --- | --- |
| `provider.NewClient`, `Client.Respond`, `Request.Role/Instructions/Input/Tools/CacheID`, `Role.Provider/Model/Effort/BaseURL`, `Response.Items/Usage`, `Usage.Add/Line`, `NewCacheID` | `cmd/kogen-setup/main.go`, `initConverse`, `conversationRequest`, `initAsk`: send discovery conversation, parse answer and report totals | Loopback streaming fixture receives instructions, input, tools and cache key; returned call and accumulated token totals are asserted. Usage progress line is checked. |
| `Catalog` and `Info.Name/Models`, `RequireLogin`, `ClaudeCodeToken`, `Status` | `initSelectRoute`: discover signed-in routes and choose initial model | Empty HOME is not signed in, catalog's ChatGPT route has no model hint, and a temporary saved Claude token is returned. A saved compatible key produces the status prefix used to identify that route. |
| `tools.Calls`, `Call.Name/Args/Output`, `Replay`, `Cut`, `Output.Cut`, `Definition` | `initConverse`, `conversation.go:toolOutput`, `initAsk`, `policy.go`: parse, replay and answer model calls while bounding text and preserving typed output | Streamed function call is decoded, replayed and answered with its call id; long text is cut, typed parts survive, and generic definition lookup is checked. |
| `sys.NewWith`, `Session.Env/Cwd/Stdout/Stderr`, `Getenv`, `Puts`, `Progress`, `Context`, `Err` | `Init`, `initAsk`, `initSelectRoute`, command `main`: supply isolated process environment, output and cancellation | Session fixture asserts environment, output streams and cancellation. |
| `sys.TmpPath` | `initConfigure`: name an isolated temporary copy | `TestSessionExecutionAndInterrupt` creates the returned path beneath its temporary TMPDIR. |
| `Session.Run`, `Options.Env/Timeout/KillGroupOnExit`, `Result.Status/Output/TimedOut` | `initCommittedCopy`, `initExec`, `initCommandFailure`: run checks, report failure and stop timed-out commands | A local command receives its tool environment and returns status/output; a bounded busy command times out. |
| `Fail`, `AsError`, `Error.Exit`, `Interrupted.ExitCode` | `Init`, `initRun`, `initSelectRoute`: classify errors and interrupts for exit status | Error class/reason/exit and a SIGINT session's cancellation and exit code are checked. |

## Verification — `TestCopyAndRunner`

| Consumed export / receiver or field | Production sites and purpose | Assertion |
| --- | --- | --- |
| `CopyTree` | `initCommittedCopy`: copy project without private state | File and project config are copied, `.git` and `.kogen/local` are excluded. |
| `Tools.Node/Quint/Cucumber` | `initExec`, `initExistingRunner`, `initAddBridge`, command `main`: wire installed tool paths | Synthetic runner checks the three environment values. |
| `RunnerCheck` reason/output/error | `initExistingRunner`, `initAddBridge`: retain only working runners | A local command creates a report and succeeds; failing status and missing report produce reasons and captured output. |
