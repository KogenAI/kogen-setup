package setup

import (
	"fmt"
	"strings"
	"testing"
)

func initPathListFiles(prefix, ext string) []string {
	var names []string
	for i := 1; i <= 7; i++ {
		names = append(names, fmt.Sprintf("%s%d.%s", prefix, i, ext))
	}
	return names
}

// initPathListCommand joins one shell step per path, each using op ({"x" > name or >> name).
func initPathListCommand(redirect string, names []string) string {
	var steps []string
	for _, n := range names {
		steps = append(steps, "printf x "+redirect+" "+n)
	}
	return strings.Join(steps, " && ")
}

func initPathListRun(t *testing.T, proposal map[string]any, names []string, content string, protect bool) string {
	t.Helper()
	f := initNewFx(t, true, initSubmit(proposal))
	for _, n := range names {
		f.write(n, content)
	}
	f.commitAll("fixture")
	exit, out, progress, err := f.run("")
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v stdout %s progress %s", exit, err, out, progress)
	}
	return out
}

func TestInitPathListCheckChangedFiles(t *testing.T) {
	parallel(t)
	names := initPathListFiles("f", "txt")
	cmd := "echo x > f1.txt && echo x > f2.txt && echo x > f3.txt && echo x > f4.txt && echo x > f5.txt && echo x > f6.txt && echo x > f7.txt"
	out := initPathListRun(t, map[string]any{"setup": []any{}, "fix": []any{}, "protect": []any{},
		"checks": []any{map[string]any{"name": "mutate", "run": cmd}}}, names, "a", false)
	want := "Left out: mutate (" + cmd + ") changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more"
	if !strings.Contains(out, want) {
		t.Errorf("stdout lacks %q:\n%s", want, out)
	}
	if strings.Contains(out, "...") {
		t.Errorf("stdout still truncates with dots:\n%s", out)
	}
}

func TestInitPathListSetupSecondRun(t *testing.T) {
	parallel(t)
	cmd := initPathListCommand(">>", initPathListFiles("f", "txt"))
	out := initPathListRun(t, map[string]any{"setup": []any{cmd}, "fix": []any{}, "protect": []any{},
		"checks": []any{}}, initPathListFiles("f", "txt"), "a", false)
	want := "setup-1 (" + cmd + ") is not repeatable: its second run changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more"
	if !strings.Contains(out, want) {
		t.Errorf("stdout lacks %q:\n%s", want, out)
	}
}

func TestInitPathListFixerSecondRun(t *testing.T) {
	parallel(t)
	cmd := initPathListCommand(">>", initPathListFiles("f", "txt"))
	out := initPathListRun(t, map[string]any{"setup": []any{}, "fix": []any{cmd}, "protect": []any{},
		"checks": []any{}}, initPathListFiles("f", "txt"), "a", false)
	want := "fix-1 (" + cmd + ") is not repeatable: its second run changed f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more"
	if !strings.Contains(out, want) {
		t.Errorf("stdout lacks %q:\n%s", want, out)
	}
}

func TestInitPathListFixerChangedProtected(t *testing.T) {
	parallel(t)
	names := initPathListFiles("p", "cfg")
	cmd := initPathListCommand(">", names)
	protect := make([]any, len(names))
	for i, n := range names {
		protect[i] = n
	}
	out := initPathListRun(t, map[string]any{"setup": []any{}, "fix": []any{cmd}, "protect": protect,
		"checks": []any{}}, names, "a", true)
	want := "fix-1 (" + cmd + ") changed protected p1.cfg, p2.cfg, p3.cfg, p4.cfg, p5.cfg and 2 more"
	if !strings.Contains(out, want) {
		t.Errorf("stdout lacks %q:\n%s", want, out)
	}
}

func TestInitPathListSingularRemainder(t *testing.T) {
	parallel(t)
	if got, want := initPathList([]string{"a", "b", "c", "d", "e", "f"}), "a, b, c, d, e and 1 more"; got != want {
		t.Errorf("initPathList of six paths = %q, want %q", got, want)
	}
	if got, want := initPathList([]string{"a", "b", "c", "d", "e"}), "a, b, c, d, e"; got != want {
		t.Errorf("initPathList of five paths = %q, want %q", got, want)
	}
}
