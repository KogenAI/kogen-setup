# Refuse checks and fixes that contact remote hosts

Slug: k-setup-check-needs-remote-host
Model: not applicable — Validate is a stateless function of its proposal
Acceptance:
- .kogen/intents/k-setup-check-needs-remote-host/acceptance.feature
- features/steps/k-setup-check-needs-remote-host__validate.js

Validate in setup/init.go refuses a check or fix command whose result depends on a remote host. A command part (split outside quotes on `;`, `&`, `|` and newline) is refused when its literal command word is `curl`, `wget`, `ping`, `nc`, `telnet`, `ssh` or `git ls-remote`, and its target is not loopback (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`), a relative or absolute file path, or a `file://` URL. For `curl`, `wget` and `git ls-remote` the target is a URL argument with a scheme (or, for git, `user@host:path`); for `ping`, `nc`, `telnet` and `ssh` it is the first positional argument that is not purely numeric (so `ping -c 1 host` targets host; `user@` is stripped). Commands that name no host are not refused. Setup commands are unaffected.

Problems (exact text): `check <name> (<command>) contacts a remote host; checks must not depend on the network` and `fix command <command> contacts a remote host`.

## Decisions
- Remote-host detection is a new helper in setup/init_remote_host.go, called from the check loop and the fix loop of Validate only, not the setup loop. (evidence: setup/init.go) (source: request)
- Targets in unrecognised forms (for example a bare `curl example.com`, or `git ls-remote origin`) are not refused; only literal URL, scp-style git, or positional host targets are. (assumption: the user accepts this narrow literal recognition) (source: request)
- Quoted text and commands outside the listed command words never trigger the rule. (source: request)

## Source comparison
- Refusal of curl/wget/ping/nc/telnet/ssh/git ls-remote to non-loopback targets in checks and fixes: addressed. Problem texts: addressed verbatim. Setup downloads allowed: addressed. Existing `curl ... | sh` machine-prerequisite rule: unchanged.

## Tests
- Remote check commands are refused with the check text: Validate scenario outline over curl, ping, nc, git ls-remote, ssh (scenario)
- Remote fix commands are refused with the fix text: Validate scenario with a wget fix (scenario)
- Loopback checks, setup downloads and go test are not refused: Validate scenarios expecting no problems (scenario)
- Existing init behavior is unchanged: the existing init tests in setup (existing)

## Feasibility
- none
