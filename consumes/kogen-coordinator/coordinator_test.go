package consumes_test

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestRepositoryAndConfig(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "repo")
	home := filepath.Join(base, "home")
	for _, p := range []string{root, home, filepath.Join(root, ".kogen")} {
		if err := os.MkdirAll(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	env := []string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + filepath.Join(home, "gitconfig"), "GIT_AUTHOR_NAME=Fixture", "GIT_AUTHOR_EMAIL=fixture@example.invalid", "GIT_COMMITTER_NAME=Fixture", "GIT_COMMITTER_EMAIL=fixture@example.invalid"}
	cmd := exec.Command("git", "init", "-q", root)
	cmd.Env = env
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %s %v", out, err)
	}
	for _, args := range [][]string{{"config", "user.name", "Fixture"}, {"config", "user.email", "fixture@example.invalid"}, {"config", "commit.gpgsign", "false"}} {
		c := exec.Command("git", args...)
		c.Dir = root
		c.Env = env
		if out, err := c.CombinedOutput(); err != nil {
			t.Fatalf("config: %s %v", out, err)
		}
	}
	repo, err := git.Open(root, env)
	if err != nil || repo.Dir != root {
		t.Fatalf("open: %+v %v", repo, err)
	}
	if _, err := repo.RequireIdentity(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(git.UnsetPrefix(), "GIT_DIR") {
		t.Fatal("archive must unset Git repository overrides")
	}
	if project.ModelRoles != [3]string{"shape", "build", "review"} {
		t.Fatalf("model roles: %v", project.ModelRoles)
	}
	if (project.Role{}).External() || !(project.Role{Executor: project.ExecutorClaudeCode}).External() {
		t.Fatal("external role selection")
	}
	if repo.Head() != "" {
		t.Fatal("unexpected head")
	}
	cfg := &project.Config{Setup: []string{"npm ci"}, Fix: []string{"npm run fix"}, Checks: []project.Check{{Name: "test", Run: "npm test"}}, Protect: []string{"package.json"}, Acceptance: &project.Acceptance{Run: "runner", StepsDir: "features/steps"}}
	for _, text := range []string{project.RenderConfig(cfg), project.Template()} {
		for _, line := range strings.Split(text, "\n") {
			if strings.HasPrefix(line, "models:") {
				t.Fatal("rendered configuration and template must not contain a models section; the lineup lives in .kogen/models.yaml")
			}
		}
	}
	if err := os.WriteFile(filepath.Join(root, project.ConfigPath), []byte(project.RenderConfig(cfg)), 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := project.LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(loaded.Setup, cfg.Setup) || !reflect.DeepEqual(loaded.Fix, cfg.Fix) || !reflect.DeepEqual(loaded.Checks, cfg.Checks) || !reflect.DeepEqual(loaded.Protect, cfg.Protect) || !reflect.DeepEqual(loaded.Acceptance, cfg.Acceptance) {
		t.Fatalf("config: %+v", loaded)
	}
	s := sys.NewWith(env, root)
	s.Stdout = io.Discard
	s.Stderr = io.Discard
	sha, err := repo.CommitPaths(s, "fixture", []string{project.ConfigPath}, false)
	if err != nil || sha == "" || !strings.HasPrefix(repo.Head(), sha) {
		t.Fatalf("commit: %q %v head %q", sha, err, repo.Head())
	}
	text, ok := repo.Show(sha, project.ConfigPath)
	if !ok || text != project.RenderConfig(cfg) {
		t.Fatalf("show %q %v", text, ok)
	}
	listing, err := repo.OK("ls-tree", "-r", "-z", "--name-only", "HEAD")
	if err != nil || listing != project.ConfigPath+"\x00" {
		t.Fatalf("listing %q %v", listing, err)
	}
	gd, err := repo.GitDir()
	if err != nil || gd != filepath.Join(root, ".git") {
		t.Fatalf("gitdir %q %v", gd, err)
	}
	if err := os.WriteFile(filepath.Join(root, project.ConfigPath), []byte(project.Template()), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CommitPaths(s, "update fixture", []string{project.ConfigPath}, true); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, project.ConfigPath), []byte("dirty"), 0600); err != nil {
		t.Fatal(err)
	}
	changed, err := repo.ChangedPaths(project.ConfigPath)
	if err != nil || !reflect.DeepEqual(changed, []string{project.ConfigPath}) {
		t.Fatalf("changed %#v %v", changed, err)
	}
	r, err := repo.Observing().RunEnv([]string{"GIT_OPTIONAL_LOCKS=0"}, "status", "--porcelain")
	if err != nil || r.Status != 0 || r.Stderr != "" || !strings.Contains(r.Stdout, project.ConfigPath) {
		t.Fatalf("status %+v %v", r, err)
	}
	failed, err := repo.Observing().RunEnv(nil, "show", "HEAD:missing")
	if err != nil || failed.Status == 0 || failed.Stderr == "" || failed.Stdout != "" {
		t.Fatalf("failed git result: %+v %v", failed, err)
	}
	if err := os.WriteFile(filepath.Join(root, project.ConfigPath), []byte(project.Template()), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, project.ModelsPath), []byte(project.ModelsTemplate()), 0600); err != nil {
		t.Fatal(err)
	}
	defaults, err := project.LoadModels(root)
	if err != nil || !reflect.DeepEqual(defaults.Roles, project.DefaultModels()) {
		t.Fatalf("template %+v %v", defaults, err)
	}
	if _, err := project.LoadConfig(root); err != nil {
		t.Fatalf("template with the team file present: %v", err)
	}
	d := project.Detect(map[string]string{"package.json": `{"scripts":{"test":"test"},"devDependencies":{"@cucumber/cucumber":"1"}}`, "package-lock.json": "{}"}, []string{"package-lock.json", "features/steps/a.js"})
	if !reflect.DeepEqual(d.Setup, []string{"npm ci --no-audit --no-fund"}) || !reflect.DeepEqual(d.Checks, []project.Check{{Name: "test", Run: "npm run test"}}) || d.Runner != "features/steps" {
		t.Fatalf("detected %+v", d)
	}
	mix := project.Detect(map[string]string{"mix.exs": "{:credo, []}"}, []string{".formatter.exs", ".credo.exs"})
	if !reflect.DeepEqual(mix.Setup, []string{"mix deps.get"}) || !reflect.DeepEqual(mix.Fix, []string{"mix format"}) || !reflect.DeepEqual(mix.Protect, []string{".formatter.exs", ".credo.exs"}) || !reflect.DeepEqual(mix.Checks, []project.Check{{Name: "format", Run: "mix format --check-formatted"}, {Name: "compile", Run: "mix compile --warnings-as-errors"}, {Name: "test", Run: "mix test"}, {Name: "credo", Run: "mix credo --strict"}}) {
		t.Fatalf("mix detection %+v", mix)
	}
	goDetected := project.Detect(map[string]string{"go.mod": "module fixture"}, []string{"go.mod"})
	if !reflect.DeepEqual(goDetected.Setup, []string{"go mod download"}) || !reflect.DeepEqual(goDetected.Checks, []project.Check{
		{Name: "go-format", Run: `test -z "$(gofmt -l .)"`},
		{Name: "go-test", Run: "go test ./..."}, {Name: "go-vet", Run: "go vet ./..."}, {Name: "go-build", Run: "go build -o /dev/null ./..."},
	}) {
		t.Fatalf("go detection: %+v", goDetected)
	}
	args := `--strict --require 'features/steps/*.js' --format "message:$KOGEN_ACCEPTANCE_REPORT" "$KOGEN_ACCEPTANCE_FEATURES"`
	if got := project.AcceptanceCommand(d.Runner, project.ProjectRunner); got != `"$KOGEN_NODE" node_modules/@cucumber/cucumber/bin/cucumber.js `+args {
		t.Fatalf("project runner %q", got)
	}
	if got := project.AcceptanceCommand("features/steps", project.KogenRunner); got != `NODE_PATH="$KOGEN_CUCUMBER" "$KOGEN_NODE" "$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js" `+args {
		t.Fatalf("bridge runner %q", got)
	}
}
