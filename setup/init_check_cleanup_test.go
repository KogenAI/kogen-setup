package setup

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitCheckCleanupRestoresTheCopy(t *testing.T) {
	parallel(t)
	mutate := "rmdir emptydir; rm tracked/file; echo changed > README.md; mkdir -p newdir/sub; touch newdir/sub/leftover top-leftover; mkdir tracked/extra; touch tracked/extra/leftover; exit 1"
	clean := "test -d emptydir && test -f tracked/file && test \"$(cat README.md)\" = original && test ! -e newdir && test ! -e top-leftover && test ! -e tracked/extra"
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{"mkdir -p emptydir"}, "fix": []any{}, "checks": initCheckList("mutate", mutate, "clean", clean), "protect": []any{}}))
	f.write("README.md", "original\n")
	f.write("tracked/file", "content\n")
	f.commitAll("fixture")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: mkdir -p emptydir", "Fix: none", "Checks: clean", "Protect: none", "Left out: mutate ("+mutate+") failed with status 1", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration")
}

func TestInitCheckCleanupSendsNoForbiddenGitCommand(t *testing.T) {
	parallel(t)
	mutate := "echo changed > README.md; touch leftover; mkdir out; exit 1"
	clean := "test \"$(cat README.md)\" = original && test ! -e leftover && test ! -e out"
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": initCheckList("mutate", mutate, "clean", clean), "protect": []any{}}))
	f.write("README.md", "original\n")
	f.commitAll("fixture")
	realGit, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	log := filepath.Join(t.TempDir(), "calls")
	f.program("git", "for a in \"$@\"; do printf '%s\\n' \"$a\"; done | tr '\\n' ' ' >> '"+log+"'; echo >> '"+log+"'\nexec '"+realGit+"' \"$@\"")
	f.mustRun()
	data, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	bound := 0
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.Contains(line, "--git-dir=") {
			continue
		}
		bound++
		for _, word := range strings.Fields(line) {
			if strings.HasPrefix(word, "-") {
				continue
			}
			for _, forbidden := range []string{"clean", "restore", "reset", "checkout", "symbolic-ref", "worktree", "remote"} {
				if word == forbidden {
					t.Fatalf("repo-bound runner sent %q: %s", forbidden, line)
				}
			}
			break
		}
	}
	if bound == 0 {
		t.Fatalf("no repo-bound git call was recorded: %s", data)
	}
}

func TestInitCheckCleanupKeepsProtectedIgnoredPaths(t *testing.T) {
	parallel(t)
	setup := "mkdir -p node_modules && echo dependency > node_modules/installed && echo kept > keep.cache"
	mutate := "echo changed > node_modules/installed; touch node_modules/new new.cache; mkdir build; touch build/out; exit 1"
	clean := "test \"$(cat node_modules/installed)\" = dependency && test -f keep.cache && test ! -e node_modules/new && test ! -e new.cache && test ! -e build"
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{setup}, "fix": []any{}, "checks": initCheckList("mutate", mutate, "clean", clean), "protect": []any{}}))
	f.write("README.md", "fixture\n")
	f.write(".gitignore", "node_modules/\n*.cache\nbuild/\n")
	f.commitAll("fixture")
	f.mustRun()
}
