package setup

import (
	"reflect"
	"testing"
)

func TestValidateCredentials(t *testing.T) {
	cases := []struct{ command, redacted string }{
		{"npm config set //registry.invalid/:_authToken=abc123def", "npm config set //registry.invalid/:_authToken=***"},
		{`curl -H "Authorization: Bearer abc123" https://api.invalid/health`, `curl -H "Authorization: Bearer ***" https://api.invalid/health`},
		{"git clone https://bot:hunter2@git.invalid/x.git deps/x", "git clone https://bot:***@git.invalid/x.git deps/x"},
		{"NAME_TOKEN=abc tool --password 'hunter2'", "NAME_TOKEN=*** tool --password '***'"},
		{"tool --token=abc\ntool --secret def", "tool --token=***\ntool --secret ***"},
		{"tool;tool --api-key abc", "tool;tool --api-key ***"},
		{`tool --password "abc\" def"`, `tool --password "***"`},
		{"tool --password=abc:def", "tool --password=***"},
		{"NAME_TOKEN=user:pass", "NAME_TOKEN=***"},
		{"NAME_TOKEN=user:pass tool", "NAME_TOKEN=*** tool"},
		{"tool --password='abc:def'", "tool --password='***'"},
		{"API_KEY=a:b:c make test", "API_KEY=*** make test"},
		{`curl -H "Authorization: Bearer abc:def" https://api.invalid/health`, `curl -H "Authorization: Bearer ***" https://api.invalid/health`},
		{`curl -H "Authorization: Bearer a=b" https://api.invalid/health`, `curl -H "Authorization: Bearer ***" https://api.invalid/health`},
		{"tool --token abc:def", "tool --token ***"},
	}
	for _, role := range []string{"setup", "fix", "checks"} {
		for _, tc := range cases {
			args := map[string]any{role: []any{tc.command}}
			label := role
			if role == "checks" {
				args[role] = initCheckList("test", tc.command)
				label = "check"
			}
			proposal, problems := Validate(args, InitContext{})
			want := []string{label + " command " + tc.redacted + " contains a credential literal; read it from the environment instead"}
			if !reflect.DeepEqual(problems, want) || !reflect.DeepEqual(proposal, InitProposal{}) {
				t.Errorf("%s %q: %#v %#v", role, tc.command, problems, proposal)
			}
		}
	}
	for _, cmd := range []string{"npm config set //registry.invalid/:_authToken=$NPM_TOKEN", "API_KEY= make build", "npm run build", "tool --token=${API_KEY}", `tool --password "$NPM_TOKEN"`, "tool abc123def"} {
		if _, p := Validate(map[string]any{"fix": []any{cmd}}, InitContext{}); len(p) != 0 {
			t.Errorf("%q: %v", cmd, p)
		}
	}
}
