package setup

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestInitOmittedSetupRestoresBeforeConsumers(t *testing.T) {
	oldTimeout := initExecTimeout
	initExecTimeout = 300 * time.Millisecond
	defer func() { initExecTimeout = oldTimeout }()
	cases := []struct{ name, command, reason string }{
		{"first failure", "echo bad > tracked; mkdir -p deps newdir; echo bad > deps/x; echo bad > newdir/x; exit 1", "failed with status 1"},
		{"second failure", "mkdir -p deps newdir; echo bad > deps/x; echo bad > newdir/x; test ! -e marker && touch marker", "second run failed"},
		{"nonrepeatable", "mkdir -p deps newdir; echo bad > deps/x; echo bad > newdir/x; echo n >> marker", "second run changed"},
		{"first timeout", "mkdir -p deps newdir; echo bad > deps/x; echo bad > newdir/x; trap 'exit 0' TERM; while :; do :; done", "timed out"},
		{"second timeout", "mkdir -p deps newdir; echo bad > deps/x; echo bad > newdir/x; if test -e marker; then trap 'exit 0' TERM; while :; do :; done; fi; touch marker", "timed out"},
		{"tracked mutation", "echo bad > tracked; mkdir -p deps newdir; echo bad > deps/x; echo bad > newdir/x", "changed tracked"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clean := `test "$(cat tracked)" = original && test "$(cat deps/old)" = kept && test -d kept && test ! -e deps/x && test ! -e newdir && test ! -e marker`
			fix := clean + " && test -f tracked"
			kept := "mkdir -p kept deps; echo kept > deps/old"
			f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{kept, tc.command, clean}, "fix": []any{fix}, "checks": initCheckList("clean", clean, "leak", "test -e newdir/x"), "protect": []any{}}))
			f.write("tracked", "original\n")
			f.write(".gitignore", "deps/\n")
			f.commitAll("fixture")
			log := filepath.Join(filepath.Dir(f.repo), "runner")
			f.env = append(f.env, "RUNNER_LOG="+log)
			f.program("node", clean+` || { echo dirty > "$RUNNER_LOG"; exit 1; }
echo clean > "$RUNNER_LOG"
[ -n "$KOGEN_ACCEPTANCE_REPORT" ] && echo '{}' > "$KOGEN_ACCEPTANCE_REPORT"
exit 0`)
			out, _ := f.mustRun()
			if !strings.Contains(out, tc.reason) {
				t.Fatalf("missing omission %q: %s", tc.reason, out)
			}
			cfg := f.config()
			if !reflect.DeepEqual(cfg.Setup, []string{kept, clean}) {
				t.Fatalf("setup: %#v", cfg.Setup)
			}
			if len(cfg.Checks) != 1 || cfg.Checks[0].Name != "clean" {
				t.Fatalf("checks: %#v", cfg.Checks)
			}
			if !reflect.DeepEqual(cfg.Fix, []string{fix}) {
				t.Fatalf("fix: %#v", cfg.Fix)
			}
			data, err := os.ReadFile(log)
			if err != nil || string(data) != "clean\n" {
				t.Fatalf("runner: %q %v", data, err)
			}
			if f.read("tracked") != "original\n" || f.exists("deps/x") || f.exists("newdir") {
				t.Fatal("real checkout changed")
			}
		})
	}
}

func TestInitOmissionPreservesKeptHardLinks(t *testing.T) {
	kept := "mkdir -p deps; echo kept > deps/a; ln -f deps/a deps/b"
	clean := "test deps/a -ef deps/b"
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{kept, "touch stray; exit 1", clean}, "fix": []any{}, "checks": initCheckList("links", clean), "protect": []any{}}))
	f.write(".gitignore", "deps/\n")
	f.commitAll("fixture")
	f.mustRun()
	cfg := f.config()
	if !reflect.DeepEqual(cfg.Setup, []string{kept, clean}) || len(cfg.Checks) != 1 || cfg.Checks[0].Name != "links" {
		t.Fatalf("hard links lost after omission: setup=%#v checks=%#v", cfg.Setup, cfg.Checks)
	}
}
