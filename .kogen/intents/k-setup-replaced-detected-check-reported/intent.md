# Report replaced detected checks

Slug: k-setup-replaced-detected-check-reported
Model: not applicable — this adds summary reporting, not workflow state
Acceptance:
- .kogen/intents/k-setup-replaced-detected-check-reported/acceptance.feature
- features/steps/k-setup-replaced-detected-check-reported__report.js

Report each detected check displaced by a same-name proposal with a different command. In setup/init.go's Init summary, after Checks and before Acceptance, print `Replaced: <name> (<detected command>) with (<proposed command>)`, one line per replacement in detected order. Compare command strings, not check names alone. Keep Merge's replacement/deduplication rules, verification, Left out reporting, and written configuration unchanged. Reporting describes the replacement at merge time, even if subsequent verification leaves that proposed check out. No configuration schema, prompt, provider, or detection changes.

## Decisions
- Print nothing for identical same-name commands or newly named proposed checks; print both original and proposed command text for replacements. (source: request)
- Use detected order rather than proposal order. (source: request)
- Preserve detector naming: the installed project detector calls Go checks go-test and go-format. Exercise Init with these real names and the exact synthetic test/go test example through Merge, rather than changing detection to make a fixture work. (evidence: ran `cat $(go env GOPATH)/pkg/mod/github.com/\!kogen\!a\!i/kogen-coordinator@$(go list -m -f '{{.Version}}' github.com/KogenAI/kogen-coordinator)/project/detect.go | head -160`) (source: request)

## Source comparison
- Addressed: request Problem and Need, in outcome prose and all acceptance scenarios: previously silent command replacement becomes visible between Checks and Acceptance without changing the replacement rule or project.yaml's retained command.
- Addressed: synthetic narrowing example `test = go test ./...` to `go test ./cmd/app` through Merge in the capture fixture, and through real Init detection under go-test in scenario Narrowed suite. Exact literal command strings remain unchanged.
- Addressed: same-command and new-name counterexamples in Same command and New name; two lines in detected order in Detected order.
- Superseded only as an executable fixture assumption: the synthetic name test at the Go detector boundary becomes go-test, since current detection does not emit test for Go. No requested production behavior is removed; arbitrary same-name replacement remains required.
- Omitted: no requested product behavior. Existing Left out and project.yaml behavior remain unchanged.

## Tests
- A changed same-name command is reported with exact before/after strings and the proposed command remains configured: Narrowed suite acceptance plus focused Init output regression using existing initFx (regression)
- Same-name same-command proposals produce no replacement line: Same command acceptance (scenario)
- A new-name proposal produces no replacement line: New name acceptance (scenario)
- Multiple replacements appear in detected order between Checks and Acceptance: Detected order acceptance with reverse-ordered proposal (scenario)
- Existing Merge replacement and command deduplication remain unchanged: keep existing TestInitMergeProposedCheckReplacesDetectedOthersFollow and TestInitMergeWhitespaceCommandsAndExactPaths (existing)

## Feasibility
- Installed Go is go1.27.2; local dependency inspection confirms detector naming and order (go-format, go-test, go-vet, go-build). Local scripted provider and fake commands reuse setup/init_test.go fixtures; no external provider calls are needed.
- evidence: {"id":"report-observer","kind":"observer","inputs":["features/steps/k-setup-replaced-detected-check-reported__report.js"],"observers":["features/steps/k-setup-replaced-detected-check-reported__report.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-setup-replaced-detected-check-reported__report.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-setup-replaced-detected-check-reported__report.js --control bad","exit":1,"output":"rejected\n"}]}
