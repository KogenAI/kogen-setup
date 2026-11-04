package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestInitValidateRepositoryStateCommands(t *testing.T) {
	for _, kind := range []string{"setup", "fix", "checks"} {
		for _, action := range []string{"reset", "clean", "checkout", "restore", "stash", "commit", "rebase", "merge", "cherry-pick", "tag", "branch", "am", "apply"} {
			command := "git " + action + " --hard"
			t.Run(kind+"/"+action, func(t *testing.T) {
				args := map[string]any{kind: []any{command}}
				prefix := kind + " command " + command
				if kind == "checks" {
					args[kind] = initCheckList("a", command)
					prefix = "check a (" + command + ")"
				}
				proposal, problems := Validate(args, InitContext{})
				if !reflect.DeepEqual(problems, []string{prefix + " changes the repository state"}) || !reflect.DeepEqual(proposal, InitProposal{}) {
					t.Fatalf("proposal: %+v, problems: %q", proposal, problems)
				}
			})
		}
	}
}

func TestInitValidateRepositoryStateParts(t *testing.T) {
	for _, tc := range []struct {
		command string
		reject  bool
	}{
		{"echo ok; git reset --hard", true}, {"echo ok && git reset --hard", true},
		{"false || git clean -fd", true}, {"cat x | git stash", true}, {"echo ok\ngit reset --hard", true},
		{"git apply --check x; git apply y", true}, {"git reset; git clean", true}, {"git apply --check=x x.patch", true},
		{"git apply x; echo --check", true}, {"git apply --check x.patch", false},
		{"git diff --exit-code && make test", false}, {"git submodule update --init", false},
		{"git status", false}, {"git diff", false}, {"git log", false}, {"git rev-parse HEAD", false},
		{"git ls-files", false}, {"git show", false}, {"git describe", false},
	} {
		t.Run(tc.command, func(t *testing.T) {
			proposal, problems := Validate(map[string]any{"checks": initCheckList("a", tc.command)}, InitContext{})
			var want []string
			if tc.reject {
				want = []string{"check a (" + tc.command + ") changes the repository state"}
				if !reflect.DeepEqual(proposal, InitProposal{}) {
					t.Fatalf("proposal: %+v", proposal)
				}
			}
			if !reflect.DeepEqual(problems, want) {
				t.Fatalf("problems: %q, want %q", problems, want)
			}
		})
	}
}

func TestInitValidateApplyCheckAllKinds(t *testing.T) {
	for _, kind := range []string{"setup", "fix", "checks"} {
		command := "git apply --check x.patch"
		args := map[string]any{kind: []any{command}}
		if kind == "checks" {
			args[kind] = initCheckList("a", command)
		}
		if _, problems := Validate(args, InitContext{}); len(problems) != 0 {
			t.Errorf("%s: %q", kind, problems)
		}
	}
}

func TestInitCorrectsRepositoryStateBeforeVerification(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "ran")
	command := "git reset --hard; touch " + marker
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("a", command)}), initNothing())
	f.write("README.md", "notes\n")
	f.commitAll("notes")
	exit, _, _, err := f.run("")
	if err != nil || exit != 0 {
		t.Fatalf("exit %d, error %v", exit, err)
	}
	requests := f.requests()
	if len(requests) != 2 {
		t.Fatalf("requests: %d", len(requests))
	}
	body, _ := json.Marshal(requests[1])
	if !strings.Contains(string(body), "check a ("+command+") changes the repository state") {
		t.Fatalf("correction: %s", body)
	}
	if checks := f.config().Checks; len(checks) != 0 {
		t.Fatalf("checks: %v", checks)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("marker stat: %v", err)
	}
}
