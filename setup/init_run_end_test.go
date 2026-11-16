package setup

import (
	"regexp"
	"strings"
	"testing"
	"time"
)

var initEndLineRE = regexp.MustCompile(`^kogen: .+ (finished in \S+ \(status \d+\)|timed out after \S+)$`)

// initWithoutEndLines drops the end lines of verification runs from progress output.
func initWithoutEndLines(progress string) string {
	var kept []string
	for _, line := range strings.Split(progress, "\n") {
		if !initEndLineRE.MatchString(line) {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "\n")
}

func initEndLines(t *testing.T, stderr string, want ...string) {
	t.Helper()
	got := strings.Split(stderr, "\n")
	at := -1
	for _, w := range want {
		found := -1
		for i := at + 1; i < len(got); i++ {
			if got[i] == w {
				found = i
				break
			}
		}
		if found < 0 {
			t.Fatalf("missing or out of order %q in:\n%s", w, stderr)
		}
		at = found
	}
}

func TestInitRunEndSetupBothRuns(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{"mix deps.get"}, "fix": []any{}, "checks": []any{}, "protect": []any{}}), initNothing())
	f.write("tracked", "original\n")
	f.write("mix.exs", "defmodule App.MixProject do\n  def project, do: [app: :app, deps: deps()]\n  defp deps, do: [{:ecto, \"~> 3.0\"}]\nend\n")

	f.commitAll("fixture")
	_, stderr := f.mustRun()
	initEndLines(t, stderr,
		"kogen: running setup-1: mix deps.get",
		"kogen: setup-1 finished in 0s (status 0)",
		"kogen: running setup-1 again: mix deps.get",
		"kogen: setup-1 again finished in 0s (status 0)")
}

func TestInitRunEndCheckStatus(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": initCheckList("good", "test -f README.md", "bad", "exit 3"), "protect": []any{}}), initNothing())
	f.write("README.md", "x\n")
	f.commitAll("fixture")
	_, stderr := f.mustRun()
	initEndLines(t, stderr,
		"kogen: good finished in 0s (status 0)",
		"kogen: good again finished in 0s (status 0)",
		"kogen: bad finished in 0s (status 3)")
	if strings.Contains(stderr, "kogen: bad again") {
		t.Fatalf("failing check ran again:\n%s", stderr)
	}
}

func TestInitRunEndFixerAndRecheck(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{"mix format"}, "checks": initCheckList("test", "mix test"), "protect": []any{}}), initNothing())
	f.write("tracked", "original\n")
	f.commitAll("fixture")
	_, stderr := f.mustRun()
	initEndLines(t, stderr,
		"kogen: fix-1 finished in 0s (status 0)",
		"kogen: fix-1 again finished in 0s (status 0)",
		"kogen: test after fix-1 finished in 0s (status 0)")
}

func TestInitRunEndTimedOut(t *testing.T) {
	oldBudget, oldTimeout := initVerifyLimit, initExecTimeout
	initVerifyLimit, initExecTimeout = 30*time.Second, 1*time.Second
	defer func() { initVerifyLimit, initExecTimeout = oldBudget, oldTimeout }()
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": initCheckList("slow", "sleep 30"), "protect": []any{}}), initNothing())
	f.write("README.md", "x\n")
	f.commitAll("fixture")
	_, stderr := f.mustRun()
	if !regexp.MustCompile(`(?m)^kogen: slow timed out after [0-9]+s$`).MatchString(stderr) {
		t.Fatalf("no timeout line in:\n%s", stderr)
	}
	if strings.Contains(stderr, "kogen: slow finished") {
		t.Fatalf("timed-out run reported a status:\n%s", stderr)
	}
	// The per-command limit alone is not a budget stop.
	if strings.Contains(stderr, "used up; longest runs") {
		t.Fatalf("per-command timeout printed the budget line:\n%s", stderr)
	}
}

func TestInitRunEndBudgetLineLongestFirst(t *testing.T) {
	runs := []initRunTime{{"setup-1", 2 * time.Second}, {"slow", 7 * time.Second}, {"test", time.Second}, {"fix-1", 7 * time.Second}}
	want := "kogen: init time budget of 30m used up; longest runs: slow 7s, fix-1 7s, setup-1 2s"
	if got := initBudgetLine(runs, "30m"); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	if got := initBudgetLine(runs[:1], "3s"); got != "kogen: init time budget of 3s used up; longest runs: setup-1 2s" {
		t.Fatalf("got %q", got)
	}
}

func TestInitRunEndBudgetLineOncePerStop(t *testing.T) {
	oldBudget, oldTimeout := initVerifyLimit, initExecTimeout
	initVerifyLimit, initExecTimeout = 2*time.Second, 10*time.Second
	defer func() { initVerifyLimit, initExecTimeout = oldBudget, oldTimeout }()
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": initCheckList("slow", "sleep 30", "later", "test -f README.md"), "protect": []any{}}), initNothing())
	f.write("README.md", "x\n")
	f.commitAll("fixture")
	_, stderr := f.mustRun()
	lines := strings.Split(stderr, "\n")
	var budget, timeout = -1, -1
	n := 0
	for i, l := range lines {
		if strings.HasPrefix(l, "kogen: init time budget of 2s used up; longest runs: slow ") {
			budget = i
			n++
		}
		if strings.HasPrefix(l, "kogen: slow timed out after") {
			timeout = i
		}
	}
	if n != 1 || timeout < 0 || budget < timeout {
		t.Fatalf("budget lines %d (at %d), timeout line at %d in:\n%s", n, budget, timeout, stderr)
	}
}
