package setup

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestInitKeepsCheckThatReadsGitFiles(t *testing.T) {
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("tracked", `test -n "$(git ls-files)"`)}), initNothing())
	f.write("README.md", "# Git copy\n")
	f.commitAll("notes")
	out, _ := f.mustRun()
	if !strings.Contains(out, "Checks: tracked\n") || strings.Contains(out, "Left out") || strings.Contains(out, "failed with status") {
		t.Fatalf("stdout:\n%s", out)
	}
	cfg := f.config()
	if len(cfg.Checks) != 1 || cfg.Checks[0].Name != "tracked" {
		t.Fatalf("checks: %+v", cfg.Checks)
	}
}

func TestInitStillDropsFailingCheckInGitCopy(t *testing.T) {
	command := "git ls-files > /dev/null; exit 1"
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("tracked", command)}), initNothing())
	f.write("README.md", "# Git copy\n")
	f.commitAll("notes")
	out, _ := f.mustRun()
	for _, want := range []string{"Checks: none passed\n", "Left out: tracked (" + command + ") failed with status 1\n"} {
		if !strings.Contains(out, want) {
			t.Fatalf("stdout lacks %q:\n%s", want, out)
		}
	}
	if cfg := f.config(); len(cfg.Checks) != 0 {
		t.Fatalf("checks: %+v", cfg.Checks)
	}
}

// initHookFiles lists the entries of the repository's .git/hooks with their contents.
func initHookFiles(t *testing.T, repo string) map[string]string {
	t.Helper()
	got := map[string]string{}
	filepath.WalkDir(filepath.Join(repo, ".git", "hooks"), func(name string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			b, _ := os.ReadFile(name)
			got[name] = string(b)
		}
		return nil
	})
	return got
}

func TestInitGitCopyLeavesRealRepositoryAlone(t *testing.T) {
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("probe", "sh probe.sh")}), initNothing())
	f.write("README.md", "# Git copy\n")
	f.write("probe.sh", "git ls-files --error-unmatch probe.sh >/dev/null || exit 1\ngit commit --allow-empty -m probe\ngit config user.name probe\nexit 0\n")
	f.commitAll("notes")
	before := f.head()
	config := f.git("config", "--local", "--list")
	hooks := initHookFiles(t, f.repo)
	out, _ := f.mustRun()
	if !strings.Contains(out, "Checks: probe\n") {
		t.Fatalf("stdout:\n%s", out)
	}
	if parent := strings.TrimSpace(f.git("rev-parse", "HEAD~1")); parent != before {
		t.Fatalf("HEAD~1 %s, want %s: more than init's configuration commit", parent, before)
	}
	if subject := f.git("log", "--format=%s", before+"..HEAD"); strings.Contains(subject, "probe") {
		t.Fatalf("history: %s", subject)
	}
	if got := f.git("config", "--local", "--list"); got != config {
		t.Fatalf("local configuration changed:\n%s\nwas:\n%s", got, config)
	}
	if got := initHookFiles(t, f.repo); len(got) != len(hooks) {
		t.Fatalf("hooks changed: %v, was %v", got, hooks)
	}
	if status := f.dirtyPaths(); status != "" {
		t.Fatalf("status:\n%s", status)
	}
}

func TestInitGitCopyHeadMatchesCommittedTree(t *testing.T) {
	check := `test "$(git show HEAD:README.md)" = committed && test "$(cat README.md)" = committed && test ! -e scratch.txt && test -z "$(git status --porcelain -- . ':!features')"`
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("headtree", check)}), initNothing())
	f.write("README.md", "committed\n")
	f.commitAll("notes")
	f.write("README.md", "edited\n")
	f.write("scratch.txt", "untracked\n")
	out, _ := f.mustRun()
	if !strings.Contains(out, "Checks: headtree\n") {
		t.Fatalf("stdout:\n%s", out)
	}
	if f.read("README.md") != "edited\n" || !f.exists("scratch.txt") {
		t.Fatal("the real working tree changed")
	}
	if got := f.git("status", "--porcelain"); !slices.Contains(strings.Split(got, "\n"), " M README.md") {
		t.Fatalf("status:\n%s", got)
	}
}
