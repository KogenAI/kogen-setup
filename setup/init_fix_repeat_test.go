package setup

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func initFixRepeatRun(t *testing.T, fix ...any) (*initFx, string, string) {
	t.Helper()
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": fix, "checks": []any{}, "protect": []any{}}))
	f.write("f.txt", "a\n")
	f.write("list.txt", "b\na\n")
	f.commitAll("fixture")
	exit, out, progress, err := f.run("")
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v stdout %s progress %s", exit, err, out, progress)
	}
	return f, out, progress
}

func TestInitLeavesOutAFixerThatChangesFilesOnEveryRun(t *testing.T) {
	parallel(t)
	appender := "printf x >> f.txt"
	restored := `test "$(cat f.txt)" = a`
	untracked := "printf x >> notes.txt"
	gone := "test ! -e notes.txt"
	f, out, progress := initFixRepeatRun(t, appender, restored, untracked, gone)
	for _, want := range []string{
		"fix-1 (" + appender + ") is not repeatable: its second run changed f.txt",
		"fix-3 (" + untracked + ") is not repeatable: its second run changed notes.txt",
		"Fix: " + restored + "; " + gone,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("stdout lacks %q:\n%s", want, out)
		}
	}
	for _, want := range []string{"kogen: running fix-1 again: " + appender + "\n", "kogen: running fix-4 again: " + gone + "\n"} {
		if !strings.Contains(progress, want) {
			t.Errorf("progress lacks %q:\n%s", want, progress)
		}
	}
	if cfg := f.config(); !reflect.DeepEqual(cfg.Fix, []string{restored, gone}) {
		t.Fatalf("config %+v", cfg)
	}
}

func TestInitKeepsAStableFixerAndOneThatChangesNothing(t *testing.T) {
	parallel(t)
	sorted := "sort -o list.txt list.txt"
	nothing := "test -f f.txt"
	f, out, progress := initFixRepeatRun(t, sorted, nothing)
	if !strings.Contains(out, "Fix: "+sorted+"; "+nothing+"\n") || strings.Contains(out, "Left out:") {
		t.Errorf("stdout:\n%s", out)
	}
	for _, want := range []string{"kogen: running fix-1 again: " + sorted + "\n", "kogen: running fix-2 again: " + nothing + "\n"} {
		if !strings.Contains(progress, want) {
			t.Errorf("progress lacks %q:\n%s", want, progress)
		}
	}
	if cfg := f.config(); !reflect.DeepEqual(cfg.Fix, []string{sorted, nothing}) {
		t.Fatalf("config %+v", cfg)
	}
}

func TestInitLeavesOutAFixerWhoseSecondRunFails(t *testing.T) {
	parallel(t)
	once := "sh -c 'test -f once || { touch once; exit 0; }; echo second-output; exit 3'"
	gone := "test ! -e once"
	f, out, progress := initFixRepeatRun(t, once, gone)
	if !strings.Contains(out, "Fix: "+gone+"\n") || !strings.Contains(out, "Left out: fix-1 ("+once+") is not repeatable: its second run failed with status 3\n") {
		t.Errorf("stdout:\n%s", out)
	}
	if !strings.Contains(progress, "kogen: running fix-1 again: "+once+"\n  | second-output\n") {
		t.Errorf("progress:\n%s", progress)
	}
	if cfg := f.config(); !reflect.DeepEqual(cfg.Fix, []string{gone}) {
		t.Fatalf("config %+v", cfg)
	}
}

func TestInitLeavesOutAFixerWhoseSecondRunTimesOut(t *testing.T) {
	old := initExecTimeout
	initExecTimeout = 2 * time.Second
	defer func() { initExecTimeout = old }()
	slow := "if test -e .ran; then sleep 30; else touch .ran; fi"
	gone := "test ! -e .ran"
	_, out, _ := initFixRepeatRun(t, slow, gone)
	if !strings.Contains(out, "Fix: "+gone+"\n") || !strings.Contains(out, "Left out: fix-1 ("+slow+") is not repeatable: its second run timed out after 10m\n") {
		t.Errorf("stdout:\n%s", out)
	}
}
