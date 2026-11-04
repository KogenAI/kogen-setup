package setup

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func initFixBreaksRun(t *testing.T, checks []any, fix ...any) (*initFx, string, string) {
	t.Helper()
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": fix, "checks": checks, "protect": []any{}}))
	f.write("state.txt", "ok\n")
	f.commitAll("fixture")
	exit, out, progress, err := f.run("")
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v stdout %s progress %s", exit, err, out, progress)
	}
	return f, out, progress
}

func TestInitRerunsKeptChecksAfterEachFixerAndLeavesOutOneThatBreaksACheck(t *testing.T) {
	parallel(t)
	ok := `test "$(cat state.txt)" = ok`
	bad := "printf bad > state.txt"
	harmless := "printf ok > other.txt"
	f, out, progress := initFixBreaksRun(t, initCheckList("t", ok, "gone", "test -f missing.txt", "present", "test -f state.txt"), bad, harmless)
	for _, want := range []string{
		"Fix: " + harmless + "\n",
		"Checks: t, present\n",
		"Left out: gone (test -f missing.txt) failed with status 1; fix-1 (" + bad + ") breaks check t (" + ok + "): failed with status 1\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("stdout lacks %q:\n%s", want, out)
		}
	}
	var after []string
	for _, line := range strings.Split(progress, "\n") {
		if strings.Contains(line, " after fix-") {
			after = append(after, line)
		}
	}
	// The first failing rerun stops fix-1's reruns; fix-2 is rerun on the restored tree.
	want := []string{
		"kogen: checking t after fix-1: " + ok,
		"kogen: checking t after fix-2: " + ok,
		"kogen: checking present after fix-2: test -f state.txt",
	}
	if !reflect.DeepEqual(after, want) {
		t.Errorf("reruns %q, want %q", after, want)
	}
	cfg := f.config()
	if !reflect.DeepEqual(cfg.Fix, []string{harmless}) || len(cfg.Checks) != 2 {
		t.Fatalf("config %+v", cfg)
	}
	if f.read("state.txt") != "ok\n" || f.dirtyPaths() != "" {
		t.Fatalf("working tree changed: %q", f.dirtyPaths())
	}
}

func TestInitShowsTheOutputOfTheCheckAFixerBreaks(t *testing.T) {
	parallel(t)
	_, _, progress := initFixBreaksRun(t, initCheckList("t", `test "$(cat state.txt)" = ok || { echo state-is-wrong; exit 4; }`), "printf bad > state.txt")
	if !strings.Contains(progress, "  | state-is-wrong\n") {
		t.Errorf("progress lacks the check output:\n%s", progress)
	}
}

func TestInitRerunsLeaveTheCopyAsTheyFoundIt(t *testing.T) {
	parallel(t)
	build := "touch build.out"
	nobuild := "test ! -e build.out"
	f, out, _ := initFixBreaksRun(t, initCheckList("build", build), "printf ok > other.txt", nobuild)
	if !strings.Contains(out, "Fix: printf ok > other.txt; "+nobuild+"\n") || strings.Contains(out, "Left out:") {
		t.Errorf("stdout:\n%s", out)
	}
	if cfg := f.config(); len(cfg.Fix) != 2 || len(cfg.Checks) != 1 {
		t.Fatalf("config %+v", cfg)
	}
}

func TestInitCapsAFixerRerunByTheRemainingBudget(t *testing.T) {
	oldBudget, oldTimeout := initVerifyLimit, initExecTimeout
	initVerifyLimit, initExecTimeout = 4*time.Second, 10*time.Second
	defer func() { initVerifyLimit, initExecTimeout = oldBudget, oldTimeout }()
	slow := "if test -e .slow; then sleep 30; fi"
	f, out, _ := initFixBreaksRun(t, initCheckList("slow", slow), "touch .slow")
	want := "fix-1 (touch .slow) breaks check slow (" + slow + "): timed out: init time budget of 4s used up"
	if !strings.Contains(out, "Left out: "+want+"\n") {
		t.Errorf("stdout lacks %q:\n%s", want, out)
	}
	if cfg := f.config(); len(cfg.Fix) != 0 || len(cfg.Checks) != 1 {
		t.Fatalf("config %+v", cfg)
	}
}
