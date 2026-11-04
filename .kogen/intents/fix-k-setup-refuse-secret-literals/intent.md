# Redact whole credential values containing colons

Slug: fix-k-setup-refuse-secret-literals
Model: not applicable — stateless command validation and diagnostic redaction
Acceptance:
- .kogen/intents/fix-k-setup-refuse-secret-literals/acceptance.feature
- features/steps/fix-k-setup-refuse-secret-literals__validate.js

Fix a leak in the credential redaction landed by k-setup-refuse-secret-literals (`initCredentialLiteral` in setup/init_credentials.go, used by `setup.Validate` for setup, fix and check commands). Today a shell word whose credential value contains a colon, such as `tool --password=abc:def` or `NAME_TOKEN=user:pass`, takes the quoted-HTTP-header branch: the text before the first colon (`--password=abc`, `NAME_TOKEN=user`) matches a credential name, so only the text after the colon is replaced. The diagnostic then reads `tool --password=abc:*** contains a credential literal; ...`, leaking `abc` into diagnostics and logs. This was reproduced on current main for setup, fix and check commands (see Feasibility).

Change: the header branch applies only when the text before the first colon (quotes trimmed) contains no `=`. A word whose part before the first colon contains `=` is handled by the existing name=value branch, so the whole value after the `=` (including every colon) is replaced by `***`, keeping surrounding quotes as today. Expected results:
- `tool --password=abc:def` → `tool --password=***`
- `NAME_TOKEN=user:pass` → `NAME_TOKEN=***`; `NAME_TOKEN=user:pass tool` → `NAME_TOKEN=*** tool`
- `tool --password='abc:def'` → `tool --password='***'`
- `API_KEY=a:b:c make test` → `API_KEY=*** make test`

Unchanged: real quoted headers whose name has no `=` keep header redaction, even when the value contains a colon or `=` (`curl -H "Authorization: Bearer abc:def" https://api.invalid/health` and `curl -H "Authorization: Bearer a=b" https://api.invalid/health` both redact to `Bearer ***`); separate name/value words (`tool --token abc:def` → `tool --token ***`); URL passwords; npm `_authToken`; environment references; the problem text `<setup|fix|check> command <redacted command> contains a credential literal; read it from the environment instead` and one problem per offending entry with an empty proposal. No other validation, prompt, schema or configuration change. Keep every existing test green.

## Decisions
- Take the header branch only when the name before the colon has no `=` (the first of the two fixes the request offers), so header values containing `=` keep being redacted whole. (source: request)
- Add colon-in-value cases to the Go unit test and the acceptance scenarios. (source: request)

## Source comparison
- Addressed: reproduction first — `tool --password=abc:def` and `NAME_TOKEN=user:pass` were observed on main producing `tool --password=abc:***` and `NAME_TOKEN=user:***` for setup, fix and check; the acceptance rows and the new Go cases fail on main for exactly this scenario.
- Addressed: fix in setup/init_credentials.go header branch; colon-in-value tests added; existing tests kept green; no unrelated changes.
- Superseded: the request's alternative "check the `=` branch first" is not chosen, because it would redact `"Authorization: Bearer a=b"` as `Bearer a=***` and leak `a`; an acceptance row pins the header behavior.

## Tests
- A credential value after `=` (flag or assignment) that contains colons is redacted whole: add `tool --password=abc:def` → `tool --password=***`, `NAME_TOKEN=user:pass` → `NAME_TOKEN=***`, `tool --password='abc:def'` → `tool --password='***'` and `API_KEY=a:b:c make test` → `API_KEY=*** make test` to the cases of TestValidateCredentials in setup/init_credentials_test.go, plus the acceptance rows (regression)
- Quoted headers whose name has no `=` still redact the whole value including colons or `=`, and separate name/value words with colons stay redacted whole: add `curl -H "Authorization: Bearer abc:def" ...`, `curl -H "Authorization: Bearer a=b" ...` and `tool --token abc:def` cases to TestValidateCredentials, plus acceptance rows (unit)
- Existing credential, URL, environment-reference and unrelated validation behavior: existing TestValidateCredentials cases and configured format/build/vet/go-test checks (existing)

## Feasibility
- Reproduced on main with a scratch Go driver calling `setup.Validate` from outside the checkout: `tool --password=abc:def` → `["fix command tool --password=abc:*** contains a credential literal; read it from the environment instead"]` (same for setup and check), `NAME_TOKEN=user:pass` → `NAME_TOKEN=user:***`, `tool --password='abc:def'` → `--password='abc:***'`, `API_KEY=a:b:c make test` → `API_KEY=a:*** make test`; header `Bearer abc:def` and `tool --token abc:def` already redacted whole. (probe: exit 0)
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":["features/steps/fix-k-setup-refuse-secret-literals__validate.js"],"observers":["features/steps/fix-k-setup-refuse-secret-literals__validate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-refuse-secret-literals__validate.js --control '[\"fix command tool --password=*** contains a credential literal; read it from the environment instead\"]' '[\"fix command tool --password=*** contains a credential literal; read it from the environment instead\"]'","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-setup-refuse-secret-literals__validate.js --control '[\"fix command tool --password=abc:*** contains a credential literal; read it from the environment instead\"]' '[\"fix command tool --password=*** contains a credential literal; read it from the environment instead\"]'","exit":1,"output":"rejected\n"}]}
