package setup

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestValidateUnsetVariables(t *testing.T) {
	const tail = ", which is not set in the init environment; use a literal value or a project path instead"
	env := InitContext{Env: []string{"SET_ONE=1"}}
	cases := []struct {
		command string
		names   []string
	}{
		{"mkdir $SET_ONE", nil},
		{"mkdir $UNSET_ONE", []string{"UNSET_ONE"}},
		{"UNSET_ONE=x sh -c 'true'", nil},
		{"export UNSET_ONE=x; mkdir \"$UNSET_ONE\"", nil},
		{"mkdir ${UNSET_ONE:-fallback}", nil},
		{"mkdir '$UNSET_ONE'", nil},
		{"mkdir \"$UNSET_ONE\"", []string{"UNSET_ONE"}},
		{"mkdir \"it's $UNSET_ONE\"", []string{"UNSET_ONE"}},
		{"mkdir \\$UNSET_ONE", nil},
		{"mkdir $(mkdir $UNSET_ONE)", []string{"UNSET_ONE"}},
		{"mkdir $((1 + 2)) $ $(true)", nil},
		{"mkdir $PWD $PATH $USER $? $1 $# $@ $* $$ $! $- $0 ${1} ${#}", nil},
		{"for UNSET_ONE in a b; do mkdir \"$UNSET_ONE\"; done", nil},
		{"mkdir ${UNSET_ONE-x} ${UNSET_ONE:=y} ${UNSET_TWO=z}", nil},
		{"mkdir ${SET_ONE}", nil},
		{"mkdir ${UNSET_ONE:?missing}", []string{"UNSET_ONE"}},
		{"mkdir $UNSET_ONE; UNSET_ONE=x", []string{"UNSET_ONE"}},
		{"mkdir $UNSET_ONE $UNSET_TWO $UNSET_ONE", []string{"UNSET_ONE", "UNSET_TWO"}},
		{"cd \"${UNSET_TWO}\" && mkdir $UNSET_ONE", []string{"UNSET_TWO", "UNSET_ONE"}},
		{"go test ./...", nil},
	}
	for _, role := range []string{"setup", "fix", "check"} {
		for _, tc := range cases {
			t.Run(role+"/"+tc.command, func(t *testing.T) {
				args := map[string]any{role: []any{tc.command}}
				label := func(string) string { return role + " command " + tc.command }
				if role == "check" {
					args = map[string]any{"checks": initCheckList("t", tc.command)}
					label = func(string) string { return fmt.Sprintf("check t (%s)", tc.command) }
				}
				if role == "setup" && tc.command == "go test ./..." {
					return
				}
				var want []string
				for _, name := range tc.names {
					want = append(want, label(name)+" references variable "+name+tail)
				}
				proposal, problems := Validate(args, env)
				if !reflect.DeepEqual(problems, want) || (len(want) > 0 && !reflect.DeepEqual(proposal, InitProposal{})) {
					t.Fatalf("proposal %#v problems %q, want %q", proposal, problems, want)
				}
				// A nil Env leaves the rule off.
				if _, problems := Validate(args, InitContext{}); len(problems) != 0 {
					t.Fatalf("nil Env problems: %q", problems)
				}
			})
		}
	}
}

func TestValidateUnsetVariableEmptyEnvAndHome(t *testing.T) {
	_, problems := Validate(map[string]any{"checks": initCheckList("t", "echo $X")}, InitContext{Env: []string{}})
	if len(problems) != 1 || !strings.Contains(problems[0], "references variable X") {
		t.Fatalf("problems %q", problems)
	}
	_, problems = Validate(map[string]any{"checks": initCheckList("t", "echo $HOME $PWD $?")}, InitContext{Env: []string{"EMPTY="}})
	want := []string{"check t (echo $HOME $PWD $?) reaches outside the project folder; use a path inside the project"}
	if !reflect.DeepEqual(problems, want) {
		t.Fatalf("problems %q", problems)
	}
	_, problems = Validate(map[string]any{"checks": initCheckList("t", "echo $EMPTY")}, InitContext{Env: []string{"EMPTY="}})
	if len(problems) != 0 {
		t.Fatalf("a variable set to the empty string is set: %q", problems)
	}
}

func TestInitRefusesUnsetVariablesInCommands(t *testing.T) {
	parallel(t)
	t.Run("set in the environment or tools", func(t *testing.T) {
		parallel(t)
		f := initNewFx(t, true, initSubmit(map[string]any{
			"setup": []any{}, "fix": []any{}, "protect": []any{},
			"checks": []any{map[string]any{"name": "t", "run": `test "$SET_ONE" = 1 && test -n "$KOGEN_NODE"`}}}))
		f.env = append(f.env, "SET_ONE=1")
		f.write("notes.txt", "x\n")
		f.commitAll("a")
		f.mustRun()
		if len(f.requests()) != 1 {
			t.Fatalf("%d requests", len(f.requests()))
		}
	})
	t.Run("unset", func(t *testing.T) {
		parallel(t)
		bad := initSubmit(map[string]any{
			"setup": []any{}, "fix": []any{}, "protect": []any{},
			"checks": []any{map[string]any{"name": "t", "run": `echo "$UNSET_ONE" "$UNSET_ONE"`}}})
		f := initNewFx(t, true, bad, bad)
		f.write("notes.txt", "x\n")
		f.commitAll("a")
		f.wantError("provider", "init_invalid", 4)
		if f.exists(".kogen") {
			t.Fatal("configuration written")
		}
		reqs := f.requests()
		if len(reqs) != 2 {
			t.Fatalf("%d requests", len(reqs))
		}
		input := initInput(reqs[1])
		got, _ := input[len(input)-1]["output"].(string)
		want := `invalid: check t (echo "$UNSET_ONE" "$UNSET_ONE") references variable UNSET_ONE, which is not set in the init environment; use a literal value or a project path instead`
		if got != want {
			t.Fatalf("correction %q, want %q", got, want)
		}
	})
}
