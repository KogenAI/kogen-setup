# kogen-setup

Kogen's setup: `kogen init` configures an existing project for Kogen. It detects the project's commands, asks the shaping model once, keeps the commands that pass on a copy of the committed tree, adds the Cucumber bridge when the project has no acceptance runner, and commits `.kogen/project.yaml`. It does not scaffold applications.

It is a component of [Kogen](https://github.com/KogenAI/kogen), which pins an exact version of it and assembles the `kogen` program.

## Packages

- `setup`: `Init`, the `kogen init` workflow, with the validation and merging of the model's proposal.
- `contract`: the contract suite: what kogen uses, pinned in tests that run in `go test ./...`: the `Init` signature and `InitInput`, the exit codes, the files written, the one commit and the one model request. An intended interface change edits it together with paired consumer items. See [contract/](contract/).

## Testing

```sh
go build ./... && go vet ./... && go test -race -count=1 ./...
```

`setup/testdata/init/mix-golden.json` holds recorded Elixir verification cases. After a deliberate change to their results, regenerate it (synthetic fixtures only, never live user data or providers), then review the diff and run the checks above without the flag:

```sh
go test ./... -update
```

The module depends on private KogenAI modules: set `GOPRIVATE=github.com/KogenAI/*`.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
