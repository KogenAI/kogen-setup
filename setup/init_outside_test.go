package setup

import (
	"fmt"
	"reflect"
	"testing"
)

func TestValidateCommandsOutsideProject(t *testing.T) {
	cases := []struct {
		command string
		outside bool
	}{
		{"cd .. && make test", true}, {"bash ../shared/setup.sh", true},
		{"cat sub/../../file", true}, {"cat \"../file\"", true},
		{"cp ~/lint.cfg .", true}, {"cat ~", true}, {"$HOME/bin/lint", true},
		{"${HOME}/bin/lint", true}, {"cat \"$HOME/file\"", true},
		{"sh -c 'echo ../x'", false}, {"cat '..' '~' '~/x' '$HOME' '${HOME}' 'sub/../../x'", false},
		{"make -C sub/../app test", false}, {"cat sub/../file", false},
		{"go test ./...", false}, {"npm ls", false},
	}
	for _, role := range []string{"setup", "fix", "check"} {
		for _, tc := range cases {
			t.Run(role+"/"+tc.command, func(t *testing.T) {
				args := map[string]any{role: []any{tc.command}}
				label := role + " command " + tc.command
				if role == "check" {
					args = map[string]any{"checks": initCheckList("test", tc.command)}
					label = fmt.Sprintf("check test (%s)", tc.command)
				}
				// Setup commands that run tests have a separate existing validation rule.
				if role == "setup" && (tc.command == "go test ./..." || tc.command == "cd .. && make test") {
					return
				}
				proposal, problems := Validate(args, InitContext{})
				if tc.outside {
					want := []string{label + " reaches outside the project folder; use a path inside the project"}
					if !reflect.DeepEqual(problems, want) || !reflect.DeepEqual(proposal, InitProposal{}) {
						t.Fatalf("proposal %#v problems %v, want empty proposal and %v", proposal, problems, want)
					}
				} else if len(problems) != 0 {
					t.Fatalf("problems: %v", problems)
				}
			})
		}
	}
}
