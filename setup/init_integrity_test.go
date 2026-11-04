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
