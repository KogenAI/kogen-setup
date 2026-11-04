package setup

import (
	"reflect"
	"strings"
	"testing"
)

func TestInitLeavesOutAFixerThatChangesProtectedPaths(t *testing.T) {
	parallel(t)
	rewrite := "sh -c 'printf x > tests.list; printf x > lint.cfg; printf x > a.txt'"
	later := `test "$(cat a.txt)" = a && test "$(cat lint.cfg)" = lint`
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{rewrite, later},
		"checks":  []any{map[string]any{"name": "lint", "run": "test -f lint.cfg"}},
		"protect": []any{"lint.cfg", "tests.list"}}))
	f.write("a.txt", "a\n")
	f.write("lint.cfg", "lint\n")
	f.write("tests.list", "t\n")
	f.commitAll("fixture")
	exit, out, progress, err := f.run("")
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v stdout %s progress %s", exit, err, out, progress)
	}
	if want := "Left out: fix-1 (" + rewrite + ") changed protected lint.cfg, tests.list\n"; !strings.Contains(out, want) {
		t.Errorf("stdout lacks %q:\n%s", want, out)
	}
	if strings.Contains(progress, "running fix-1 again") {
		t.Errorf("fix-1 ran again:\n%s", progress)
	}
	if !strings.Contains(progress, "kogen: running fix-2 again: "+later+"\n") {
		t.Errorf("later fixer did not run on the restored copy:\n%s", progress)
	}
	if cfg := f.config(); !reflect.DeepEqual(cfg.Fix, []string{later}) || !reflect.DeepEqual(cfg.Protect, []string{"lint.cfg", "tests.list"}) {
		t.Fatalf("config %+v", cfg)
	}
}
