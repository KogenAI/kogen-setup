# kogen-setup

Kogen's setup: `kogen init` configures an existing project for Kogen. It detects the project's commands, asks the shaping model once, keeps the commands that pass on a copy of the committed tree, adds the Cucumber bridge when the project has no acceptance runner, and commits `.kogen/project.yaml` and the team lineup in `.kogen/models.yaml` together. It does not scaffold applications.

It is a component of [Kogen](https://github.com/KogenAI/kogen), which pins an exact version of it and assembles the `kogen` program.

## Public checkout

Install Go 1.27.2 (as required by `go.mod`), then clone and enter the repository:

```sh
git clone https://github.com/KogenAI/kogen-setup
cd kogen-setup
```

For inquiries, contact contact@kogen.dev.

## Standalone developer entry point

Build this repository's setup command and run it on a checkout without an assembled
`kogen` binary or adopting this component repository:

```sh
go build -o kogen-setup ./cmd/kogen-setup
./kogen-setup /path/to/checkout
```

The command uses the caller's environment and home, including `KOGEN_NODE`,
`KOGEN_QUINT`, and `KOGEN_CUCUMBER`. Its stdout is one JSON object: `exit` is
Init's integer exit code; `configuration` is null if no valid configuration exists,
or an object with `path` (`.kogen/project.yaml`) and `content` (the exact UTF-8
YAML read after Init); and `error` is null on success or the error string on
failure. The process returns Init's exit code. Init's human-readable output and
any error go to stderr, an error with its indented detail lines. Existing valid configuration is reported on repeat runs.

## Adopting Kogen

Sign in with a supported route using `kogen provider login`, then run `kogen init`. If multiple routes are available, choose one for discovery and the initial roles. Review the selected setup, fixers, checks, acceptance runner and anything left out in `.kogen/project.yaml`; review the team lineup in `.kogen/models.yaml`, correct project-specific omissions and commit the configuration changes.

## Packages

- `setup`: `Init`, the `kogen init` workflow, with the validation and merging of the model's proposal, and the setup conversation's model-facing policy: the init prompt (`setup/prompts/init.md`) and the `submit_configuration` tool definition.
- `contract`: the contract suite: what kogen uses, pinned in tests that run in `go test ./...`: the `Init` signature and `InitInput`, the exit codes, the files written, the one commit and the one model request. An intended interface change edits it together with paired consumer items. See [contract/](contract/).

## Testing

```sh
go build ./... && go vet ./... && go test -race -count=1 ./...
```

`setup/testdata/init/mix-golden.json` holds recorded Elixir verification cases, and `setup/testdata/prompts_golden.json` and `defs_golden.json` the prompt and tool bytes the models have always received. After a deliberate change to their results, regenerate them (synthetic fixtures only, never live user data or providers), then review the diff and run the checks above without the flag:

```sh
go test ./... -update
```


## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
