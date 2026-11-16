package setup

import "testing"

type runnersCase struct {
	output string
	want   bool
}

func checkRunnersCases(t *testing.T, cases []runnersCase) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.output, func(t *testing.T) {
			if got := initRanNoTests(tc.output); got != tc.want {
				t.Fatalf("initRanNoTests(%q) = %v, want %v", tc.output, got, tc.want)
			}
		})
	}
}

func TestInitNoTestsRunnersMinitest(t *testing.T) {
	checkRunnersCases(t, []runnersCase{
		{"0 runs, 0 assertions, 0 failures, 0 errors, 0 skips", true},
		{"1676 runs, 6242 assertions, 0 failures, 0 errors, 2 skips", false},
		{"0 runs, 0 assertions, 0 failures, 0 errors, 0 skips\n1 runs, 2 assertions, 0 failures, 0 errors, 0 skips", false},
	})
}

func TestInitNoTestsRunnersRSpec(t *testing.T) {
	checkRunnersCases(t, []runnersCase{
		{"0 examples, 0 failures", true},
		{"1 example, 0 failures", false},
		{"12 examples, 0 failures", false},
		{"0 examples, 0 failures\n1 example, 0 failures", false},
	})
}

func TestInitNoTestsRunnersCargo(t *testing.T) {
	zero := "test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out"
	one := "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out"
	checkRunnersCases(t, []runnersCase{
		{"running 0 tests\n" + zero, true},
		{"running 1 test\n" + one + "\nrunning 0 tests\n" + zero, false},
	})
}

func TestInitNoTestsRunnersGoNoTestsToRun(t *testing.T) {
	checkRunnersCases(t, []runnersCase{
		{"ok   example/a 0.003s [no tests to run]", true},
		{"ok   example/a 0.003s", false},
		{"?    example/a [no test files]\nok   example/b 0.01s", false},
		{"ok   example/a 0.003s [no tests to run]\n?    example/b [no test files]", true},
	})
}

func TestInitNoTestsRunnersSingularCounts(t *testing.T) {
	checkRunnersCases(t, []runnersCase{
		{"0 tests, 0 failures\n1 test, 0 failures", false},
		{"Ran 0 tests in 0.000s\nRan 1 test in 0.001s", false},
	})
}

func TestInitNoTestsRunnersBothRuns(t *testing.T) {
	parallel(t)
	command := "if test -e .empty; then echo '0 runs, 0 assertions, 0 failures, 0 errors, 0 skips'; else touch .empty; echo '5 runs, 9 assertions, 0 failures, 0 errors, 0 skips'; fi"
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{}, "checks": initCheckList("minitest", command), "protect": []any{},
	}))
	f.write("README.md", "x\n")
	f.commitAll("notes")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: none", "Fix: none", "Checks: none passed", "Protect: none", "Left out: minitest ("+command+") ran no tests", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration", initNextChecks)
	if checks := f.config().Checks; len(checks) != 0 {
		t.Fatalf("checks: %v", checks)
	}
}
