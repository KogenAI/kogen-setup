package setup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-executor/agent"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-loop/tools"
	"github.com/KogenAI/kogen-verification/verify"
)

// ---- Init: `kogen init` (SET-1..5, SET-10..13) ----

const (
	initCommandTimeout  = 10 * time.Minute
	initIgnore          = ".kogen/local/"
	initStepsReadmePath = "features/steps/README.md"
	initStepsReadme     = "Cucumber step definitions for Kogen acceptance scenarios.\n"
	initNextAcceptance  = "Next: set commands.acceptance in .kogen/project.yaml"
	initNextChecks      = "Next: add the project's checks to commands.checks in .kogen/project.yaml"
	initNpmPlaceholder  = `echo "Error: no test specified" && exit 1`
)

var (
	initExecTimeout      = initCommandTimeout
	initInstructionFiles = []string{"AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".cursor/rules", ".github/copilot-instructions.md"}
	initSources          = []string{"README.md", "mix.exs", "package.json", "Makefile", ".tool-versions", ".gitlab-ci.yml"}
	initManifestNames    = []string{"mix.exs", "package.json", "mix.lock", "package-lock.json", "npm-shrinkwrap.json", "go.mod", "go.sum"}
	initWorkflowRE       = regexp.MustCompile(`^\.github/workflows/[^/]+\.ya?ml$`)
	initCheckNameRE      = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*\n?$`)
	initSetupPartsRE     = regexp.MustCompile(`;|&&|\|\||\n`)
	initCommandPartsRE   = regexp.MustCompile(`;|&&|\|\||\||\n`)
	initNpmScriptRE      = regexp.MustCompile(`\bnpm\s+(?:run\s+)?([a-zA-Z0-9:_-]+)\b`)
	initNoTestsRE        = regexp.MustCompile(`(?m)(?:^\?[\t ]+\S+[\t ]+\[no test files\][\t ]*$|\b0 tests, 0 failures\b|\bRan 0 tests\b|\bNo tests found\b|\b0 passing\b)`)
	initPositiveTestsRE  = regexp.MustCompile(`(?m)(?:\b0*[1-9][0-9]* tests\b|\bRan 0*[1-9][0-9]* tests\b|\b0*[1-9][0-9]* passing\b|^ok[\t ]+\S+|^PASS(?:[\t ]|$))`)
	initMixTaskRE        = regexp.MustCompile(`\bmix\s+([a-z][a-z0-9_.-]*)\b`)
)

// InitInput is what Init needs besides the session.
type InitInput struct {
	// Client sends the one setup request to the shaping model.
	Client *provider.Client
	// Tools are Kogen's own Node, Quint and Cucumber, given to every command Init runs
	// (KOGEN_NODE, KOGEN_QUINT, KOGEN_CUCUMBER).
	Tools verify.Tools
	// Home is the home directory holding ~/.kogen/credentials; "" means $HOME of the session.
	Home string
}

// Init is `kogen init` in the Git repository containing the session's working directory
// (SET-1..5, SET-10..13): detect the project's commands, ask the shaping model once, keep
// what passes on a copy of the committed tree, add the Cucumber bridge when there is no
// runner, and commit the configuration. It prints the result lines to s.Stdout and progress
// lines to s.Stderr. exit is 0, or the exit code of err (a *sys.Error's Exit, an
// *sys.Interrupted's signal code, 70 for an internal failure); the caller prints err.
func Init(ctx context.Context, s *sys.Session, in InitInput) (exit int, err error) {
	if err := initRun(ctx, s, in); err != nil {
		return initExit(err), err
	}
	return 0, nil
}

func initExit(err error) int {
	var interrupted *sys.Interrupted
	if errors.As(err, &interrupted) {
		return interrupted.ExitCode()
	}
	if e, ok := sys.AsError(err); ok {
		return e.Exit
	}
	return 70
}

func initRun(ctx context.Context, s *sys.Session, in InitInput) error {
	repo, err := git.Open(s.Cwd, s.Env)
	if err != nil {
		return err
	}
	root := repo.Dir
	if _, err := repo.RequireIdentity(); err != nil {
		return err
	}
	head := repo.Head()
	if _, err := os.Stat(filepath.Join(root, project.ConfigPath)); err == nil {
		if _, err := project.LoadConfig(root); err != nil {
			return err
		}
	}
	if head != "" {
		if _, ok := repo.Show(head, project.ConfigPath); ok {
			cfg, err := project.LoadConfig(root)
			if err != nil {
				return err
			}
			s.Puts("Kogen is already initialized in " + root)
			initNextLines(s, cfg)
			return nil
		}
	}
	paths := []string{project.ConfigPath, ".gitignore", initStepsReadmePath}
	dirty, err := repo.ChangedPaths(paths...)
	if err != nil {
		return err
	}
	var uncommitted []string
	if head == "" {
		all, err := repo.ChangedPaths()
		if err != nil {
			return err
		}
		if i := slices.Index(all, ".gitignore"); i >= 0 {
			all = slices.Delete(all, i, i+1)
		}
		uncommitted = all
	}
	configDirty := slices.Contains(dirty, project.ConfigPath)
	if configDirty {
		if st, err := os.Stat(filepath.Join(root, project.ConfigPath)); err == nil && st.Mode().IsRegular() {
			return initCommitLeftover(s, repo, root, head, dirty)
		}
	}
	if head != "" {
		for _, p := range paths {
			if slices.Contains(dirty, p) {
				return sys.Fail("environment", "dirty_tree", p+" has uncommitted changes; commit, stash or discard them first", 5)
			}
		}
	}
	switch {
	case head == "" && len(uncommitted) > 0:
		return sys.Fail("environment", "no_commits",
			fmt.Sprintf("%d file(s) are not committed yet; commit them first (git add -A && git commit -m \"Initial commit\"), then run kogen init", len(uncommitted)), 3)
	case head == "":
		if err := initWriteFiles(repo, root, "", project.Template(), nil); err != nil {
			return err
		}
		sha, err := initCommit(s, repo, []string{project.ConfigPath, ".gitignore"}, "")
		if err != nil {
			return err
		}
		s.Puts("Initialized Kogen in " + root)
		s.Puts("Commit: " + sha + " Initial commit (the first commit of this repository)")
		s.Puts(initNextAcceptance)
		s.Puts(initNextChecks)
		return nil
	}
	return initConfigure(ctx, s, in, repo, root, head)
}

// initCommitLeftover is SET-3: a configuration a failed init commit left behind is committed
// as it is.
func initCommitLeftover(s *sys.Session, repo *git.Repo, root, head string, dirty []string) error {
	if _, err := project.LoadConfig(root); err != nil {
		return err
	}
	gitignore := filepath.Join(root, ".gitignore")
	if err := os.WriteFile(gitignore, []byte(initWithLine(initRead(gitignore), initIgnore)), 0o644); err != nil {
		return err
	}
	paths := []string{project.ConfigPath, ".gitignore"}
	if slices.Contains(dirty, initStepsReadmePath) {
		paths = append(paths, initStepsReadmePath)
	}
	sha, err := initCommit(s, repo, paths, head)
	if err != nil {
		return err
	}
	s.Puts("Initialized Kogen in " + root)
	s.Puts("Commit: " + sha + " Add Kogen configuration")
	cfg, err := project.LoadConfig(root)
	if err != nil {
		return err
	}
	initNextLines(s, cfg)
	return nil
}

func initConfigure(ctx context.Context, s *sys.Session, in InitInput, repo *git.Repo, root, head string) error {
	home := in.Home
	if home == "" {
		home = s.Getenv("HOME")
	}
	route, err := initSelectRoute(s, home)
	if err != nil {
		return err
	}
	s.Progress("kogen: detecting the project's commands")
	listing, err := repo.OK("ls-tree", "-r", "-z", "--name-only", "HEAD")
	if err != nil {
		return err
	}
	var tracked []string
	for _, p := range strings.Split(listing, "\x00") {
		if p != "" {
			tracked = append(tracked, p)
		}
	}
	sources, manifests := map[string]string{}, map[string]string{}
	for _, p := range tracked {
		if slices.Contains(initSources, p) || initWorkflowRE.MatchString(p) {
			if text, ok := repo.Show(head, p); ok {
				sources[p] = text
			}
		}
		if slices.Contains(initManifestNames, path.Base(p)) {
			if text, ok := repo.Show(head, p); ok {
				manifests[p] = text
			}
		}
	}
	detected := project.Detect(manifests, tracked)
	proposed, err := initAsk(ctx, s, in, route, home, root, detected, tracked, sources, manifests)
	if err != nil {
		return err
	}
	clone := sys.TmpPath("kogen-init")
	defer os.RemoveAll(clone)
	if err := initCommittedCopy(s, repo, root, clone, tracked); err != nil {
		return err
	}
	candidates := Merge(detected, proposed)
	res, err := initVerify(ctx, s, in, repo, clone, tracked, candidates, detected.Runner)
	if err != nil {
		return err
	}
	os.RemoveAll(clone)
	res.setup, res.checks = initSelectOverlap(res.setup, res.checks, detected.Setup, manifests, tracked)
	res.filterProtect(candidates.Protect, manifests)

	cfg := &project.Config{Setup: res.setup, Fix: res.fix, Checks: res.checks, Protect: res.protect, Acceptance: res.acceptance}
	var files map[string]string
	if res.bridge {
		files = map[string]string{initStepsReadmePath: initStepsReadme}
	}
	paths := []string{project.ConfigPath, ".gitignore"}
	if res.bridge {
		paths = append(paths, initStepsReadmePath)
	}
	saved, err := initSnapshot(root, paths)
	if err != nil {
		return err
	}
	if err := initWriteFiles(repo, root, head, initRenderConfig(cfg, route), files); err != nil {
		return err
	}
	written, err := project.LoadConfig(root)
	if err != nil {
		err = fmt.Errorf("loading written configuration %s (verified setup commands %q, fix commands %q, checks %v): %w", project.ConfigPath, cfg.Setup, cfg.Fix, cfg.Checks, err)
	} else {
		err = initCompareConfig(cfg, written)
	}
	if err != nil {
		if restoreErr := initRestore(root, saved); restoreErr != nil {
			return fmt.Errorf("%w; restoring files: %v", err, restoreErr)
		}
		return err
	}
	s.Puts("Initialized Kogen in " + root)
	setup := "none"
	if len(res.setup) > 0 {
		setup = strings.Join(res.setup, "; ")
	}
	s.Puts("Setup: " + setup)
	var checks string
	switch {
	case len(res.checks) > 0:
		names := make([]string, len(res.checks))
		for i, c := range res.checks {
			names[i] = c.Name
		}
		checks = strings.Join(names, ", ")
	case len(res.leftOut) == 0:
		checks = "none found"
	default:
		checks = "none passed"
	}
	s.Puts("Checks: " + checks)
	byName := map[string]project.Check{}
	for _, c := range proposed.Checks {
		byName[c.Name] = c
	}
	for _, c := range detected.Checks {
		if p, ok := byName[c.Name]; ok && c.Run != p.Run {
			s.Puts("Replaced: " + c.Name + " (" + c.Run + ") with (" + p.Run + ")")
		}
	}
	if len(res.leftOut) > 0 {
		s.Puts("Left out: " + strings.Join(res.leftOut, "; "))
	}
	s.Puts("Acceptance: " + res.how)
	var found []string
	for _, f := range initInstructionFiles {
		if slices.ContainsFunc(tracked, func(p string) bool { return p == f || strings.HasPrefix(p, f+"/") }) {
			found = append(found, f)
		}
	}
	if len(found) > 0 {
		s.Puts("Note: Kogen gives its models README.md only; it does not read " + strings.Join(found, ", "))
	}
	sha, err := initCommit(s, repo, paths, head)
	if err != nil {
		return err
	}
	s.Puts("Commit: " + sha + " Add Kogen configuration")
	initNextLines(s, written)
	return nil
}

func initNextLines(s *sys.Session, cfg *project.Config) {
	if cfg.Acceptance == nil || cfg.Acceptance.Run == "" || cfg.Acceptance.StepsDir == "" {
		s.Puts(initNextAcceptance)
	}
	if len(cfg.Checks) == 0 {
		s.Puts(initNextChecks)
	}
}

// ---- SET-11: one request to the shaping model ----

func initAsk(ctx context.Context, s *sys.Session, in InitInput, route initRoute, home, root string, detected project.Detected, tracked []string, sources, manifests map[string]string) (InitProposal, error) {
	role := route.models()["shape"]
	s.Progress(fmt.Sprintf("kogen: asking %s/%s about the project's commands", role.Model, role.Effort))
	t0 := time.Now()

	var ci []string
	for _, p := range tracked {
		if initWorkflowRE.MatchString(p) {
			ci = append(ci, p)
		}
	}
	var source strings.Builder
	for _, p := range append(slices.Clone(initSources), ci...) {
		if text, ok := sources[p]; ok {
			source.WriteString("\n## File " + p + "\n\n```\n" + tools.Cut(text) + "\n```\n")
		}
	}
	input := []any{map[string]any{
		"role": "user",
		"content": "# Detected\n\n" + initDetectedJSON(detected) +
			"\n\n# Tracked files\n\n" + tools.Cut(strings.Join(tracked, "\n")) + "\n" + source.String(),
	}}
	ctxInfo := InitContext{Root: root, Tracked: tracked, Contents: manifests, DetectedChecks: detected.Checks}
	var proposal InitProposal
	var usage provider.Usage
	var err error
	if role.External() {
		proposal, err = initClaudeConverse(ctx, s, home, role, input, ctxInfo)
	} else {
		// The provider client reads credentials from the session HOME. Honor InitInput.Home
		// for the request as well as route selection, without changing the caller's session.
		requestSession := sys.NewWith(append(slices.Clone(s.Env), "HOME="+home), s.Cwd)
		requestSession.Stdout, requestSession.Stderr = s.Stdout, s.Stderr
		requestCtx, cancel := context.WithCancel(ctx)
		stop := context.AfterFunc(s.Context(), cancel)
		proposal, usage, err = initConverse(requestCtx, requestSession, in, provider.Role{Provider: role.Provider, Model: role.Model, Effort: role.Effort, BaseURL: role.BaseURL}, input, ctxInfo)
		stop()
		cancel()
		if interrupted := s.Err(); interrupted != nil {
			return InitProposal{}, interrupted
		}
	}
	if err != nil {
		return InitProposal{}, err
	}
	s.Progress(fmt.Sprintf("kogen: init %s/%s %s wall_ms=%d", role.Model, role.Effort, usage.Line(), time.Since(t0).Milliseconds()))
	return proposal, nil
}

// initDetectedJSON is the detection result as the model reads it: the compact JSON object
// with its keys in the order the Elixir Kogen has always written them.
func initDetectedJSON(d project.Detected) string {
	list := func(ss []string) string {
		parts := make([]string, len(ss))
		for i, x := range ss {
			parts[i] = initJSONString(x)
		}
		return "[" + strings.Join(parts, ",") + "]"
	}
	checks := make([]string, len(d.Checks))
	for i, c := range d.Checks {
		checks[i] = `{"name":` + initJSONString(c.Name) + `,"run":` + initJSONString(c.Run) + `}`
	}
	return `{"setup":` + list(d.Setup) + `,"protect":` + list(d.Protect) + `,"fix":` + list(d.Fix) + `,"checks":[` + strings.Join(checks, ",") + `]}`
}

const initHex = "0123456789ABCDEF"

// initJSONString is a JSON string escaped only for quote, backslash and control characters.
func initJSONString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		switch {
		case r == utf8.RuneError && size == 1:
			b.WriteString("�")
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r < 0x20:
			b.WriteString(`\u00` + string(initHex[r>>4]) + string(initHex[r&15]))
		default:
			b.WriteString(s[i : i+size])
		}
		i += size
	}
	b.WriteByte('"')
	return b.String()
}

// initConverse asks, and asks once more with the correction when the answer is missing or
// invalid; a second failure ends init (provider/init_invalid).
func initConverse(ctx context.Context, s *sys.Session, in InitInput, role provider.Role, input []any, vctx InitContext) (InitProposal, provider.Usage, error) {
	var usage provider.Usage
	defs := agent.AsAny(InitToolDefinitions(SubmitConfigurationTool))
	// The setup conversation has no records of its own; its cache identity lives as long as it.
	cacheID := newCacheID()
	for attempt := 1; ; attempt++ {
		resp, err := in.Client.Respond(ctx, s, conversationRequest(provider.Request{
			Role: role, Instructions: InitInstructions(), Input: input, Tools: defs,
		}, cacheID), nil)
		if err != nil {
			return InitProposal{}, usage, err
		}
		usage = usage.Add(resp.Usage)
		var call *tools.Call
		for _, c := range tools.Calls(resp.Items) {
			if c.Name == SubmitConfigurationTool {
				c := c
				call = &c
				break
			}
		}
		var problems []string
		if call != nil {
			var proposal InitProposal
			proposal, problems = Validate(call.Args(), vctx)
			if len(problems) == 0 {
				return proposal, usage, nil
			}
		}
		if attempt == 2 {
			return InitProposal{}, usage, sys.Fail("provider", "init_invalid", "the model did not return a valid configuration; nothing was written", 4)
		}
		input = append(slices.Clone(input), tools.Replay(resp.Items)...)
		if call == nil {
			input = append(input, map[string]any{"role": "user", "content": "Answer by calling submit_configuration."})
		} else {
			input = append(input, toolOutput(*call, "invalid: "+strings.Join(problems, "; ")))
		}
	}
}

// InitProposal is what the shaping model proposes, or the detected and proposed commands
// merged (SET-11).
type InitProposal struct {
	Setup, Fix []string
	Checks     []project.Check
	Protect    []string
}

// InitContext is what Validate checks a proposal against: the tracked paths, the committed
// text of the manifests (mix.exs, package.json, lockfiles, go.mod, go.sum; absent paths have
// no entry) and the checks Detect found.
type InitContext struct {
	Root           string
	Tracked        []string
	Contents       map[string]string
	DetectedChecks []project.Check
}

// Validate checks the arguments of a submit_configuration call (SET-11). It returns the
// proposal, or the problems that go back to the model.
func Validate(args map[string]any, ctx InitContext) (InitProposal, []string) {
	var problems []string
	list := func(key string) []string {
		out, problem := initStrings(args, key)
		if problem != "" {
			problems = append(problems, problem)
		}
		return out
	}
	setup, fix, rawProtect := list("setup"), list("fix"), list("protect")
	var protect []string
	for _, input := range rawProtect {
		if slices.Contains(strings.Split(input, "/"), "..") {
			problems = append(problems, "protect path "+input+" leaves the project folder")
			continue
		}
		p := initNormalizeProtect(input)
		if filepath.IsAbs(p) {
			rel, err := filepath.Rel(ctx.Root, p)
			if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				problems = append(problems, "protect path "+input+" leaves the project folder")
				continue
			}
			p = filepath.ToSlash(rel)
		}
		if slices.Contains(protect, p) {
			continue
		}
		protect = append(protect, p)
		if !slices.Contains(ctx.Tracked, p) {
			problems = append(problems, "protect path "+p+" is not a tracked file")
		}
	}
	checks, checkProblems := initChecks(args)
	problems = append(problems, checkProblems...)

	proposed := map[string]bool{}
	for _, c := range checks {
		proposed[c.Name] = true
		if redacted, found := initCredentialLiteral(c.Run); found {
			problems = append(problems, "check command "+redacted+" contains a credential literal; read it from the environment instead")
			continue
		}
		if strings.ContainsFunc(c.Run, unicode.IsControl) {
			problems = append(problems, fmt.Sprintf("check %s command %q contains a control character; put one command per entry", c.Name, c.Run))
			continue
		}
		if initNamesRoot(c.Run, ctx.Root) {
			problems = append(problems, fmt.Sprintf("check %s (%s) names the project folder by absolute path; use a relative path", c.Name, c.Run))
		}
		if initLeavesProject(c.Run) {
			problems = append(problems, fmt.Sprintf("check %s (%s) reaches outside the project folder; use a path inside the project", c.Name, c.Run))
		}
		if initChangesRepositoryState(c.Run) {
			problems = append(problems, fmt.Sprintf("check %s (%s) changes the repository state", c.Name, c.Run))
		}
		if initLongRunning(c.Run) {
			problems = append(problems, fmt.Sprintf("check %s (%s) does not exit on its own (watch or server mode); use a command that runs once", c.Name, c.Run))
		}
		if initPublishesOrDeploys(c.Run) {
			problems = append(problems, fmt.Sprintf("check %s (%s) publishes or deploys", c.Name, c.Run))
		}
		if initRunsNothing(c.Run) {
			problems = append(problems, fmt.Sprintf("check %s (%s) runs nothing", c.Name, c.Run))
		} else if initMasksFailure(c.Run) {
			problems = append(problems, fmt.Sprintf("check %s (%s) ignores its own failure", c.Name, c.Run))
		}
	}
	var effective []project.Check
	for _, c := range ctx.DetectedChecks {
		if !proposed[c.Name] {
			effective = append(effective, c)
		}
	}
	effective = append(effective, checks...)
	for _, p := range protect {
		if !slices.Contains(ctx.Tracked, p) {
			continue
		}
		text, ok := ctx.Contents[p]
		if reason := initProtectProblem(p, text, ok, effective); reason != "" {
			problems = append(problems, "protect path "+p+" is not eligible: "+reason)
		}
	}
	for i, command := range setup {
		if redacted, found := initCredentialLiteral(command); found {
			problems = append(problems, "setup command "+redacted+" contains a credential literal; read it from the environment instead")
			continue
		}
		prerequisite := (!strings.ContainsFunc(command, unicode.IsControl) || strings.Contains(command, "\n")) && initMachinePrerequisite(command)
		if prerequisite {
			problems = append(problems, "setup command "+command+" is a one-time machine prerequisite, not recurring project setup")
		}
		if strings.ContainsFunc(command, unicode.IsControl) {
			if prerequisite {
				continue
			}
			problems = append(problems, fmt.Sprintf("setup entry %d command %q contains a control character; put one command per entry", i+1, command))
			continue
		}
		if initRunsNothing(command) {
			problems = append(problems, "setup command "+command+" runs nothing")
		}
		for _, part := range initSetupPartsRE.Split(command, -1) {
			part = strings.TrimSpace(part)
			words := strings.Fields(part)
			for _, suite := range []string{"mix test", "go test", "go vet", "npm test", "npm run test", "npm run lint", "yarn test", "pnpm test", "pytest", "python -m pytest", "cargo test", "cargo clippy", "bundle exec rspec", "rspec", "rake test"} {
				prefix := strings.Fields(suite)
				if len(words) >= len(prefix) && slices.Equal(words[:len(prefix)], prefix) {
					problems = append(problems, "setup command "+part+" runs tests or linting; put it in checks")
					break
				}
			}
		}
		if initNamesRoot(command, ctx.Root) {
			problems = append(problems, "setup command "+command+" names the project folder by absolute path; use a relative path")
		}
		if initLeavesProject(command) {
			problems = append(problems, "setup command "+command+" reaches outside the project folder; use a path inside the project")
		}
		if initChangesRepositoryState(command) {
			problems = append(problems, "setup command "+command+" changes the repository state")
		}
		if initLongRunning(command) {
			problems = append(problems, "setup command "+command+" does not exit on its own (watch or server mode); use a command that runs once")
		}
		if initPublishesOrDeploys(command) {
			problems = append(problems, "setup command "+command+" publishes or deploys")
		}
	}
	for i, command := range fix {
		if redacted, found := initCredentialLiteral(command); found {
			problems = append(problems, "fix command "+redacted+" contains a credential literal; read it from the environment instead")
			continue
		}
		if strings.ContainsFunc(command, unicode.IsControl) {
			problems = append(problems, fmt.Sprintf("fix entry %d command %q contains a control character; put one command per entry", i+1, command))
			continue
		}
		if initRunsNothing(command) {
			problems = append(problems, "fix command "+command+" runs nothing")
		}
		if initNamesRoot(command, ctx.Root) {
			problems = append(problems, "fix command "+command+" names the project folder by absolute path; use a relative path")
		}
		if initLeavesProject(command) {
			problems = append(problems, "fix command "+command+" reaches outside the project folder; use a path inside the project")
		}
		if initChangesRepositoryState(command) {
			problems = append(problems, "fix command "+command+" changes the repository state")
		}
		if initPublishesOrDeploys(command) {
			problems = append(problems, "fix command "+command+" publishes or deploys")
		}
	}
	if len(problems) > 0 {
		return InitProposal{}, problems
	}
	return InitProposal{Setup: setup, Fix: fix, Checks: checks, Protect: protect}, nil
}

// initMachinePrerequisite recognizes literal command words without running them.
func initMachinePrerequisite(command string) bool {
	var parts [][]string
	var separators []byte
	var words []string
	var word strings.Builder
	var quote rune
	escaped := false
	flushWord := func() {
		if word.Len() > 0 {
			words = append(words, word.String())
			word.Reset()
		}
	}
	flushPart := func(sep byte) {
		flushWord()
		parts = append(parts, words)
		words = nil
		separators = append(separators, sep)
	}
	for _, r := range command {
		if escaped {
			word.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' && quote != '\'' {
			word.WriteRune(r)
			escaped = true
			continue
		}
		if quote != 0 {
			word.WriteRune(r)
			if r == quote {
				quote = 0
			}
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			word.WriteRune(r)
		} else if r == ';' || r == '&' || r == '|' || r == '\n' {
			flushPart(byte(r))
		} else if unicode.IsSpace(r) {
			flushWord()
		} else {
			word.WriteRune(r)
		}
	}
	flushPart(0)
	for i, w := range parts {
		if len(w) == 0 {
			continue
		}
		if w[0] == "sudo" {
			return true
		}
		if w[0] == "curl" && separators[i] == '|' && i+1 < len(parts) && len(parts[i+1]) > 0 && (parts[i+1][0] == "sh" || parts[i+1][0] == "bash") {
			return true
		}
		if len(w) < 2 {
			continue
		}
		switch w[0] {
		case "mix":
			if w[1] == "local.hex" || w[1] == "local.rebar" {
				return true
			}
		case "npm":
			if (w[1] == "install" || w[1] == "i") && (slices.Contains(w[2:], "-g") || slices.Contains(w[2:], "--global")) {
				return true
			}
		case "yarn":
			if len(w) >= 3 && w[1] == "global" && w[2] == "add" {
				return true
			}
		case "pnpm":
			if w[1] == "add" && slices.Contains(w[2:], "-g") {
				return true
			}
		case "pip", "pip3":
			if w[1] == "install" && !slices.Contains(w[2:], "-r") && !slices.Contains(w[2:], "--target") {
				editable := false
				for j := 2; j+1 < len(w); j++ {
					if w[j] == "-e" && w[j+1] == "." {
						editable = true
					}
				}
				if !editable {
					return true
				}
			}
		case "gem", "cargo", "go", "brew", "apt", "apt-get":
			if w[1] == "install" {
				return true
			}
		case "apk":
			if w[1] == "add" {
				return true
			}
		}
	}
	return false
}

// initLongRunning matches literal command words without executing the proposal.
func initLongRunning(command string) bool {
	for _, part := range initSetupPartsRE.Split(command, -1) {
		words := strings.Fields(part)
		if len(words) == 0 {
			continue
		}
		if words[0] == "npx" && len(words) > 1 && slices.Contains([]string{"jest", "vitest", "mocha", "tsc"}, words[1]) {
			words = words[1:]
		}
		watch := slices.Contains([]string{"jest", "vitest", "mocha", "tsc"}, words[0])
		if len(words) >= 2 && words[0] == "mix" && words[1] == "test" {
			watch = true
		}
		if watch && (slices.Contains(words[1:], "--watch") || slices.Contains(words[1:], "--watchAll") || slices.Contains(words[1:], "-w")) {
			return true
		}
		for _, prefix := range [][]string{{"mix", "test.watch"}, {"mix", "phx.server"}, {"npm", "start"}, {"npm", "run", "dev"}, {"npm", "run", "serve"}, {"yarn", "start"}, {"yarn", "dev"}, {"pnpm", "dev"}, {"rails", "server"}, {"rails", "s"}, {"flask", "run"}, {"python", "-m", "http.server"}, {"tail", "-f"}} {
			if len(words) >= len(prefix) && slices.Equal(words[:len(prefix)], prefix) {
				return true
			}
		}
		compose := len(words) >= 3 && slices.Equal(words[:3], []string{"docker", "compose", "up"}) || len(words) >= 2 && slices.Equal(words[:2], []string{"docker-compose", "up"})
		if compose && !slices.Contains(words, "-d") && !slices.Contains(words, "--detach") {
			return true
		}
		if len(words) >= 2 && words[0] == "sleep" {
			duration := words[1]
			multiplier := 1.0
			if len(duration) > 0 {
				switch duration[len(duration)-1] {
				case 's':
					duration = duration[:len(duration)-1]
				case 'm':
					multiplier = 60
					duration = duration[:len(duration)-1]
				case 'h':
					multiplier = 3600
					duration = duration[:len(duration)-1]
				case 'd':
					multiplier = 86400
					duration = duration[:len(duration)-1]
				}
			}
			if n, err := strconv.ParseFloat(duration, 64); err == nil && n*multiplier > 60 {
				return true
			}
		}
	}
	return false
}

// initLeavesProject examines unquoted and double-quoted lexical words without executing them.
func initLeavesProject(command string) bool {
	var word strings.Builder
	escapes := func() bool {
		w := word.String()
		word.Reset()
		clean := path.Clean(w)
		return w == "~" || strings.HasPrefix(w, "~/") || clean == ".." || strings.HasPrefix(clean, "../")
	}
	single, double := false, false
	for i := 0; i < len(command); {
		c := command[i]
		if single {
			if c == '\'' {
				single = false
			}
			i++
			continue
		}
		if c == '\'' && !double {
			if escapes() {
				return true
			}
			single = true
			i++
			continue
		}
		if c == '"' {
			double = !double
			i++
			continue
		}
		if c == '$' && (strings.HasPrefix(command[i:], "${HOME}") || strings.HasPrefix(command[i:], "$HOME") && (i+5 == len(command) || !(command[i+5] == '_' || command[i+5] >= 'a' && command[i+5] <= 'z' || command[i+5] >= 'A' && command[i+5] <= 'Z' || command[i+5] >= '0' && command[i+5] <= '9'))) {
			return true
		}
		r, size := utf8.DecodeRuneInString(command[i:])
		if unicode.IsSpace(r) || strings.ContainsRune(";&|<>()", r) {
			if escapes() {
				return true
			}
		} else {
			word.WriteRune(r)
		}
		i += size
	}
	return escapes()
}

// initNamesRoot matches the literal root only at a specified trailing boundary.
func initNamesRoot(command, root string) bool {
	if root == "" {
		return false
	}
	for offset := 0; offset <= len(command)-len(root); {
		i := strings.Index(command[offset:], root)
		if i < 0 {
			return false
		}
		end := offset + i + len(root)
		if end == len(command) {
			return true
		}
		r, _ := utf8.DecodeRuneInString(command[end:])
		if r == '/' || r == '\'' || r == '"' || unicode.IsSpace(r) {
			return true
		}
		offset += i + 1
	}
	return false
}

// initChangesRepositoryState matches literal Git actions in each command part.
func initChangesRepositoryState(command string) bool {
	for _, part := range initCommandPartsRE.Split(command, -1) {
		words := strings.Fields(part)
		if len(words) < 2 || words[0] != "git" {
			continue
		}
		if slices.Contains([]string{"reset", "clean", "checkout", "restore", "stash", "commit", "rebase", "merge", "cherry-pick", "tag", "branch", "am", "apply"}, words[1]) &&
			!(words[1] == "apply" && slices.Contains(words[2:], "--check")) {
			return true
		}
	}
	return false
}

// initPublishesOrDeploys matches the specified initial command words in each part.
func initPublishesOrDeploys(command string) bool {
	for _, part := range initCommandPartsRE.Split(command, -1) {
		words := strings.Fields(part)
		if len(words) < 2 {
			continue
		}
		action := words[0] + " " + words[1]
		publishing := slices.Contains([]string{"git push", "npm publish", "yarn publish", "pnpm publish", "cargo publish", "gem push", "twine upload", "docker push", "mix hex.publish"}, action)
		deploying := slices.Contains([]string{"terraform apply", "kubectl apply", "helm install", "helm upgrade"}, action)
		if (publishing || deploying) && !slices.Contains(words[2:], "--dry-run") && !(publishing && slices.Contains(words[2:], "-n")) {
			return true
		}
	}
	return false
}

// initMasksFailure recognizes only unquoted literal failure-masking tails.
func initMasksFailure(command string) bool {
	quote := byte(0)
	for i := 0; i < len(command); i++ {
		c := command[i]
		if c == '\\' && quote != '\'' {
			i++
			continue
		}
		if quote != 0 {
			if c == quote {
				quote = 0
			}
			continue
		}
		if c == '\'' || c == '"' {
			quote = c
			continue
		}
		if c == '#' && (i == 0 || strings.ContainsRune(" \t\r\n;|&()", rune(command[i-1]))) {
			for i < len(command) && command[i] != '\n' {
				i++
			}
			continue
		}
		if strings.TrimSpace(command[:i]) == "" {
			continue
		}
		if c == '&' {
			if i+1 < len(command) && command[i+1] == '&' {
				i++
			} else if strings.TrimSpace(command[i+1:]) == "" {
				return true
			}
		} else if c == ';' || (c == '|' && i+1 < len(command) && command[i+1] == '|') {
			end := i + 1
			if c == '|' {
				end++
			}
			words := strings.Fields(command[end:])
			if slices.Equal(words, []string{"true"}) || slices.Equal(words, []string{":"}) || slices.Equal(words, []string{"exit", "0"}) {
				return true
			}
			i = end - 1
		}
	}
	return false
}

// initRunsNothing recognizes only a small, literal subset of shell commands.
func initRunsNothing(command string) bool {
	var words []string
	var word strings.Builder
	inWord := false
	quote := byte(0)
	validCommand := func() bool {
		if inWord {
			words = append(words, word.String())
			word.Reset()
			inWord = false
		}
		valid := false
		if len(words) > 0 {
			switch words[0] {
			case "true", ":":
				valid = len(words) == 1
			case "exit":
				valid = len(words) == 2 && words[1] == "0"
			case "echo", "printf":
				valid = true
			}
		}
		words = nil
		return valid
	}
	for i := 0; i < len(command); i++ {
		c := command[i]
		if quote != 0 {
			if c == quote {
				quote = 0
			} else if quote == '"' && (c == '$' || c == '`') {
				return false
			} else if quote == '"' && c == '\\' {
				if i+1 >= len(command) {
					return false
				}
				next := command[i+1]
				if strings.ContainsRune("$`\\\"", rune(next)) {
					word.WriteByte(next)
					i++
				} else if next == '\n' {
					i++
				} else {
					word.WriteByte(c)
				}
			} else {
				word.WriteByte(c)
			}
			continue
		}
		switch c {
		case '\'', '"':
			quote = c
			inWord = true
		case ' ', '\t', '\r':
			if inWord {
				words = append(words, word.String())
				word.Reset()
				inWord = false
			}
		case ';', '|', '&', '\n':
			if !validCommand() {
				return false
			}
			if c == '&' {
				if i+1 >= len(command) || command[i+1] != '&' {
					return false
				}
				i++
			} else if c == '|' && i+1 < len(command) && command[i+1] == '|' {
				i++
			}
		case '$', '`', '>', '<', '(', ')', '\\', '*', '?', '[', ']', '{', '}', '#', '~':
			return false
		default:
			word.WriteByte(c)
			inWord = true
		}
	}
	return quote == 0 && validCommand()
}

func initStrings(args map[string]any, key string) ([]string, string) {
	v, present := args[key]
	if !present {
		return nil, ""
	}
	var items []any
	switch l := v.(type) {
	case []any:
		items = l
	case []string:
		for _, x := range l {
			items = append(items, x)
		}
	default:
		return nil, key + " must be a list"
	}
	out := make([]string, 0, len(items))
	for _, it := range items {
		str, ok := it.(string)
		if !ok || (strings.TrimSpace(str) == "" && !strings.ContainsFunc(str, unicode.IsControl)) {
			return nil, key + " must be a list of non-empty commands"
		}
		out = append(out, str)
	}
	return out, ""
}

func initChecks(args map[string]any) ([]project.Check, []string) {
	v, present := args["checks"]
	if !present {
		return nil, nil
	}
	var items []any
	switch l := v.(type) {
	case []any:
		items = l
	case []map[string]any:
		for _, x := range l {
			items = append(items, x)
		}
	default:
		return nil, []string{"checks must be a list"}
	}
	var checks []project.Check
	var problems []string
	for _, it := range items {
		m, _ := it.(map[string]any)
		name, nameOK := m["name"].(string)
		run, runOK := m["run"].(string)
		switch {
		case !nameOK || !runOK:
			problems = append(problems, "each check needs a name and a run command")
		case name == "acceptance" || name == "model":
			problems = append(problems, "check name "+name+" is reserved")
		case !initCheckNameRE.MatchString(name):
			problems = append(problems, "check name "+name+" must be lowercase letters, digits and dashes")
		case slices.ContainsFunc(checks, func(c project.Check) bool { return c.Name == name }):
			problems = append(problems, "check name "+name+" is used twice")
		case strings.TrimSpace(run) == "" && !strings.ContainsFunc(run, unicode.IsControl):
			problems = append(problems, "check "+name+" has no command")
		default:
			checks = append(checks, project.Check{Name: name, Run: run})
		}
	}
	return checks, problems
}

// initProtectProblem is why path cannot be protected, or "" when it can.
func initProtectProblem(p, text string, hasText bool, checks []project.Check) string {
	base := path.Base(p)
	switch {
	case slices.Contains([]string{"mix.lock", "package-lock.json", "npm-shrinkwrap.json", "go.sum"}, base):
		return "dependency lockfiles are editable inputs, not verification definitions"
	case base == "go.mod":
		return "Go module requirements are editable dependency metadata, not verification definitions"
	case (base == "mix.exs" || base == "package.json") && hasText:
		explanation := "npm package and dependency metadata is editable; verification definitions or embedded settings can be protected as a whole"
		configured := initPackageVerification(text, checks)
		if base == "mix.exs" {
			explanation = "Mix project and dependency metadata is editable; verification definitions or embedded settings can be protected as a whole"
			configured = initMixVerification(text, checks)
		}
		if configured {
			return ""
		}
		return explanation
	case base == "mix.exs" || base == "package.json":
		return "dependency manifest content is unavailable for verification-definition validation"
	}
	return ""
}

func initPackageVerification(text string, checks []project.Check) bool {
	var pkg map[string]any
	if json.Unmarshal([]byte(text), &pkg) != nil || pkg == nil {
		return false
	}
	for _, key := range []string{"eslintConfig", "prettier", "stylelint", "jest"} {
		if _, ok := pkg[key]; ok {
			return true
		}
	}
	scripts, _ := pkg["scripts"].(map[string]any) // anything else is an empty map here
	for _, c := range checks {
		m := initNpmScriptRE.FindStringSubmatch(c.Run)
		if m == nil {
			continue
		}
		body, ok := scripts[m[1]].(string)
		if ok && strings.TrimSpace(body) != "" && strings.TrimSpace(body) != initNpmPlaceholder {
			return true
		}
	}
	return false
}

// Merge is the detected commands with the model's proposal merged in (SET-11): a proposed
// check replaces the detected check of the same name, other proposed checks are added after
// the detected ones; proposed setup entries and fixers follow the detected ones unless
// already present; protect is the union; checks with the same command run once.
func Merge(detected project.Detected, proposed InitProposal) InitProposal {
	byName := map[string]project.Check{}
	for _, c := range proposed.Checks {
		byName[c.Name] = c
	}
	names := map[string]bool{}
	var checks []project.Check
	for _, c := range detected.Checks {
		names[c.Name] = true
		if p, ok := byName[c.Name]; ok {
			c = p
		}
		checks = append(checks, c)
	}
	for _, c := range proposed.Checks {
		if !names[c.Name] {
			checks = append(checks, c)
		}
	}
	seen := map[string]bool{}
	unique := []project.Check{}
	for _, c := range checks {
		key := initCommandKey(c.Run)
		if !seen[key] {
			seen[key] = true
			unique = append(unique, c)
		}
	}
	return InitProposal{
		Setup:   initUnion(detected.Setup, proposed.Setup),
		Fix:     initUnion(detected.Fix, proposed.Fix),
		Checks:  unique,
		Protect: initPathUnion(detected.Protect, proposed.Protect),
	}
}

// initCommandKey preserves quoted bytes while normalizing outside spaces and tabs.
func initCommandKey(command string) string {
	command = strings.TrimSpace(command)
	var out strings.Builder
	var quote byte
	escaped := false
	space := false
	for i := 0; i < len(command); i++ {
		c := command[i]
		if quote == 0 && (c == ' ' || c == '\t') {
			if !space {
				out.WriteByte(' ')
			}
			space = true
		} else {
			out.WriteByte(c)
			space = false
			if (c == '\'' || c == '"') && !escaped {
				if quote == 0 {
					quote = c
				} else if quote == c {
					quote = 0
				}
			}
		}
		if c == '\\' {
			escaped = !escaped
		} else {
			escaped = false
		}
	}
	return out.String()
}

func initUnion(a, b []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, s := range append(slices.Clone(a), b...) {
		key := initCommandKey(s)
		if !seen[key] {
			seen[key] = true
			out = append(out, s)
		}
	}
	return out
}

func initNormalizeProtect(p string) string {
	parts := strings.Split(p, "/")
	var kept []string
	for _, part := range parts {
		if part != "" && part != "." {
			kept = append(kept, part)
		}
	}
	result := strings.Join(kept, "/")
	if strings.HasPrefix(p, "/") {
		return "/" + result
	}
	if result == "" {
		return "."
	}
	return result
}

func initPathUnion(a, b []string) []string {
	out := []string{}
	for _, s := range append(slices.Clone(a), b...) {
		s = initNormalizeProtect(s)
		if !slices.Contains(out, s) {
			out = append(out, s)
		}
	}
	return out
}

// ---- SET-12, SET-13: run everything on a copy of the committed tree ----

// initCommittedCopy copies the working tree with its ignored folders into clone, every
// changed path reset to HEAD or removed.
func initCommittedCopy(s *sys.Session, repo *git.Repo, root, clone string, tracked []string) error {
	if err := os.MkdirAll(clone, 0o755); err != nil {
		return err
	}
	if err := verify.CopyTree(root, clone); err != nil {
		return err
	}
	changed, err := repo.ChangedPaths()
	if err != nil {
		return err
	}
	var restore []string
	for _, p := range changed {
		if err := os.RemoveAll(filepath.Join(clone, p)); err != nil {
			return err
		}
		if slices.Contains(tracked, p) {
			restore = append(restore, p)
		}
	}
	if len(restore) == 0 {
		return nil
	}
	quoted := make([]string, len(restore))
	for i, p := range restore {
		quoted[i] = initShellQuote(p)
	}
	res, err := s.Run(git.UnsetPrefix()+"git archive --format=tar HEAD -- "+strings.Join(quoted, " ")+" | tar -xf - -C "+initShellQuote(clone), root, sys.Options{KillGroupOnExit: true})
	if err != nil {
		return err
	}
	if res.Status != 0 {
		return fmt.Errorf("restoring the committed files for init failed: %s", res.Output)
	}
	return nil
}

type initResult struct {
	setup, fix, protect []string
	checks              []project.Check
	acceptance          *project.Acceptance
	how                 string
	bridge              bool
	leftOut             []string
}

// filterProtect rechecks proposed protection against the checks that survived verification.
func (res *initResult) filterProtect(protect []string, manifests map[string]string) {
	if len(res.checks) == 0 {
		return
	}
	for _, p := range protect {
		text, ok := manifests[p]
		if initProtectProblem(p, text, ok, res.checks) != "" {
			res.leftOut = append(res.leftOut, p)
		} else {
			res.protect = append(res.protect, p)
		}
	}
}

func initExec(s *sys.Session, tools verify.Tools, command, dir string) (sys.Result, error) {
	env := map[string]string{}
	for k, v := range map[string]string{"KOGEN_NODE": tools.Node, "KOGEN_QUINT": tools.Quint, "KOGEN_CUCUMBER": tools.Cucumber} {
		if v != "" {
			env[k] = v
		}
	}
	return s.Run(command, dir, sys.Options{Env: env, KillGroupOnExit: true, Timeout: initExecTimeout})
}

// initRanNoTests classifies only recognized reports; positive evidence wins.
func initRanNoTests(output string) bool {
	return initNoTestsRE.MatchString(output) && !initPositiveTestsRE.MatchString(output)
}

// initCommandFailure describes an unsuccessful verification command.
func initCommandFailure(name, command string, r sys.Result) string {
	if r.TimedOut {
		limit := initCommandTimeout.String()
		if initCommandTimeout%time.Minute == 0 {
			limit = strings.TrimSuffix(limit, "0s")
		}
		return fmt.Sprintf("%s (%s) timed out after %s", name, command, limit)
	}
	if r.Status != 0 {
		return fmt.Sprintf("%s (%s) failed with status %d", name, command, r.Status)
	}
	return ""
}

// initOutputTail formats captured output for left-out command diagnostics.
func initOutputTail(output string) []string {
	if output == "" {
		return nil
	}
	lines := strings.Split(strings.TrimSuffix(output, "\n"), "\n")
	if len(lines) > 20 {
		lines = lines[len(lines)-20:]
	}
	for i, line := range lines {
		chars := []rune(line)
		if len(chars) > 200 {
			chars = chars[:200]
		}
		lines[i] = "  | " + string(chars)
	}
	return lines
}

func initShowOutput(s *sys.Session, output string) {
	for _, line := range initOutputTail(output) {
		s.Progress(line)
	}
}

func initVerify(ctx context.Context, s *sys.Session, in InitInput, repo *git.Repo, clone string, tracked []string, candidates InitProposal, runner string) (initResult, error) {
	gitDir, err := repo.GitDir()
	if err != nil {
		return initResult{}, err
	}
	var res initResult
	// Setup runs before every Build, so each entry must run twice on the same tree (SET-12).
	for i, cmd := range candidates.Setup {
		n := i + 1
		backup, err := os.MkdirTemp(filepath.Dir(clone), "setup-before-")
		if err != nil {
			return res, err
		}
		err = func() error {
			defer os.RemoveAll(backup)
			archive := filepath.Join(backup, "tree.tar")
			if output, err := exec.Command("tar", "-cf", archive, "-C", clone, ".").CombinedOutput(); err != nil {
				return fmt.Errorf("snapshotting setup copy: %w: %s", err, output)
			}
			if err := os.Mkdir(filepath.Join(backup, "tree"), 0o700); err != nil {
				return err
			}
			if output, err := exec.Command("tar", "-xpf", archive, "-C", filepath.Join(backup, "tree")).CombinedOutput(); err != nil {
				return fmt.Errorf("snapshotting setup copy: %w: %s", err, output)
			}
			restore := func() error {
				if err := os.RemoveAll(clone); err != nil {
					return err
				}
				return os.Rename(filepath.Join(backup, "tree"), clone)
			}
			snapshot, err := initTrackedSnapshot(clone, tracked)
			if err != nil {
				return err
			}
			s.Progress(fmt.Sprintf("kogen: running setup-%d: %s", n, cmd))
			r, err := initExec(s, in.Tools, cmd, clone)
			if err != nil {
				return err
			}
			if failure := initCommandFailure(fmt.Sprintf("setup-%d", n), cmd, r); failure != "" {
				initShowOutput(s, r.Output)
				res.leftOut = append(res.leftOut, failure)
				return restore()
			}
			first, err := initTreeState(repo, gitDir, clone)
			if err != nil {
				return err
			}
			firstSnapshot, err := initTrackedSnapshot(clone, tracked)
			if err != nil {
				return err
			}
			firstChanged := initTrackedChanged(tracked, snapshot, firstSnapshot)
			s.Progress(fmt.Sprintf("kogen: running setup-%d again: %s", n, cmd))
			again, err := initExec(s, in.Tools, cmd, clone)
			if err != nil {
				return err
			}
			second, err := initTreeState(repo, gitDir, clone)
			if err != nil {
				return err
			}
			secondSnapshot, err := initTrackedSnapshot(clone, tracked)
			if err != nil {
				return err
			}
			kept := false
			switch {
			case again.TimedOut:
				initShowOutput(s, again.Output)
				res.leftOut = append(res.leftOut, initCommandFailure(fmt.Sprintf("setup-%d", n), cmd, again))
			case again.Status != 0:
				initShowOutput(s, again.Output)
				res.leftOut = append(res.leftOut, fmt.Sprintf("setup-%d (%s) is not repeatable: its second run failed with status %d", n, cmd, again.Status))
			case !initSameState(first, second):
				initShowOutput(s, again.Output)
				var changed []string
				for p, v := range first {
					if w, ok := second[p]; !ok || w != v {
						changed = append(changed, p)
					}
				}
				for p := range second {
					if _, ok := first[p]; !ok {
						changed = append(changed, p)
					}
				}
				sort.Strings(changed)
				res.leftOut = append(res.leftOut, fmt.Sprintf("setup-%d (%s) is not repeatable: its second run changed %s", n, cmd, strings.Join(changed, ", ")))
			case len(firstChanged) > 0:
				res.leftOut = append(res.leftOut, fmt.Sprintf("setup-%d (%s) changed %s", n, cmd, initChangedDisplay(firstChanged)))
			default:
				if err := initRestoreTracked(clone, snapshot, initTrackedChanged(tracked, snapshot, secondSnapshot)); err != nil {
					return err
				}
				res.setup = append(res.setup, cmd)
				kept = true
			}
			if !kept {
				return restore()
			}
			return nil
		}()
		if err != nil {
			return res, err
		}
	}

	if runner != "" {
		err = initExistingRunner(ctx, s, in, clone, runner, &res)
	} else {
		err = initAddBridge(ctx, s, in, clone, &res)
	}
	if err != nil {
		return res, err
	}

	for _, check := range candidates.Checks {
		err := func() (resultErr error) {
			before, err := initTreeState(repo, gitDir, clone)
			if err != nil {
				return err
			}
			dirs, ignored, err := initCheckDirs(repo, gitDir, clone)
			if err != nil {
				return err
			}
			paths := append([]string(nil), tracked...)
			for p := range before {
				paths = append(paths, p)
			}
			snapshot, err := initTrackedSnapshot(clone, paths)
			if err != nil {
				return err
			}
			defer func() {
				args := []string{"--git-dir=" + gitDir, "--work-tree=" + clone, "clean", "-ffdx"}
				for _, p := range ignored {
					args = append(args, "-e", "/"+strings.NewReplacer(`\`, `\\`, `*`, `\*`, `?`, `\?`, `[`, `\[`).Replace(p))
				}
				r, err := repo.Observing().RunEnv([]string{"GIT_OPTIONAL_LOCKS=0"}, args...)
				if err == nil && r.Status != 0 {
					err = fmt.Errorf("git clean in the init copy failed (status %d): %s", r.Status, strings.TrimSpace(r.Stderr))
				}
				if err == nil {
					for _, dir := range dirs {
						if err = os.MkdirAll(filepath.Join(clone, dir), 0o755); err != nil {
							break
						}
					}
				}
				if err == nil {
					var current map[string]initSavedFile
					current, err = initTrackedSnapshot(clone, paths)
					if err == nil {
						err = initRestoreTracked(clone, snapshot, initTrackedChanged(paths, snapshot, current))
					}
				}
				if resultErr == nil {
					resultErr = err
				}
			}()
			for run := 0; run < 2; run++ {
				if run == 0 {
					s.Progress(fmt.Sprintf("kogen: checking %s: %s", check.Name, check.Run))
				} else {
					s.Progress(fmt.Sprintf("kogen: running %s again: %s", check.Name, check.Run))
				}
				r, err := initExec(s, in.Tools, check.Run, clone)
				if err != nil {
					return err
				}
				if failure := initCommandFailure(check.Name, check.Run, r); failure != "" {
					initShowOutput(s, r.Output)
					if run == 1 {
						prefix := fmt.Sprintf("%s (%s) ", check.Name, check.Run)
						failure = prefix + "is not repeatable: its second run " + strings.TrimPrefix(failure, prefix)
					}
					res.leftOut = append(res.leftOut, failure)
					return nil
				}
				after, err := initTreeState(repo, gitDir, clone)
				if err != nil {
					return err
				}
				afterSnapshot, err := initTrackedSnapshot(clone, tracked)
				if err != nil {
					return err
				}
				var changed []string
				for _, p := range tracked {
					old, newFile := snapshot[p], afterSnapshot[p]
					if before[p] != after[p] || old.exists != newFile.exists || !bytes.Equal(old.data, newFile.data) || old.mode.Type() != newFile.mode.Type() {
						changed = append(changed, p)
					}
				}
				if len(changed) > 0 {
					sort.Strings(changed)
					res.leftOut = append(res.leftOut, fmt.Sprintf("%s (%s) changed %s", check.Name, check.Run, initChangedDisplay(changed)))
					return nil
				}
				if initRanNoTests(r.Output) {
					res.leftOut = append(res.leftOut, fmt.Sprintf("%s (%s) ran no tests", check.Name, check.Run))
					return nil
				}
			}
			res.checks = append(res.checks, check)
			return nil
		}()
		if err != nil {
			return res, err
		}
	}
	// Fixers run last, once each, so they cannot change which checks are kept.
	for i, cmd := range candidates.Fix {
		n := i + 1
		s.Progress(fmt.Sprintf("kogen: running fix-%d: %s", n, cmd))
		r, err := initExec(s, in.Tools, cmd, clone)
		if err != nil {
			return res, err
		}
		if failure := initCommandFailure(fmt.Sprintf("fix-%d", n), cmd, r); failure != "" {
			initShowOutput(s, r.Output)
			res.leftOut = append(res.leftOut, failure)
		} else {
			res.fix = append(res.fix, cmd)
		}
	}
	return res, nil
}

// initCheckDirs retains empty nonignored directories without traversing ignored dependencies.
func initCheckDirs(repo *git.Repo, gitDir, clone string) ([]string, []string, error) {
	r, err := repo.Observing().RunEnv([]string{"GIT_OPTIONAL_LOCKS=0"},
		"--git-dir="+gitDir, "--work-tree="+clone, "status", "--porcelain=v1", "-z", "--ignored", "--untracked-files=all")
	if err != nil {
		return nil, nil, err
	}
	if r.Status != 0 {
		return nil, nil, fmt.Errorf("git status in the init copy failed (status %d): %s", r.Status, strings.TrimSpace(r.Stderr))
	}
	ignored := map[string]bool{}
	var excluded []string
	for _, entry := range strings.Split(r.Stdout, "\x00") {
		if strings.HasPrefix(entry, "!! ") {
			ignored[strings.TrimSuffix(entry[3:], "/")] = true
			excluded = append(excluded, entry[3:])
		}
	}
	var dirs []string
	err = filepath.WalkDir(clone, func(name string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() || name == clone {
			return nil
		}
		rel, err := filepath.Rel(clone, name)
		if err != nil {
			return err
		}
		if ignored[filepath.ToSlash(rel)] {
			return filepath.SkipDir
		}
		dirs = append(dirs, rel)
		return nil
	})
	return dirs, excluded, err
}

func initTrackedChanged(tracked []string, before, after map[string]initSavedFile) []string {
	var changed []string
	for _, p := range tracked {
		a, b := before[p], after[p]
		if a.exists != b.exists || a.mode != b.mode || !bytes.Equal(a.data, b.data) {
			changed = append(changed, p)
		}
	}
	sort.Strings(changed)
	return changed
}

func initRestoreTracked(clone string, snapshot map[string]initSavedFile, changed []string) error {
	for _, p := range changed {
		// A command may replace a tracked file's parent directory with a file.
		for dir := filepath.Dir(p); dir != "."; dir = filepath.Dir(dir) {
			name := filepath.Join(clone, dir)
			if st, err := os.Lstat(name); err == nil && !st.IsDir() {
				if err := os.RemoveAll(name); err != nil {
					return err
				}
			}
		}
		if err := snapshot[p].restore(filepath.Join(clone, p)); err != nil {
			return err
		}
	}
	return nil
}

func initChangedDisplay(changed []string) string {
	suffix := ""
	if len(changed) > 5 {
		changed = changed[:5]
		suffix = ", ..."
	}
	return strings.Join(changed, ", ") + suffix
}

type initSavedFile struct {
	mode   os.FileMode
	data   []byte
	exists bool
}

func initTrackedSnapshot(clone string, tracked []string) (map[string]initSavedFile, error) {
	files := make(map[string]initSavedFile, len(tracked))
	for _, p := range tracked {
		name := filepath.Join(clone, p)
		st, err := os.Lstat(name)
		if os.IsNotExist(err) || errors.Is(err, syscall.ENOTDIR) {
			continue
		}
		if err != nil {
			return nil, err
		}
		f := initSavedFile{mode: st.Mode(), exists: true}
		if st.Mode()&os.ModeSymlink != 0 {
			link, err := os.Readlink(name)
			if err != nil {
				return nil, err
			}
			f.data = []byte(link)
		} else if st.Mode().IsRegular() {
			f.data, err = os.ReadFile(name)
			if err != nil {
				return nil, err
			}
		}
		files[p] = f
	}
	return files, nil
}

func (f initSavedFile) restore(name string) error {
	if err := os.RemoveAll(name); err != nil {
		return err
	}
	if !f.exists {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(name), 0755); err != nil {
		return err
	}
	if f.mode&os.ModeSymlink != 0 {
		return os.Symlink(string(f.data), name)
	}
	return os.WriteFile(name, f.data, f.mode.Perm())
}

func initSameState(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for p, v := range a {
		if w, ok := b[p]; !ok || w != v {
			return false
		}
	}
	return true
}

// initTreeState lists the paths of the copy that differ from HEAD (by the repository's own
// ignore rules) with their digests.
func initTreeState(repo *git.Repo, gitDir, clone string) (map[string]string, error) {
	r, err := repo.Observing().RunEnv([]string{"GIT_OPTIONAL_LOCKS=0"},
		"--git-dir="+gitDir, "--work-tree="+clone, "--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all")
	if err != nil {
		return nil, err
	}
	if r.Status != 0 {
		return nil, fmt.Errorf("git status in the init copy failed (status %d): %s", r.Status, strings.TrimSpace(r.Stderr))
	}
	state := map[string]string{}
	for _, entry := range strings.Split(r.Stdout, "\x00") {
		if len(entry) < 3 || entry[2] != ' ' {
			continue
		}
		p := entry[3:]
		digest := "absent"
		file := filepath.Join(clone, p)
		if st, err := os.Lstat(file); err == nil && st.Mode().IsRegular() {
			if data, err := os.ReadFile(file); err == nil {
				sum := sha256.Sum256(data)
				digest = "sha256:" + hex.EncodeToString(sum[:])
			}
		}
		state[p] = digest
	}
	return state, nil
}

func initExistingRunner(ctx context.Context, s *sys.Session, in InitInput, clone, stepsDir string, res *initResult) error {
	run := project.AcceptanceCommand(stepsDir, project.ProjectRunner)
	reason, _, err := verify.RunnerCheck(ctx, s, in.Tools, clone, run)
	if err != nil {
		return err
	}
	if reason != "" {
		res.how = "not configured: " + reason
		return nil
	}
	res.acceptance = &project.Acceptance{Run: run, StepsDir: stepsDir}
	res.how = "existing Cucumber runner, steps in " + stepsDir
	return nil
}

func initAddBridge(ctx context.Context, s *sys.Session, in InitInput, clone string, res *initResult) error {
	if err := os.MkdirAll(filepath.Join(clone, "features/steps"), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(clone, initStepsReadmePath), []byte(initStepsReadme), 0o644); err != nil {
		return err
	}
	run := project.AcceptanceCommand("features/steps", project.KogenRunner)
	reason, _, err := verify.RunnerCheck(ctx, s, in.Tools, clone, run)
	if err != nil {
		return err
	}
	if reason != "" {
		res.how = "not configured: " + reason
		return nil
	}
	res.acceptance = &project.Acceptance{Run: run, StepsDir: "features/steps"}
	res.how = "Cucumber bridge added in features/steps"
	res.bridge = true
	return nil
}

// ---- writing and committing ----

func initWriteFiles(repo *git.Repo, root, head, config string, files map[string]string) error {
	if err := os.MkdirAll(filepath.Join(root, ".kogen"), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(root, project.ConfigPath), []byte(config), 0o644); err != nil {
		return err
	}
	var committed string
	if head != "" {
		committed, _ = repo.Show(head, ".gitignore")
	} else {
		committed = initRead(filepath.Join(root, ".gitignore"))
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(initWithLine(committed, initIgnore)), 0o644); err != nil {
		return err
	}
	names := make([]string, 0, len(files))
	for p := range files {
		names = append(names, p)
	}
	sort.Strings(names)
	for _, p := range names {
		file := filepath.Join(root, p)
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(file, []byte(files[p]), 0o644); err != nil {
			return err
		}
	}
	return nil
}

func initWithLine(text, line string) string {
	switch {
	case slices.Contains(strings.Split(text, "\n"), line):
		return text
	case text == "" || strings.HasSuffix(text, "\n"):
		return text + line + "\n"
	}
	return text + "\n" + line + "\n"
}

func initRead(file string) string {
	b, err := os.ReadFile(file)
	if err != nil {
		return ""
	}
	return string(b)
}

// initCommit is a plain git commit of exactly these paths; head is "" before the first commit.
func initCommit(s *sys.Session, repo *git.Repo, paths []string, head string) (string, error) {
	subject := "Initial commit"
	if head != "" {
		subject = "Add Kogen configuration"
	}
	return repo.CommitPaths(s, subject, paths, head != "")
}

func initShellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

// ---- Mix verification settings ----
//
// The Elixir Kogen parses the committed mix.exs without evaluating it and asks whether its
// project settings or aliases define verification. The scanner below reads the same facts
// from a token stream: it finds the zero-argument `def`/`defp` functions, takes the last
// expression of each body and, when that is a literal keyword list, its keys and values.
// Comments, strings, sigils and heredocs never count.

type initKind int

const (
	initIdent initKind = iota
	initKwKey          // `key:`; text is the key
	initAtom
	initStr
	initNum
	initOp
	initPunct
	initNL
)

type initTok struct {
	kind initKind
	text string
}

func (t initTok) is(kind initKind, text string) bool { return t.kind == kind && t.text == text }

func (t initTok) opens() bool {
	return t.kind == initPunct && (t.text == "(" || t.text == "[" || t.text == "{" || t.text == "<<") ||
		t.kind == initIdent && (t.text == "do" || t.text == "fn")
}

func (t initTok) closes() bool {
	return t.kind == initPunct && (t.text == ")" || t.text == "]" || t.text == "}" || t.text == ">>") ||
		t.is(initIdent, "end")
}

func initIsIdentStart(c byte) bool {
	return c == '_' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= 0x80
}

func initIsIdentChar(c byte) bool { return initIsIdentStart(c) || c >= '0' && c <= '9' || c == '@' }

const initOpChars = "+-*/<>=!&|^~@%\\"

// initSkipQuoted returns the index after the string that starts at src[i] (a quote), or -1.
func initSkipQuoted(src string, i int, interpolate bool) int {
	quote := src[i]
	if strings.HasPrefix(src[i:], strings.Repeat(string(quote), 3)) {
		return initSkipHeredoc(src, i, quote, interpolate)
	}
	return initSkipUntil(src, i+1, quote, interpolate)
}

// initSkipUntil finds the unescaped closer from j on.
func initSkipUntil(src string, j int, closer byte, interpolate bool) int {
	for j < len(src) {
		switch {
		case src[j] == '\\':
			j += 2
		case interpolate && src[j] == '#' && j+1 < len(src) && src[j+1] == '{':
			if j = initSkipInterpolation(src, j+2); j < 0 {
				return -1
			}
		case src[j] == closer:
			return j + 1
		default:
			j++
		}
	}
	return -1
}

func initSkipInterpolation(src string, j int) int {
	depth := 1
	for j < len(src) {
		switch src[j] {
		case '{':
			depth++
			j++
		case '}':
			depth--
			j++
			if depth == 0 {
				return j
			}
		case '"', '\'':
			if j = initSkipQuoted(src, j, true); j < 0 {
				return -1
			}
		default:
			j++
		}
	}
	return -1
}

// initSkipHeredoc handles `"""` and `”'`: the text ends at a line that starts, after
// white space, with the closing triple quote.
func initSkipHeredoc(src string, i int, quote byte, interpolate bool) int {
	closer := strings.Repeat(string(quote), 3)
	j := i + 3
	for j < len(src) {
		switch {
		case src[j] == '\\':
			j += 2
		case interpolate && src[j] == '#' && j+1 < len(src) && src[j+1] == '{':
			if j = initSkipInterpolation(src, j+2); j < 0 {
				return -1
			}
		case src[j] == '\n':
			k := j + 1
			for k < len(src) && (src[k] == ' ' || src[k] == '\t') {
				k++
			}
			if strings.HasPrefix(src[k:], closer) {
				return k + 3
			}
			j++
		default:
			j++
		}
	}
	return -1
}

// initSkipSigil returns the index after the sigil at src[i] == '~', or -1 when it is not one.
func initSkipSigil(src string, i int) int {
	j := i + 1
	if j >= len(src) {
		return -1
	}
	lower := src[j] >= 'a' && src[j] <= 'z'
	switch {
	case lower:
		j++
	case src[j] >= 'A' && src[j] <= 'Z':
		for j < len(src) && src[j] >= 'A' && src[j] <= 'Z' {
			j++
		}
	default:
		return -1
	}
	if j >= len(src) {
		return -1
	}
	open := src[j]
	closer := map[byte]byte{'(': ')', '[': ']', '{': '}', '<': '>'}[open]
	switch open {
	case '/', '|', '"', '\'', '(', '[', '{', '<':
	default:
		return -1
	}
	if closer == 0 {
		closer = open
	}
	var end int
	if (open == '"' || open == '\'') && strings.HasPrefix(src[j:], strings.Repeat(string(open), 3)) {
		end = initSkipHeredoc(src, j, open, lower)
	} else {
		end = initSkipSigilBody(src, j+1, closer, lower)
	}
	if end < 0 {
		return -1
	}
	for end < len(src) && (src[end] >= 'a' && src[end] <= 'z' || src[end] >= 'A' && src[end] <= 'Z') {
		end++
	}
	return end
}

func initSkipSigilBody(src string, j int, closer byte, interpolate bool) int {
	for j < len(src) {
		switch {
		case src[j] == '\\' && (interpolate || j+1 < len(src) && src[j+1] == closer):
			j += 2
		case interpolate && src[j] == '#' && j+1 < len(src) && src[j+1] == '{':
			if j = initSkipInterpolation(src, j+2); j < 0 {
				return -1
			}
		case src[j] == closer:
			return j + 1
		default:
			j++
		}
	}
	return -1
}

// initLex splits Elixir source into tokens; false when a string or sigil does not end.
func initLex(src string) ([]initTok, bool) {
	var toks []initTok
	emit := func(kind initKind, text string) { toks = append(toks, initTok{kind, text}) }
	n := len(src)
	for i := 0; i < n; {
		c := src[i]
		switch {
		case c == ' ' || c == '\t' || c == '\r':
			i++
		case c == '\n':
			emit(initNL, "")
			i++
		case c == '#':
			for i < n && src[i] != '\n' {
				i++
			}
		case c == '"' || c == '\'':
			j := initSkipQuoted(src, i, true)
			if j < 0 {
				return nil, false
			}
			if c == '"' && j < n && src[j] == ':' && (j+1 >= n || src[j+1] != ':') && !strings.HasPrefix(src[i:], `"""`) {
				emit(initKwKey, strings.Trim(src[i:j], `"`))
				j++
			} else {
				emit(initStr, src[i:j])
			}
			i = j
		case c == '~':
			if j := initSkipSigil(src, i); j >= 0 {
				emit(initStr, src[i:j])
				i = j
			} else {
				emit(initOp, "~")
				i++
			}
		case c == ':':
			switch {
			case i+1 < n && src[i+1] == ':':
				emit(initOp, "::")
				i += 2
			case i+1 < n && src[i+1] == '"':
				j := initSkipQuoted(src, i+1, true)
				if j < 0 {
					return nil, false
				}
				emit(initAtom, strings.Trim(src[i+1:j], `"`))
				i = j
			case i+1 < n && initIsIdentStart(src[i+1]):
				j := i + 1
				for j < n && initIsIdentChar(src[j]) {
					j++
				}
				if j < n && (src[j] == '?' || src[j] == '!') {
					j++
				}
				emit(initAtom, src[i+1:j])
				i = j
			case i+1 < n && strings.IndexByte(initOpChars, src[i+1]) >= 0:
				j := i + 1
				for j < n && strings.IndexByte(initOpChars, src[j]) >= 0 {
					j++
				}
				emit(initAtom, src[i+1:j])
				i = j
			default:
				emit(initOp, ":")
				i++
			}
		case c >= '0' && c <= '9':
			j := i
			if c == '0' && i+1 < n && strings.IndexByte("xXbBoO", src[i+1]) >= 0 {
				j += 2
				for j < n && (initIsIdentChar(src[j])) {
					j++
				}
			} else {
				for j < n && (src[j] >= '0' && src[j] <= '9' || src[j] == '_') {
					j++
				}
				if j+1 < n && src[j] == '.' && src[j+1] >= '0' && src[j+1] <= '9' {
					j++
					for j < n && (src[j] >= '0' && src[j] <= '9' || src[j] == '_') {
						j++
					}
				}
				if j < n && (src[j] == 'e' || src[j] == 'E') {
					k := j + 1
					if k < n && (src[k] == '+' || src[k] == '-') {
						k++
					}
					if k < n && src[k] >= '0' && src[k] <= '9' {
						for k < n && src[k] >= '0' && src[k] <= '9' {
							k++
						}
						j = k
					}
				}
			}
			emit(initNum, src[i:j])
			i = j
		case c == '?' && i+1 < n && src[i+1] != ' ' && src[i+1] != '\n' && src[i+1] != '\t':
			_, size := utf8.DecodeRuneInString(src[i+1:])
			j := i + 1 + size
			if src[i+1] == '\\' && j < n {
				_, size = utf8.DecodeRuneInString(src[j:])
				j += size
			}
			emit(initNum, src[i:j])
			i = j
		case initIsIdentStart(c):
			j := i
			for j < n && initIsIdentChar(src[j]) {
				j++
			}
			if j < n && (src[j] == '?' || src[j] == '!') && !(j+1 < n && src[j+1] == '=') {
				j++
			}
			text := src[i:j]
			if j < n && src[j] == ':' && (j+1 >= n || src[j+1] != ':') {
				emit(initKwKey, text)
				j++
			} else {
				emit(initIdent, text)
			}
			i = j
		case strings.IndexByte("()[]{},;.", c) >= 0:
			emit(initPunct, string(c))
			i++
		case c == '<' && strings.HasPrefix(src[i:], "<<") && !strings.HasPrefix(src[i:], "<<<"):
			emit(initPunct, "<<")
			i += 2
		case c == '>' && strings.HasPrefix(src[i:], ">>") && !strings.HasPrefix(src[i:], ">>>"):
			emit(initPunct, ">>")
			i += 2
		case strings.IndexByte(initOpChars, c) >= 0:
			j := i
			for j < n && strings.IndexByte(initOpChars, src[j]) >= 0 {
				j++
			}
			emit(initOp, src[i:j])
			i = j
		default:
			i++
		}
	}
	return toks, true
}

var initLeadingOps = []string{"|>", "++", "--", "<>", "&&", "||", "==", "!=", "===", "!==", "=~", "<=", ">=", "<", ">", "|", "=", "->"}

// initContinues says whether a newline between prev and next does not end the expression.
func initContinues(prev, next initTok) bool {
	switch {
	case prev.kind == initOp || prev.kind == initKwKey || prev.is(initPunct, ",") || prev.is(initPunct, "."):
		return true
	case prev.kind == initIdent && (prev.text == "and" || prev.text == "or" || prev.text == "when" || prev.text == "in" || prev.text == "not"):
		return true
	case next.kind == initOp && slices.Contains(initLeadingOps, next.text):
		return true
	case next.kind == initIdent && (next.text == "and" || next.text == "or" || next.text == "when" || next.text == "in"):
		return true
	case next.is(initPunct, "."):
		return true
	}
	return false
}

// initSplit splits tokens into expressions at the separators of depth 0 (`;` and line ends
// that do not continue the expression); newlines inside brackets and blocks are dropped. It
// stops at an unmatched closer.
func initSplit(toks []initTok) [][]initTok {
	var out [][]initTok
	var cur []initTok
	depth := 0
	flush := func() {
		if len(cur) > 0 {
			out = append(out, cur)
			cur = nil
		}
	}
	for i := 0; i < len(toks); i++ {
		t := toks[i]
		switch {
		case t.kind == initNL:
			if depth > 0 || len(cur) == 0 {
				continue
			}
			j := i + 1
			for j < len(toks) && toks[j].kind == initNL {
				j++
			}
			if j < len(toks) && !initContinues(cur[len(cur)-1], toks[j]) {
				flush()
			}
		case t.is(initPunct, ";") && depth == 0:
			flush()
		default:
			if t.closes() {
				if depth == 0 {
					flush()
					return out
				}
				depth--
			} else if t.opens() {
				depth++
			}
			cur = append(cur, t)
		}
	}
	flush()
	return out
}

// initMatching is the index of the closer matching the opener at toks[i], or -1.
func initMatching(toks []initTok, i int) int {
	depth := 0
	for j := i; j < len(toks); j++ {
		if toks[j].opens() {
			depth++
		} else if toks[j].closes() {
			depth--
			if depth == 0 {
				return j
			}
		}
	}
	return -1
}

// initDefinitions maps each zero-argument function of the source to its body's last
// expression; a later definition replaces an earlier one of the same name.
func initDefinitions(toks []initTok) map[string][]initTok {
	defs := map[string][]initTok{}
	skipNL := func(j int) int {
		for j < len(toks) && toks[j].kind == initNL {
			j++
		}
		return j
	}
	for i := 0; i < len(toks); i++ {
		if t := toks[i]; t.kind != initIdent || (t.text != "def" && t.text != "defp") || i > 0 && toks[i-1].is(initPunct, ".") {
			continue
		}
		j := i + 1
		if j >= len(toks) || toks[j].kind != initIdent {
			continue
		}
		name := toks[j].text
		j++
		if j+1 < len(toks) && toks[j].is(initPunct, "(") && toks[j+1].is(initPunct, ")") {
			j += 2
		}
		j = skipNL(j)
		switch {
		case j < len(toks) && toks[j].is(initIdent, "do"):
			end := initMatching(toks, j)
			if end < 0 {
				continue
			}
			body := toks[j+1 : end]
			if initHasClause(body) {
				continue
			}
			if exprs := initSplit(body); len(exprs) > 0 {
				defs[name] = exprs[len(exprs)-1]
			} else {
				defs[name] = nil
			}
		case j+1 < len(toks) && toks[j].is(initPunct, ",") && toks[skipNL(j+1)].is(initKwKey, "do"):
			start := skipNL(j+1) + 1
			if exprs := initSplit(toks[start:]); len(exprs) > 0 {
				defs[name] = exprs[0]
			} else {
				defs[name] = nil
			}
		}
	}
	return defs
}

// initHasClause reports a depth-0 rescue, catch, else or after in a do block body, which
// makes the function more than `[do: body]`.
func initHasClause(body []initTok) bool {
	depth := 0
	for _, t := range body {
		switch {
		case t.opens():
			depth++
		case t.closes():
			depth--
		case depth == 0 && t.kind == initIdent && (t.text == "rescue" || t.text == "catch" || t.text == "else" || t.text == "after"):
			return true
		}
	}
	return false
}

type initPair struct {
	key   string
	value []initTok
}

// initKeywordBody is the pairs of an expression that is a literal keyword list (parentheses
// around it allowed); false for anything else.
func initKeywordBody(expr []initTok) ([]initPair, bool) {
	for len(expr) >= 2 && expr[0].is(initPunct, "(") && initMatching(expr, 0) == len(expr)-1 {
		expr = expr[1 : len(expr)-1]
	}
	if len(expr) < 2 || !expr[0].is(initPunct, "[") || initMatching(expr, 0) != len(expr)-1 {
		return nil, false
	}
	var pairs []initPair
	for _, elem := range initSplitCommas(expr[1 : len(expr)-1]) {
		switch {
		case elem[0].kind == initKwKey:
			pairs = append(pairs, initPair{elem[0].text, elem[1:]})
		case len(elem) >= 4 && elem[0].is(initPunct, "{") && initMatching(elem, 0) == len(elem)-1 &&
			elem[1].kind == initAtom && elem[2].is(initPunct, ","):
			pairs = append(pairs, initPair{elem[1].text, elem[3 : len(elem)-1]})
		default:
			return nil, false
		}
	}
	return pairs, true
}

// initSplitCommas splits at the commas of depth 0 and drops empty parts.
func initSplitCommas(toks []initTok) [][]initTok {
	var out [][]initTok
	var cur []initTok
	depth := 0
	for _, t := range toks {
		switch {
		case t.kind == initNL:
		case t.is(initPunct, ",") && depth == 0:
			if len(cur) > 0 {
				out = append(out, cur)
			}
			cur = nil
		default:
			if t.opens() {
				depth++
			} else if t.closes() {
				depth--
			}
			cur = append(cur, t)
		}
	}
	if len(cur) > 0 {
		out = append(out, cur)
	}
	return out
}

func initPairValue(pairs []initPair, key string) ([]initTok, bool) {
	for _, p := range pairs {
		if p.key == key {
			return p.value, true
		}
	}
	return nil, false
}

// initMixVerification reports whether the Mix source defines verification: project settings
// for compiler options, xref, dialyzer, credo or test discovery and coverage, or an alias
// that one of the checks invokes.
func initMixVerification(text string, checks []project.Check) bool {
	toks, ok := initLex(text)
	if !ok {
		return false
	}
	defs := initDefinitions(toks)
	proj, _ := initKeywordBody(defs["project"])

	var aliases []initPair
	if value, ok := initPairValue(proj, "aliases"); ok {
		name := ""
		switch {
		case len(value) == 1 && value[0].kind == initIdent:
			name = value[0].text
		case len(value) == 3 && value[0].kind == initIdent && value[1].is(initPunct, "(") && value[2].is(initPunct, ")"):
			name = value[0].text
		}
		if _, defined := defs[name]; name != "" && defined && !slices.Contains([]string{"true", "false", "nil"}, name) {
			aliases, _ = initKeywordBody(defs[name])
		} else {
			aliases, _ = initKeywordBody(value)
		}
	}
	for _, key := range []string{"elixirc_options", "xref", "dialyzer", "credo", "test_paths", "test_pattern", "test_load_filters", "test_ignore_filters", "test_coverage"} {
		if _, ok := initPairValue(proj, key); ok {
			return true
		}
	}
	for _, c := range checks {
		if m := initMixTaskRE.FindStringSubmatch(c.Run); m != nil {
			if _, ok := initPairValue(aliases, m[1]); ok {
				return true
			}
		}
	}
	return false
}
