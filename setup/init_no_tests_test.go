package setup

import "testing"

func TestInitRanNoTests(t *testing.T) {
	cases := []struct {
		output string
		want   bool
	}{
		{"?   example/a [no test files]", true},
		{"?   example/a\t[no test files]\n?   example/b [no test files]", true},
		{"0 tests, 0 failures", true},
		{"Ran 0 tests", true},
		{"No tests found", true},
		{"0 passing", true},
		{"", false},
		{"unrecognized output", false},
		{"3 tests, 0 failures", false},
		{"0 tests, 0 failures\n3 tests, 0 failures", false},
		{"Ran 0 tests\nRan 1 tests", false},
		{"No tests found\n1 passing", false},
		{"0 passing\n1 passing", false},
		{"?   example/a [no test files]\nok   example/b 0.01s", false},
		{"?   example/a [no test files]\nPASS", false},
	}
	for _, tc := range cases {
		t.Run(tc.output, func(t *testing.T) {
			if got := initRanNoTests(tc.output); got != tc.want {
				t.Fatalf("initRanNoTests(%q) = %v, want %v", tc.output, got, tc.want)
			}
		})
	}
}

func TestInitExcludesCheckThatRanNoTests(t *testing.T) {
	parallel(t)
	command := "env printf '0 tests, 0 failures'"
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{}, "checks": initCheckList("sample", command), "protect": []any{},
	}))
	f.write("README.md", "x\n")
	f.commitAll("notes")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: none", "Checks: none passed", "Left out: sample ("+command+") ran no tests", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration", initNextChecks)
	if checks := f.config().Checks; len(checks) != 0 {
		t.Fatalf("checks: %v", checks)
	}
}
