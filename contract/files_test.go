package contract

import (
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

const (
	nextAcceptance = "Next: set commands.acceptance in .kogen/project.yaml"
	nextChecks     = "Next: add the project's checks to commands.checks in .kogen/project.yaml"
	stepsReadme    = "Cucumber step definitions for Kogen acceptance scenarios.\n"
)

// bridge is the acceptance configuration of the Cucumber bridge Init adds.
func bridge() *project.Acceptance {
	return &project.Acceptance{Run: project.AcceptanceCommand("features/steps", project.KogenRunner), StepsDir: "features/steps"}
}

func selectedChatGPT(cfg *project.Config) string {
	return strings.TrimSuffix(project.RenderConfig(cfg), project.ModelsTemplate())
}

// files-template and one-commit: in a repository without commits, Init writes
// project.Template() without models, project.ModelsTemplate() and the `.kogen/local/` ignore line (after the existing .gitignore) and
// makes the first commit, "Initial commit", of exactly those three files. No model is asked.
func TestInitFirstCommitOfAnEmptyRepository(t *testing.T) {
	f := newInitFx(t, false)
	f.write(".gitignore", "node_modules")
	out, errs := f.mustRun()
	wantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Commit: {sha8} Initial commit (the first commit of this repository)",
		nextAcceptance, nextChecks)
	equal(t, "stderr", errs, "")
	equal(t, "requests", len(f.requests()), 0)
	equal(t, "commits", f.countN(), 1)
	equal(t, "subject", f.git("log", "-1", "--format=%s"), "Initial commit\n")
	equalList(t, "committed", f.committed(), []string{".gitignore", project.ModelsPath, project.ConfigPath})
	equal(t, "project.yaml", f.read(project.ConfigPath), strings.TrimSuffix(project.Template(), project.ModelsTemplate()))
	equal(t, "models.yaml", f.read(project.ModelsPath), project.ModelsTemplate())
	equal(t, ".gitignore", f.read(".gitignore"), "node_modules\n.kogen/local/\n")
	equal(t, "status", f.status(), "")
	if !contains(out, "Commit: "+f.head()[:8]+" ") {
		t.Fatalf("stdout %q does not name HEAD %s", out, f.head())
	}
}

// files-render-config, files-bridge and one-commit: in a project without checks Init writes the
// configuration through project.RenderConfig, adds the `.kogen/local/` ignore line, adds the
// Cucumber bridge's features/steps/README.md, and commits exactly those four files in one
// commit, "Add Kogen configuration", on the previous HEAD. Other changes stay uncommitted.
func TestInitWritesTheConfigurationAndTheBridgeInOneCommit(t *testing.T) {
	f := newInitFx(t, true, nothing())
	f.write("README.md", "# notes\n")
	f.write(".gitignore", "tmp/\n")
	f.write("notes.txt", "one\n")
	f.commitAll("notes")
	f.write("notes.txt", "changed outside Kogen\n")
	f.write("untracked.txt", "u\n")
	head, countN := f.head(), f.countN()

	out, _ := f.mustRun()
	wantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: none",
		"Checks: none found",
		"Acceptance: Cucumber bridge added in features/steps",
		"Commit: {sha8} Add Kogen configuration",
		nextChecks)
	equal(t, "project.yaml", f.read(project.ConfigPath), selectedChatGPT(&project.Config{Acceptance: bridge()}))
	equal(t, "models.yaml", f.read(project.ModelsPath), strings.ReplaceAll(project.ModelsTemplate(), ":\n    model:", ":\n    provider: chatgpt\n    model:"))
	equal(t, ".gitignore", f.read(".gitignore"), "tmp/\n.kogen/local/\n")
	equal(t, "steps README", f.read("features/steps/README.md"), stepsReadme)
	equal(t, "commits", f.countN(), countN+1)
	equal(t, "parent", f.git("log", "-1", "--format=%P"), head+"\n")
	equal(t, "subject", f.git("log", "-1", "--format=%s"), "Add Kogen configuration\n")
	equal(t, "author", f.git("log", "-1", "--format=%an <%ae>"), fixtureName+" <"+fixtureEmail+">\n")
	equalList(t, "committed", f.committed(), []string{".gitignore", project.ModelsPath, project.ConfigPath, "features/steps/README.md"})
	equal(t, "status", f.status(), " M notes.txt\n?? untracked.txt\n")
}

// files-render-config with commands: the setup commands and checks that passed on a copy of the
// committed tree are rendered by project.RenderConfig; a check that fails is left out.
func TestInitRendersTheCommandsThatPassed(t *testing.T) {
	f := newInitFx(t, true, nothing())
	f.write("package.json", `{"scripts":{"test":"node --test","lint":"eslint ."}}`)
	f.write("package-lock.json", "{}\n")
	f.commitAll("app")
	out, _ := f.mustRun()
	want := selectedChatGPT(&project.Config{
		Setup:      []string{"npm ci --no-audit --no-fund"},
		Checks:     []project.Check{{Name: "test", Run: "npm run test"}},
		Acceptance: bridge(),
	})
	equal(t, "project.yaml", f.read(project.ConfigPath), want)
	wantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: npm ci --no-audit --no-fund",
		"Checks: test",
		"Left out: lint (npm run lint) failed with status 2",
		"Acceptance: Cucumber bridge added in features/steps",
		"Commit: {sha8} Add Kogen configuration")
	equalList(t, "committed", f.committed(), []string{".gitignore", project.ModelsPath, project.ConfigPath, "features/steps/README.md"})
	equal(t, "status", f.status(), "")
}

// files-no-bridge: when the bridge writes no report, Init adds no features/steps/README.md and
// no acceptance configuration, and commits the other two files.
func TestInitWithoutABridgeWritesNoStepsReadme(t *testing.T) {
	f := newInitFx(t, true, nothing())
	f.program("node", "exit 0")
	f.write("README.md", "x\n")
	f.commitAll("first")
	out, _ := f.mustRun()
	equal(t, "steps README written", f.exists("features/steps/README.md"), false)
	equal(t, "project.yaml", f.read(project.ConfigPath), selectedChatGPT(&project.Config{}))
	equalList(t, "committed", f.committed(), []string{".gitignore", project.ModelsPath, project.ConfigPath})
	if !contains(out, "\nAcceptance: not configured: ") || !contains(out, nextAcceptance+"\n") {
		t.Fatalf("stdout %q", out)
	}
}
