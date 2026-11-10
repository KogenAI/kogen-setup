# Select init routes from the environment

Slug: setup-init-route-from-environment
Model: not applicable — selection is a stateless choice from saved logins and one environment value
Acceptance:
- .kogen/intents/setup-init-route-from-environment/acceptance.feature
- features/steps/setup-init-route-from-environment__route.js
- features/steps/setup-init-route-from-environment__driver/route_test.go
- features/steps/setup-init-route-from-environment__driver/observe.js

Allow unattended `kogen init` to choose a saved route using `KOGEN_INIT_ROUTE`. When it names an available route, select it without displaying or reading a prompt and print the usual `kogen: selected <route> for discovery and shape, build and review` line. When it names a route without a saved login, refuse with provider/selection_required and exit 4, naming KOGEN_INIT_ROUTE, the requested name and every available route. Apply this validation even with exactly one saved route.

With the variable unset, preserve existing selection behavior, except append `or set KOGEN_INIT_ROUTE to one of: <routes>` to the non-terminal refusal. Preserve the existing terminal chooser, no-login refusal, route ordering, selected model and subsequent initialization workflow. Place environment handling in a small new `setup/init_route_env.go`; limit `setup/init_route.go` edits to delegation at the call site and necessary import changes. Add failing regression tests before implementing the fix, then run `go test ./setup` and the configured checks.

## Decisions
- Use the session environment for KOGEN_INIT_ROUTE, consistent with the caller-environment entry point; treat an empty value as unset and compare nonempty names exactly without trimming or aliases. (evidence: README.md; setup/init_route.go; setup/init_route_test.go) (assumption: empty means unset and nonempty route names are matched literally) (source: request)
- Preserve zero-login behavior rather than introducing environment-specific login handling when there are no available routes. (evidence: setup/init_route.go) (source: request)
- Document KOGEN_INIT_ROUTE next to route selection in docs/getting-started.md only if that file exists and describes selection; do not create a replacement guide for this conditional request. (source: request)

## Source comparison
- Addressed: the request's unattended multiple-login failure, reported on 10 November 2026 during candidate e2fbe851 qualification on darwin-arm64 and linux-x86_64, is preserved as historical evidence, not a new live-provider test. The feature's three-login selection and unavailable-route scenarios reproduce its inputs locally with synthetic credentials. The reported current provider/selection_required status 4 becomes successful selection for an explicitly available environment route.
- Addressed: requested chatgpt and claude-code choices, supergrok rejection, unset non-terminal hint, and single-login preservation are executable in acceptance.feature. Matching and different single-login overrides cover the request's additional single-route rule.
- Addressed: the new-file and call-site constraints are in the outcome above; implementation must add failing regression tests first and run the setup package tests. The protected acceptance helper is not a substitute for those production regression tests.
- Omitted conditionally: docs/getting-started.md is absent in this checkout (repository inspection); its conditional documentation edit is not replaced with an invented file or a change to another guide.
- No conflicting or superseded product requirements. Existing route discovery, model assignment and interactive selection remain unchanged apart from explicit environment selection and the non-terminal hint.

## Tests
- Available explicit route bypasses the prompt: add focused regression coverage for both requested three-login choices and check the usual progress output (regression)
- Unavailable explicit route refuses: add regression coverage for provider/selection_required, exit 4, variable name, requested name and all available names, including the single-login case (regression)
- Unset multiple-login non-terminal selection explains the alternative: add regression coverage for the existing refusal plus environment hint (regression)
- Single-login selection remains automatic: cover unset and matching environment choices (regression)
- Init propagates route refusal: exercise Init with a committed local repository and synthetic saved credentials, asserting typed refusal and exit (integration)
- Setup behavior remains compatible: run go test ./setup and the configured format, compile, vet and go-test checks (existing)

## Feasibility
- Focused observer controls run a compiled setup test binary in a copied tree, using existing init fixture credentials and a non-terminal pipe. Known-good selection and rejection cases passed; a wrong refusal exit was rejected. The initial bad-control summary matcher used the wrong ordering; it was corrected from actual Cucumber output before the final-byte controls below both ran successfully.
- evidence: {"id":"route-observer","kind":"observer","inputs":[".kogen/intents/setup-init-route-from-environment/controls.json",".kogen/intents/setup-init-route-from-environment/acceptance.feature","features/steps/setup-init-route-from-environment__driver/observe.js"],"observers":["features/steps/setup-init-route-from-environment__route.js","features/steps/setup-init-route-from-environment__driver/route_test.go"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/setup-init-route-from-environment__driver/observe.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/setup-init-route-from-environment__driver/observe.js bad","exit":1,"output":"rejected\n"}]}
