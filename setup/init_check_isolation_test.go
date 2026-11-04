package setup

import "testing"

func TestInitCheckCleanupOnRejectionAndSuccess(t *testing.T) {
	parallel(t)
	setup := "echo original > generated; ln -sf generated link"
	mutation := "echo changed > README.md; rm link; mkdir link; touch link/file mutation-output"
	empty := "echo changed > generated; touch empty-output; echo '0 tests, 0 failures'"
	success := "echo changed > generated; touch success-output"
	clean := "test \"$(cat README.md)\" = original && test \"$(cat generated)\" = original && test -L link && test ! -e mutation-output && test ! -e empty-output && test ! -e success-output"
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{setup}, "fix": []any{}, "checks": initCheckList("mutation", mutation, "empty", empty, "success", success, "clean", clean), "protect": []any{},
	}))
	f.write("README.md", "original\n")
	f.commitAll("fixture")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: "+setup, "Checks: success, clean", "Left out: mutation ("+mutation+") changed README.md; empty ("+empty+") ran no tests", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration")
	checks := f.config().Checks
	if len(checks) != 2 || checks[0].Name != "success" || checks[1].Name != "clean" {
		t.Fatalf("checks: %v", checks)
	}
}

func TestInitCheckCleanupUsesBaselineIgnoreRules(t *testing.T) {
	parallel(t)
	mutate := "echo output > .gitignore; touch output; exit 1"
	clean := "test -f node_modules/installed && test ! -e output"
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{"mkdir -p node_modules && echo dependency > node_modules/installed"}, "fix": []any{}, "checks": initCheckList("mutate", mutate, "clean", clean), "protect": []any{}}))
	f.write("README.md", "fixture\n")
	f.write(".gitignore", "node_modules/\n")
	f.commitAll("fixture")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: mkdir -p node_modules && echo dependency > node_modules/installed", "Checks: clean", "Left out: mutate ("+mutate+") failed with status 1", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration")
}
