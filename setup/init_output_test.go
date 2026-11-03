package setup

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestInitOutputTail(t *testing.T) {
	for _, n := range []int{19, 20, 21} {
		var input, want []string
		for i := 0; i < n; i++ {
			input = append(input, fmt.Sprint(i))
		}
		start := 0
		if n > 20 {
			start = n - 20
		}
		for _, line := range input[start:] {
			want = append(want, "  | "+line)
		}
		if got := initOutputTail(strings.Join(input, "\n") + "\n"); !reflect.DeepEqual(got, want) {
			t.Errorf("%d lines: %q, want %q", n, got, want)
		}
	}
	for _, n := range []int{199, 200, 201} {
		line := strings.Repeat("界", n)
		want := "  | " + strings.Repeat("界", min(n, 200))
		if got := initOutputTail(line); !reflect.DeepEqual(got, []string{want}) {
			t.Errorf("width %d: %q", n, got)
		}
	}
	for _, tc := range []struct {
		input string
		want  []string
	}{
		{"", nil}, {"one\n", []string{"  | one"}}, {"one\n\ntwo\n", []string{"  | one", "  | ", "  | two"}}, {"\n", []string{"  | "}},
	} {
		if got := initOutputTail(tc.input); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%q: %q want %q", tc.input, got, tc.want)
		}
	}
}

func TestInitLeftOutOutputAndConfiguration(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{"echo setup-out; echo setup-err >&2; exit 4", "echo retained-setup"},
		"fix":   []any{}, "checks": []any{map[string]any{"name": "bad", "run": "echo check-out; echo check-err >&2; exit 7"}, map[string]any{"name": "good", "run": "echo retained-check"}}, "protect": []any{},
	}))
	f.write("README.md", "x\n")
	f.commitAll("notes")
	exit, out, stderr, err := f.run("")
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v stdout %s stderr %s", exit, err, out, stderr)
	}
	for _, block := range []string{
		"kogen: running setup-1: echo setup-out; echo setup-err >&2; exit 4\n  | setup-out\n  | setup-err\n",
		"kogen: checking bad: echo check-out; echo check-err >&2; exit 7\n  | check-out\n  | check-err\n",
	} {
		if !strings.Contains(stderr, block) {
			t.Errorf("missing block %q in %q", block, stderr)
		}
	}
	if strings.Contains(stderr, "  | retained-") {
		t.Errorf("retained output in stderr: %s", stderr)
	}
	if !strings.Contains(out, "Left out: setup-1 (echo setup-out; echo setup-err >&2; exit 4) failed with status 4; bad (echo check-out; echo check-err >&2; exit 7) failed with status 7") {
		t.Errorf("stdout: %s", out)
	}
	cfg := f.config()
	if !reflect.DeepEqual(cfg.Setup, []string{"echo retained-setup"}) || len(cfg.Checks) != 1 || cfg.Checks[0].Name != "good" || cfg.Checks[0].Run != "echo retained-check" {
		t.Errorf("config: %+v", cfg)
	}
}

func TestInitLeftOutIncludesNewlyIneligibleProtection(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{},
		"checks":  initCheckList("lint", "npm run lint", "ok", "true"),
		"protect": []any{"package.json"},
	}))
	f.write("package.json", `{"scripts":{"lint":"eslint ."}}`)
	f.commitAll("notes")
	exit, out, stderr, err := f.run("")
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v stdout %s stderr %s", exit, err, out, stderr)
	}
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: none", "Checks: ok", "Left out: lint (npm run lint) failed with status 2; package.json", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration")
	if cfg := f.config(); len(cfg.Protect) != 0 {
		t.Fatalf("protect: %v", cfg.Protect)
	}
}

func TestInitFailedFixerOutputBoundaries(t *testing.T) {
	parallel(t)
	var commands []any
	var blocks []string
	for _, n := range []int{19, 20, 21} {
		cmd := fmt.Sprintf(`i=1; while [ "$i" -le %d ]; do echo "$i"; i=$((i+1)); done; exit 5`, n)
		commands = append(commands, cmd)
		block := fmt.Sprintf("kogen: running fix-%d: %s\n", len(commands), cmd)
		for i := max(1, n-19); i <= n; i++ {
			block += fmt.Sprintf("  | %d\n", i)
		}
		blocks = append(blocks, block)
	}
	for _, n := range []int{199, 200, 201} {
		cmd := fmt.Sprintf(`printf '%%0%dd\n' 0; exit 5`, n)
		commands = append(commands, cmd)
		blocks = append(blocks, fmt.Sprintf("kogen: running fix-%d: %s\n  | %s\n", len(commands), cmd, strings.Repeat("0", min(n, 200))))
	}
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": commands, "checks": []any{}, "protect": []any{},
	}))
	f.write("README.md", "x\n")
	f.commitAll("notes")
	_, stderr := f.mustRun()
	for i, block := range blocks {
		if i+1 < len(blocks) {
			block += strings.SplitN(blocks[i+1], "\n", 2)[0] + "\n"
		}
		if !strings.Contains(stderr, block) {
			t.Errorf("missing fixer block %d: %q in %q", i+1, block, stderr)
		}
	}
	if cfg := f.config(); len(cfg.Fix) != 0 {
		t.Fatalf("config: %+v", cfg)
	}
}
