package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

func TestValidateCommandControls(t *testing.T) {
	cases := []struct{ role, command, label string }{
		{"setup", "set -e\nnpm ci", "setup entry 1"}, {"checks", "mix\ttest", "check test"},
		{"checks", "mix test\r", "check test"}, {"fix", "mix format\t", "fix entry 1"}, {"setup", "npm ci\x7f", "setup entry 1"},
		{"setup", "\n", "setup entry 1"}, {"fix", "\t", "fix entry 1"}, {"checks", "\r", "check test"},
	}
	for _, tc := range cases {
		t.Run(tc.label+tc.command, func(t *testing.T) {
			var value any = []any{tc.command}
			if tc.role == "checks" {
				value = initCheckList("test", tc.command)
			}
			_, problems := Validate(map[string]any{tc.role: value}, InitContext{})
			text := strings.Join(problems, " ")
			if !strings.Contains(text, tc.label) || !strings.Contains(text, "one command per entry") || !strings.Contains(text, `\`) {
				t.Fatalf("unsafe or missing diagnostic: %q", problems)
			}
		})
	}
	if _, p := Validate(map[string]any{"setup": []any{"set -e", "npm ci"}}, InitContext{}); len(p) != 0 {
		t.Fatal(p)
	}
}

func TestWrittenConfigRoundTrip(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".kogen"), 0755); err != nil {
		t.Fatal(err)
	}
	want := &project.Config{Setup: []string{"echo 'it''s'", "mix deps.get"}, Fix: []string{"mix format"}, Checks: []project.Check{{Name: "test", Run: "mix test"}}, Protect: []string{"mix.exs"}, Acceptance: &project.Acceptance{Run: "mix test", StepsDir: "features/steps"}}
	if err := os.WriteFile(filepath.Join(root, project.ConfigPath), []byte(initRenderConfig(want)), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := project.LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if err = initCompareConfig(want, got); err != nil {
		t.Fatal(err)
	}
}

func TestWrittenConfigDifferences(t *testing.T) {
	base := func() *project.Config {
		return &project.Config{Setup: []string{"mix deps.get", "npm ci"}, Fix: []string{"mix format"}, Checks: []project.Check{{Name: "test", Run: "mix test"}}, Protect: []string{"mix.exs"}, Acceptance: &project.Acceptance{Run: "mix test", StepsDir: "features/steps"}}
	}
	cases := []struct {
		label  string
		change func(*project.Config)
	}{
		{"setup", func(c *project.Config) { c.Setup[0], c.Setup[1] = c.Setup[1], c.Setup[0] }}, {"fix", func(c *project.Config) { c.Fix = nil }},
		{"test", func(c *project.Config) { c.Checks[0].Name = "other" }}, {"test", func(c *project.Config) { c.Checks[0].Run = "other" }},
		{"protect", func(c *project.Config) { c.Protect = append(c.Protect, "other") }}, {"acceptance", func(c *project.Config) { c.Acceptance = nil }},
		{"acceptance run", func(c *project.Config) { c.Acceptance.Run = "other" }}, {"acceptance steps", func(c *project.Config) { c.Acceptance.StepsDir = "other" }},
	}
	for _, tc := range cases {
		got := base()
		tc.change(got)
		err := initCompareConfig(base(), got)
		if err == nil || !strings.Contains(err.Error(), tc.label) {
			t.Fatalf("%s: %v", tc.label, err)
		}
	}
	if err := initCompareConfig(&project.Config{}, &project.Config{Setup: []string{}, Fix: []string{}, Checks: []project.Check{}, Protect: []string{}}); err != nil {
		t.Fatal(err)
	}
}

func TestIntegrityRestoreExistingFiles(t *testing.T) {
	root := t.TempDir()
	name := filepath.Join(root, ".gitignore")
	if err := os.WriteFile(name, []byte("original\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".kogen"), 0755); err != nil {
		t.Fatal(err)
	}
	models := filepath.Join(root, project.ModelsPath)
	if err := os.WriteFile(models, []byte(project.ModelsTemplate()), 0600); err != nil {
		t.Fatal(err)
	}
	saved, err := initSnapshot(root, []string{".gitignore", project.ModelsPath, "new"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "new"), []byte("new"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(models, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := initRestore(root, saved); err != nil {
		t.Fatal(err)
	}
	team, err := os.ReadFile(models)
	if err != nil || string(team) != project.ModelsTemplate() {
		t.Fatalf("models: %q %v", team, err)
	}
	data, err := os.ReadFile(name)
	if err != nil || string(data) != "original\n" {
		t.Fatalf("%q %v", data, err)
	}
	st, err := os.Stat(name)
	if err != nil || st.Mode().Perm() != 0600 {
		t.Fatalf("%v %v", st, err)
	}
	if _, err := os.Stat(filepath.Join(root, "new")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
}

func TestInitFailedWriteRemovesNewDirectories(t *testing.T) {
	for _, tc := range []struct {
		name    string
		preDir  bool
		wantDir bool
	}{{"no .kogen before", false, false}, {"empty .kogen before", true, true}} {
		t.Run(tc.name, func(t *testing.T) {
			f := initNewFx(t, true, initNothing())
			f.write("README.md", "# fixture\n")
			f.commitAll("initial")
			f.write(".git/info/exclude", ".gitignore\n")
			missing := filepath.Join(filepath.Dir(f.repo), "missing", "gitignore")
			if err := os.Symlink(missing, filepath.Join(f.repo, ".gitignore")); err != nil {
				t.Fatal(err)
			}
			if tc.preDir {
				if err := os.Mkdir(filepath.Join(f.repo, ".kogen"), 0o755); err != nil {
					t.Fatal(err)
				}
			}
			head := f.head()
			exit, out, _, err := f.run("")
			if exit != 70 || err == nil || !strings.Contains(err.Error(), ".gitignore") || strings.Contains(err.Error(), "restoring files") {
				t.Fatalf("exit %d err %v", exit, err)
			}
			if strings.Contains(out, "Initialized Kogen") {
				t.Fatalf("output %q", out)
			}
			if f.exists(project.ConfigPath) {
				t.Fatal("project.yaml left behind")
			}
			if got := f.exists(".kogen"); got != tc.wantDir {
				t.Fatalf(".kogen exists %v, want %v", got, tc.wantDir)
			}
			if s := f.dirtyPaths(); s != "" {
				t.Fatalf("status %q", s)
			}
			if f.head() != head {
				t.Fatal("HEAD changed")
			}
		})
	}
}

func TestIntegrityRestoreNewDirectories(t *testing.T) {
	for _, keep := range []bool{false, true} {
		root := t.TempDir()
		saved, err := initSnapshot(root, []string{"features/steps/README.md"})
		if err != nil {
			t.Fatal(err)
		}
		dir := filepath.Join(root, "features", "steps")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if keep {
			if err := os.WriteFile(filepath.Join(root, "features", "other"), []byte("y"), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		if err := initRestore(root, saved); err != nil {
			t.Fatalf("keep %v: %v", keep, err)
		}
		if _, err := os.Stat(dir); !os.IsNotExist(err) {
			t.Fatalf("keep %v: features/steps remains: %v", keep, err)
		}
		if _, err := os.Stat(filepath.Join(root, "features")); keep != (err == nil) {
			t.Fatalf("keep %v: features: %v", keep, err)
		}
		_, err = os.Stat(filepath.Join(root, "features", "other"))
		if keep != (err == nil) {
			t.Fatalf("keep %v: other: %v", keep, err)
		}
		if err := initRestore(root, saved); err != nil {
			t.Fatalf("second restore: %v", err)
		}
	}
	// A dangling symlink in place of a directory existed before the snapshot and stays.
	root := t.TempDir()
	link := filepath.Join(root, ".kogen")
	if err := os.Symlink(filepath.Join(root, "missing"), link); err != nil {
		t.Fatal(err)
	}
	saved, err := initSnapshot(root, []string{project.ConfigPath})
	if err != nil {
		t.Fatal(err)
	}
	if err := initRestore(root, saved); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(link); err != nil {
		t.Fatalf("dangling .kogen symlink removed: %v", err)
	}
}
