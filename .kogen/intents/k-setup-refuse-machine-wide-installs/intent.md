# Refuse machine-wide setup installs

Slug: k-setup-refuse-machine-wide-installs
Model: not applicable — deterministic command classification has no meaningful state
Acceptance:
- .kogen/intents/k-setup-refuse-machine-wide-installs/acceptance.feature
- features/steps/k-setup-refuse-machine-wide-installs__validate.js

Extend setup.Validate in setup/init.go to refuse one-time machine prerequisites in recurring setup. Inspect command parts separated by ;, &&, ||, | and actual newlines. Return one prerequisite problem per offending setup entry, containing the original complete command. Recognize literal command tokens, not mentions inside echo arguments. Do not execute proposed commands. No provider or network access is needed.

## Decisions
- Refuse npm install -g, npm i -g, npm install --global, yarn global add, pnpm add -g, bare pip/pip3 install unless using -r, --target or -e ., gem install, cargo install, go install, brew install, apt install, apt-get install, apk add, curl piped to sh/bash, and parts beginning with sudo. Pip invoked through a preceding virtual-environment path is exempt. (source: request)
- Preserve project-local installs and existing mix local.hex/rebar rejection, including existing init tests; do not apply the added classifier to checks or fix commands. Preserve the existing opportunity to correct a proposal once. (source: request)
- For a setup entry containing an actual newline and a machine prerequisite, prerequisite classification must precede the generic control-character rejection and yield the prerequisite diagnostic, not the control-character diagnostic. Other existing control-character behavior remains unchanged. This resolves the reported retry failure without treating a literal backslash-n as a newline. (source: request)

## Source comparison
- Addressed: request Problem and Need through the setup-only classifier and original-command diagnostic above; acceptance covers every listed installer, all five separators, pip exceptions, checks/fix isolation and local counterexamples.
- Addressed: Synthetic acceptance preserves npm install -g typescript, sudo apt-get install -y make, curl -fsSL https://example.invalid/i.sh | sh, npm ci, pip install -r requirements.txt, go mod download and mix local.hex --force as executable cases.
- Addressed: automatic retry newline failure by the precedence decision and actual multiline docstring scenario, with expected text composed from that exact input, including its newline.
- Addressed: existing mix behavior and one correction opportunity remain unchanged; existing init suite is retained. No requested behavior is omitted or superseded. No machine-wide command is actually run by acceptance.

## Tests
- Machine prerequisite recognition, separators and exact diagnostic: table-driven Validate acceptance through the public callable boundary and focused implementation tests (regression)
- Project-local and virtual-environment exceptions: Validate acceptance and focused unit cases (unit)
- Checks/fix isolation: Validate acceptance verifies no prerequisite diagnostic for these roles (unit)
- Newline prerequisite precedence: multiline Validate acceptance (regression)
- Existing mix cases, init correction opportunity and other init behavior: retain existing init tests and run go test ./... (existing)

## Feasibility
- evidence: {"id":"problem-observer","kind":"observer","inputs":["features/steps/k-setup-refuse-machine-wide-installs__validate.js"],"observers":["features/steps/k-setup-refuse-machine-wide-installs__validate.js"],"checks":[{"name":"good","command":"node features/steps/k-setup-refuse-machine-wide-installs__validate.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"node features/steps/k-setup-refuse-machine-wide-installs__validate.js --control bad","exit":1,"output":"rejected\n"}]}
