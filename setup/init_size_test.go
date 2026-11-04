package setup

import (
	"fmt"
	"slices"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

func sizeProblem(list string, n, max int) string {
	return fmt.Sprintf("%s has %d entries; at most %d are allowed; keep the ones the project needs", list, n, max)
}

func sizeArgs(setup, fix, checks, protect int) (map[string]any, InitContext) {
	args := map[string]any{}
	var ctx InitContext
	if setup > 0 {
		var l []any
		for i := 1; i <= setup; i++ {
			l = append(l, fmt.Sprintf("mkdir -p build/s%02d", i))
		}
		args["setup"] = l
	}
	if fix > 0 {
		var l []any
		for i := 1; i <= fix; i++ {
			l = append(l, fmt.Sprintf("gofmt -w pkg%02d", i))
		}
		args["fix"] = l
	}
	if checks > 0 {
		var l []any
		for i := 1; i <= checks; i++ {
			l = append(l, map[string]any{"name": fmt.Sprintf("check-%02d", i), "run": fmt.Sprintf("go vet ./pkg%02d", i)})
		}
		args["checks"] = l
	}
	if protect > 0 {
		var l []any
		for i := 1; i <= protect; i++ {
			p := fmt.Sprintf("docs/p%02d.md", i)
			l = append(l, p)
			ctx.Tracked = append(ctx.Tracked, p)
		}
		args["protect"] = l
	}
	return args, ctx
}

func TestInitValidateProposalSize(t *testing.T) {
	detected := []project.Check{
		{Name: "detected-1", Run: "go test ./detected1"},
		{Name: "detected-2", Run: "go test ./detected2"},
		{Name: "detected-3", Run: "go test ./detected3"},
	}
	tests := []struct {
		name                        string
		setup, fix, checks, protect int
		detected                    bool
		want                        []string
	}{
		{name: "setup over", setup: 21, want: []string{sizeProblem("setup", 21, 20)}},
		{name: "fix over", fix: 11, want: []string{sizeProblem("fix", 11, 10)}},
		{name: "checks over", checks: 21, want: []string{sizeProblem("checks", 21, 20)}},
		{name: "protect over", protect: 51, want: []string{sizeProblem("protect", 51, 50)}},
		{name: "all at cap", setup: 20, fix: 10, checks: 20, protect: 50},
		{name: "two over", setup: 20, fix: 11, checks: 20, protect: 51, want: []string{sizeProblem("fix", 11, 10), sizeProblem("protect", 51, 50)}},
		{name: "detected not counted over", checks: 21, detected: true, want: []string{sizeProblem("checks", 21, 20)}},
		{name: "detected not counted at cap", checks: 20, detected: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			args, ctx := sizeArgs(tc.setup, tc.fix, tc.checks, tc.protect)
			if tc.detected {
				ctx.DetectedChecks = detected
			}
			proposal, problems := Validate(args, ctx)
			slices.Sort(problems)
			want := slices.Clone(tc.want)
			slices.Sort(want)
			if !slices.Equal(problems, want) && (len(problems) != 0 || len(want) != 0) {
				t.Fatalf("problems %q, want %q", problems, want)
			}
			if len(want) > 0 {
				if len(proposal.Setup)+len(proposal.Fix)+len(proposal.Checks)+len(proposal.Protect) != 0 {
					t.Fatalf("proposal %+v, want zero", proposal)
				}
				return
			}
			if len(proposal.Setup) != tc.setup || len(proposal.Fix) != tc.fix || len(proposal.Checks) != tc.checks || len(proposal.Protect) != tc.protect {
				t.Fatalf("proposal %+v lost entries", proposal)
			}
			if tc.detected {
				merged := Merge(project.Detected{Checks: detected}, proposal)
				if len(merged.Checks) != 23 {
					t.Fatalf("Merge returned %d checks, want 23", len(merged.Checks))
				}
			}
		})
	}
}

func TestInitValidateProposalSizeEdges(t *testing.T) {
	var strs21 []string
	var maps21 []map[string]any
	var dup51 []any
	var tests21 []any
	for i := 1; i <= 21; i++ {
		strs21 = append(strs21, fmt.Sprintf("mkdir -p build/s%02d", i))
		maps21 = append(maps21, map[string]any{"name": fmt.Sprintf("check-%02d", i), "run": fmt.Sprintf("go vet ./pkg%02d", i)})
		tests21 = append(tests21, fmt.Sprintf("go test ./pkg%02d", i))
	}
	for i := 0; i < 51; i++ {
		dup51 = append(dup51, "docs/a.md")
	}
	tests := []struct {
		name string
		args map[string]any
		want []string
	}{
		{"setup not a list", map[string]any{"setup": "mkdir -p build"}, []string{"setup must be a list"}},
		{"setup list of objects", map[string]any{"setup": maps21}, []string{"setup must be a list"}},
		{"checks list of strings", map[string]any{"checks": strs21}, []string{"checks must be a list"}},
		{"setup string list over", map[string]any{"setup": strs21}, []string{sizeProblem("setup", 21, 20)}},
		{"checks object list over", map[string]any{"checks": maps21}, []string{sizeProblem("checks", 21, 20)}},
		{"protect counted before duplicates drop", map[string]any{"protect": dup51}, []string{sizeProblem("protect", 51, 50)}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, problems := Validate(tc.args, InitContext{Root: "/work/p", Tracked: []string{"docs/a.md"}})
			if !slices.Equal(problems, tc.want) {
				t.Fatalf("problems %q, want %q", problems, tc.want)
			}
		})
	}
	t.Run("entry problems still reported", func(t *testing.T) {
		_, problems := Validate(map[string]any{"setup": tests21}, InitContext{Root: "/work/p"})
		if len(problems) != 22 || !slices.Contains(problems, sizeProblem("setup", 21, 20)) || !slices.Contains(problems, "setup command go test ./pkg01 runs tests or linting; put it in checks") {
			t.Fatalf("problems %q", problems)
		}
	})
}
