package setup

import (
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-verification/verify"
)

func TestInitDurationText(t *testing.T) {
	for d, want := range map[time.Duration]string{30 * time.Minute: "30m", 2 * time.Second: "2s", time.Minute: "1m", 1500 * time.Millisecond: "1.5s"} {
		if got := initDurationText(d); got != want {
			t.Fatalf("%v: got %q, want %q", d, got, want)
		}
	}
}

func TestInitVerifyBudgetStopsRemainingCommands(t *testing.T) {
	oldBudget, oldTimeout := initVerifyLimit, initExecTimeout
	initVerifyLimit, initExecTimeout = 3*time.Second, 10*time.Second
	defer func() { initVerifyLimit, initExecTimeout = oldBudget, oldTimeout }()
	setup := "echo setup >> \"$RUN_LOG\""
	later := "echo later >> \"$RUN_LOG\""
	fix := "echo fix >> \"$RUN_LOG\""
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{setup}, "fix": []any{fix}, "checks": initCheckList("slow", "sleep 30", "later", later), "protect": []any{}}), initNothing())
	f.write("tracked", "original\n")
	f.commitAll("fixture")
	f.env = append(f.env, "RUN_LOG="+filepath.Join(filepath.Dir(f.repo), "run.log"))
	start := time.Now()
	out, _ := f.mustRun()
	if time.Since(start) > 9*time.Second {
		t.Fatalf("init ran %v", time.Since(start))
	}
	want := "Left out: slow (sleep 30) timed out: init time budget of 3s used up; later (" + later + ") not verified: init time budget of 3s used up; fix-1 (" + fix + ") not verified: init time budget of 3s used up"
	if !strings.Contains(out, want) {
		t.Fatalf("missing %q in:\n%s", want, out)
	}
	cfg := f.config()
	if !reflect.DeepEqual(cfg.Setup, []string{setup}) || len(cfg.Checks) != 0 || len(cfg.Fix) != 0 {
		t.Fatalf("configuration: %+v", cfg)
	}
}

func TestInitExecRunsCommandVerbatimAndStopsOnTimeout(t *testing.T) {
	s := sys.New()
	dir := t.TempDir()
	r, err := initExec(s, verify.Tools{}, `printf '%s\n' "it's"; echo "$0" >/dev/null; exit 3`, dir, time.Minute)
	if err != nil || r.Status != 3 || r.Output != "it's\n" || r.TimedOut {
		t.Fatalf("result %+v, err %v", r, err)
	}
	start := time.Now()
	r, err = initExec(s, verify.Tools{}, "sleep 30; echo after", dir, 300*time.Millisecond)
	if err != nil || !r.TimedOut || r.Output != "" {
		t.Fatalf("result %+v, err %v", r, err)
	}
	if time.Since(start) > 10*time.Second {
		t.Fatalf("timeout took %v", time.Since(start))
	}
	for _, g := range s.Groups() {
		if syscall.Kill(-g, 0) != syscall.ESRCH {
			t.Fatalf("process group %d still alive", g)
		}
	}
}
