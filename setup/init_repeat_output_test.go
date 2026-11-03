package setup

import (
	"strings"
	"testing"
)

func TestInitRepeatFailureOutputAndIneligibleProgress(t *testing.T) {
	parallel(t)
	repeat := "if test -e .ran; then echo retry-output; exit 9; else touch .ran; fi"
	mutation := "echo changed > README.md"
	empty := "env printf '0 tests, 0 failures'"
	clean := "test \"$(cat README.md)\" = original"
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{}, "checks": initCheckList("repeat", repeat, "mutation", mutation, "empty", empty, "clean", clean), "protect": []any{},
	}))
	f.write("README.md", "original\n")
	f.commitAll("fixture")
	exit, out, progress, err := f.run("")
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v stdout %s progress %s", exit, err, out, progress)
	}
	for _, want := range []string{
		"kogen: running repeat again: " + repeat + "\n  | retry-output\n",
		"kogen: running clean again: " + clean + "\n",
	} {
		if !strings.Contains(progress, want) {
			t.Errorf("missing %q in %s", want, progress)
		}
	}
	for _, name := range []string{"mutation", "empty"} {
		if strings.Contains(progress, "kogen: running "+name+" again:") {
			t.Errorf("ineligible check retried: %s", progress)
		}
	}
	if !strings.Contains(out, "Left out: repeat ("+repeat+") is not repeatable: its second run failed with status 9; mutation ("+mutation+") changed README.md; empty ("+empty+") ran no tests") {
		t.Errorf("stdout: %s", out)
	}
	checks := f.config().Checks
	if len(checks) != 1 || checks[0].Name != "clean" {
		t.Fatalf("checks: %v", checks)
	}
}
