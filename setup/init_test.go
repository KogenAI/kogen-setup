package setup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-verification/verify"
)

// ---- Validate and Merge (ExUnit rows `shape:` of docs/evidence/go-core-migration/ledger.md) ----

func initArgs(m map[string]any) map[string]any { return m }

func initCheckList(pairs ...string) []any {
	var out []any
	for i := 0; i+1 < len(pairs); i += 2 {
		out = append(out, map[string]any{"name": pairs[i], "run": pairs[i+1]})
	}
	return out
}

func TestInitValidateRefusesOneTimeMachineBootstrap(t *testing.T) {
	parallel(t)
	_, problems := Validate(initArgs(map[string]any{"setup": []any{"mix local.hex --force"}}), InitContext{})
	if len(problems) != 1 || !strings.Contains(problems[0], "one-time machine prerequisite") {
		t.Fatalf("problems = %q", problems)
	}
	for _, command := range []string{"mix local.rebar --force", "cd x && mix local.hex", "a; mix  local.rebar", "a&mix local.hex"} {
		if _, p := Validate(map[string]any{"setup": []any{command}}, InitContext{}); len(p) != 1 {
			t.Errorf("%q: problems %q", command, p)
		}
	}
	for _, command := range []string{"mix deps.get", "echo mix local.hex > out.txt", "mix local.hexagon"} {
		if _, p := Validate(map[string]any{"setup": []any{command}}, InitContext{}); len(p) != 0 {
			t.Errorf("%q: problems %q", command, p)
		}
	}
}

func TestInitMergeDeduplicatesExactCommands(t *testing.T) {
	parallel(t)
	detected := project.Detected{Checks: []project.Check{{Name: "test", Run: "mix test"}}}
	proposed := InitProposal{Checks: []project.Check{
		{Name: "duplicate", Run: "mix test"},
		{Name: "unit", Run: "mix test test/kogen"},
		{Name: "integration", Run: "mix test test/integration"},
		{Name: "tagged", Run: "mix test test/integration --include external"},
	}}
	want := []project.Check{
		{Name: "test", Run: "mix test"},
		{Name: "unit", Run: "mix test test/kogen"},
		{Name: "integration", Run: "mix test test/integration"},
		{Name: "tagged", Run: "mix test test/integration --include external"},
	}
	if got := Merge(detected, proposed).Checks; !reflect.DeepEqual(got, want) {
		t.Fatalf("checks = %v", got)
	}
}

func TestInitMergeProposedCheckReplacesDetectedOthersFollow(t *testing.T) {
	parallel(t)
	detected := project.Detected{
		Setup:   []string{"mix deps.get"},
		Checks:  []project.Check{{Name: "test", Run: "mix test"}, {Name: "compile", Run: "mix compile"}},
		Protect: []string{".formatter.exs"},
	}
	proposed := InitProposal{
		Setup: []string{"mix deps.get", "mix ecto.create"},
		Fix:   []string{"mix format"},
		Checks: []project.Check{
			{Name: "sobelow", Run: "mix sobelow"},
			{Name: "test", Run: "mix test --warnings-as-errors"},
		},
		Protect: []string{".credo.exs", ".formatter.exs"},
	}
	want := InitProposal{
		Setup: []string{"mix deps.get", "mix ecto.create"},
		Fix:   []string{"mix format"},
		Checks: []project.Check{
			{Name: "test", Run: "mix test --warnings-as-errors"},
			{Name: "compile", Run: "mix compile"},
			{Name: "sobelow", Run: "mix sobelow"},
		},
		Protect: []string{".formatter.exs", ".credo.exs"},
	}
	if got := Merge(detected, proposed); !reflect.DeepEqual(got, want) {
		t.Fatalf("merge = %+v", got)
	}
}

func TestInitValidateDependencyOnlyManifestsAreNotEligible(t *testing.T) {
	parallel(t)
	cases := []struct {
		path, content string
		checks        []any
		eligible      bool
	}{
		{"mix.exs", "defmodule App.MixProject do\n  def project, do: [app: :app, deps: deps()]\n  defp deps, do: [{:ecto, \"~> 3.0\"}]\nend\n", nil, false},
		{"cli/go.mod", "module example.invalid/cli\n\ngo 1.27\n\nrequire example.invalid/lib v1.0.0\n", nil, false},
		{"cli/go.sum", "example.invalid/lib v1.0.0 h1:abc\n", nil, false},
		{"mix.lock", "%{\"ecto\" => {:hex, :ecto, \"3.0\", \"checksum\"}}\n", nil, false},
		{"package-lock.json", "{\"lockfileVersion\": 3, \"packages\": {}}\n", nil, false},
		{"package.json", `{"scripts":{"lint":"eslint ."}}`, initCheckList("lint", "npm run lint"), true},
		{"package.json", `{"eslintConfig":{"rules":{"eqeqeq":"error"}}}`, initCheckList("lint", "npx eslint ."), true},
		{"mix.exs", "def project, do: [aliases: [check: [\"format --check-formatted\", \"test\"]]]\n", initCheckList("check", "mix check"), true},
		{"mix.exs", "def project, do: [aliases: aliases()]\ndefp aliases, do: [check: [\"test\"]]\n", initCheckList("check", "mix check"), true},
		{"mix.exs", "def project, do: [elixirc_options: [warnings_as_errors: true]]\n", initCheckList("compile", "mix compile"), true},
		{"mix.exs", "# aliases: [check: [\"test\"]]\ndef project, do: [deps: []]\n", initCheckList("check", "mix check"), false},
		{".formatter.exs", "[inputs: [\"{lib,test}/**/*.{ex,exs}\"]]\n", nil, true},
	}
	for _, c := range cases {
		args := map[string]any{"setup": []any{}, "fix": []any{}, "checks": c.checks, "protect": []any{c.path}}
		if c.checks == nil {
			args["checks"] = []any{}
		}
		got, problems := Validate(args, InitContext{Tracked: []string{c.path}, Contents: map[string]string{c.path: c.content}})
		if c.eligible {
			if len(problems) != 0 || !reflect.DeepEqual(got.Protect, []string{c.path}) {
				t.Errorf("%s: got %+v %q", c.path, got, problems)
			}
			continue
		}
		if len(problems) != 1 || !strings.HasPrefix(problems[0], "protect path "+c.path+" is not eligible:") {
			t.Errorf("%s: problems %q", c.path, problems)
		}
	}
}

func TestInitValidateProtectionIncludesDetectedChecks(t *testing.T) {
	parallel(t)
	args := map[string]any{"checks": []any{}, "protect": []any{"package.json"}}
	ctx := InitContext{
		Tracked:        []string{"package.json"},
		Contents:       map[string]string{"package.json": `{"scripts":{"test":"node --test"}}`},
		DetectedChecks: []project.Check{{Name: "test", Run: "npm run test"}},
	}
	got, problems := Validate(args, ctx)
	if len(problems) != 0 || !reflect.DeepEqual(got.Protect, []string{"package.json"}) {
		t.Fatalf("got %+v %q", got, problems)
	}
	// The model's own check of the same name replaces the detected one.
	args["checks"] = initCheckList("test", "test -f README.md")
	if _, problems := Validate(args, ctx); len(problems) != 1 {
		t.Fatalf("problems %q", problems)
	}
	// npm's placeholder script is not a definition.
	ctx.Contents["package.json"] = `{"scripts":{"test":"echo \"Error: no test specified\" && exit 1"}}`
	args["checks"] = []any{}
	if _, problems := Validate(args, ctx); len(problems) != 1 {
		t.Fatalf("placeholder: problems %q", problems)
	}
	// Without the manifest's text there is nothing to validate against.
	_, problems = Validate(args, InitContext{Tracked: []string{"package.json"}})
	if len(problems) != 1 || !strings.Contains(problems[0], "dependency manifest content is unavailable") {
		t.Fatalf("no content: problems %q", problems)
	}
}

func TestInitValidateMixTestDiscoveryAndCoverageAreVerificationConfiguration(t *testing.T) {
	parallel(t)
	for _, key := range []string{"test_paths", "test_pattern", "test_load_filters", "test_ignore_filters", "test_coverage"} {
		ctx := InitContext{Tracked: []string{"mix.exs"}, Contents: map[string]string{"mix.exs": "def project, do: [" + key + ": []]"}}
		got, problems := Validate(map[string]any{"protect": []any{"mix.exs"}}, ctx)
		if len(problems) != 0 || !reflect.DeepEqual(got.Protect, []string{"mix.exs"}) {
			t.Errorf("%s: %+v %q", key, got, problems)
		}
	}
}

func TestInitValidateCommittedMixTestSelectionIsProtectedConfiguration(t *testing.T) {
	parallel(t)
	// The mix.exs of this repository's Elixir Kogen, which sets test_load_filters and
	// test_ignore_filters inside a multi-line project list full of captures.
	manifest, err := os.ReadFile("testdata/init/kogen-mix.exs")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(manifest), "test_load_filters:") || !strings.Contains(string(manifest), "test_ignore_filters:") {
		t.Fatal("fixture lost its test selection settings")
	}
	ctx := InitContext{
		Tracked: []string{"mix.exs"}, Contents: map[string]string{"mix.exs": string(manifest)},
		DetectedChecks: []project.Check{{Name: "test", Run: "mix test"}},
	}
	got, problems := Validate(map[string]any{"checks": []any{}, "protect": []any{"mix.exs"}}, ctx)
	if len(problems) != 0 || !reflect.DeepEqual(got.Protect, []string{"mix.exs"}) {
		t.Fatalf("%+v %q", got, problems)
	}
}

func TestInitValidateNamesDuplicatesReservedAndUntrackedAreProblems(t *testing.T) {
	parallel(t)
	args := map[string]any{
		"setup": []any{""},
		"checks": []any{
			map[string]any{"name": "Docs Check", "run": "x"},
			map[string]any{"name": "acceptance", "run": "x"},
			map[string]any{"name": "a", "run": "x"},
			map[string]any{"name": "a", "run": "y"},
		},
		"protect": []any{"missing.cfg"},
	}
	_, problems := Validate(args, InitContext{Tracked: []string{"README.md"}})
	want := []string{
		"setup must be a list of non-empty commands",
		"protect path missing.cfg is not a tracked file",
		"check name Docs Check must be lowercase letters, digits and dashes",
		"check name acceptance is reserved",
		"check name a is used twice",
	}
	if !reflect.DeepEqual(problems, want) {
		t.Fatalf("problems = %q", problems)
	}
	got, problems := Validate(map[string]any{"checks": initCheckList("docs", "node docs-check.js")}, InitContext{})
	if len(problems) != 0 || !reflect.DeepEqual(got.Checks, []project.Check{{Name: "docs", Run: "node docs-check.js"}}) {
		t.Fatalf("got %+v %q", got, problems)
	}
}

func TestInitValidateShapes(t *testing.T) {
	parallel(t)
	cases := []struct {
		name string
		args map[string]any
		want []string
	}{
		{"setup not a list", map[string]any{"setup": "mix deps.get"}, []string{"setup must be a list"}},
		{"null fix", map[string]any{"fix": nil}, []string{"fix must be a list"}},
		{"blank command", map[string]any{"protect": []any{"  "}}, []string{"protect must be a list of non-empty commands"}},
		{"number command", map[string]any{"fix": []any{1}}, []string{"fix must be a list of non-empty commands"}},
		{"checks not a list", map[string]any{"checks": "x"}, []string{"checks must be a list"}},
		{"check without run", map[string]any{"checks": []any{map[string]any{"name": "a"}, "text"}},
			[]string{"each check needs a name and a run command", "each check needs a name and a run command"}},
		{"model is reserved", map[string]any{"checks": initCheckList("model", "x")}, []string{"check name model is reserved"}},
		{"empty command", map[string]any{"checks": initCheckList("a", "  ")}, []string{"check a has no command"}},
		{"dash edges", map[string]any{"checks": initCheckList("-a", "x", "a-", "x", "a--b", "x", "a-b", "x")},
			[]string{"check name -a must be lowercase letters, digits and dashes", "check name a- must be lowercase letters, digits and dashes", "check name a--b must be lowercase letters, digits and dashes"}},
		{"trailing newline name", map[string]any{"checks": initCheckList("lint\n", "make lint")},
			[]string{`check name "lint\n" must be lowercase letters, digits and dashes`}},
		{"tab name", map[string]any{"checks": initCheckList("lint\t", "make lint")},
			[]string{`check name "lint\t" must be lowercase letters, digits and dashes`}},
		{"trailing space name", map[string]any{"checks": initCheckList("lint ", "make lint")},
			[]string{"check name lint  must be lowercase letters, digits and dashes"}},
		{"newline variant of a proposed name", map[string]any{"checks": initCheckList("lint", "make lint", "lint\n", "make lint")},
			[]string{`check name "lint\n" must be lowercase letters, digits and dashes`}},
		{"invalid arguments", map[string]any{"__invalid__": true}, nil},
	}
	for _, c := range cases {
		if _, got := Validate(c.args, InitContext{}); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: problems %q, want %q", c.name, got, c.want)
		}
	}
}

func TestInitMixVerificationMatchesElixir(t *testing.T) {
	parallel(t)
	data, err := os.ReadFile("testdata/init/mix-golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Text     string
		Checks   []project.Check
		Eligible bool
	}
	// Synthetic text and checks came from the Elixir compatibility fixture; eligibility
	// records its original results or, after an explicit update, current Go validation.
	// Keep the golden field names lowercase.
	var raw []struct {
		Checks []struct {
			Name string `json:"name"`
			Run  string `json:"run"`
		} `json:"checks"`
		Eligible bool   `json:"eligible"`
		Text     string `json:"text"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	for _, r := range raw {
		var checks []project.Check
		for _, c := range r.Checks {
			checks = append(checks, project.Check{Name: c.Name, Run: c.Run})
		}
		cases = append(cases, struct {
			Text     string
			Checks   []project.Check
			Eligible bool
		}{r.Text, checks, r.Eligible})
	}
	if len(cases) < 250 {
		t.Fatalf("only %d cases", len(cases))
	}
	for i, c := range cases {
		got := initMixVerification(c.Text, c.Checks)
		if *updateGoldens {
			raw[i].Eligible = got
		} else if got != c.Eligible {
			t.Errorf("case %d: got %v, golden says %v\nchecks %v\n%s", i, got, c.Eligible, c.Checks, c.Text)
		}
	}
	if *updateGoldens && !t.Failed() {
		writeGolden(t, "testdata/init/mix-golden.json", raw, "")
	}
}

func TestInitDetectedJSONKeyOrderAndEscapes(t *testing.T) {
	parallel(t)
	d := project.Detected{Setup: []string{"a \"q\"\n"}, Checks: []project.Check{{Name: "t", Run: "x\ty"}}}
	want := `{"setup":["a \"q\"\n"],"protect":[],"fix":[],"checks":[{"name":"t","run":"x\ty"}]}`
	if got := initDetectedJSON(d); got != want {
		t.Fatalf("got %s", got)
	}
}

// ---- the command ----

// initSSE is one scripted provider answer.
type initSSE func(w http.ResponseWriter)

// initInput is the conversation of a recorded request, the developer message first.
func initInput(body map[string]any) []map[string]any {
	var out []map[string]any
	// The request carries its policy as the frozen `instructions`; the tests read it as the
	// leading developer message of the conversation.
	if policy, ok := body["instructions"].(string); ok {
		out = append(out, map[string]any{"role": "developer", "content": policy})
	}
	for _, it := range body["input"].([]any) {
		out = append(out, it.(map[string]any))
	}
	return out
}

// initText is the text of an item: a string content or the joined text blocks.
func initText(item map[string]any) string {
	switch c := item["content"].(type) {
	case string:
		return c
	case []any:
		var parts []string
		for _, b := range c {
			parts = append(parts, b.(map[string]any)["text"].(string))
		}
		return strings.Join(parts, "")
	}
	return ""
}

func initFrame(v any) string {
	b, _ := json.Marshal(v)
	return "data: " + string(b) + "\n\n"
}

func initUsage() map[string]any {
	return map[string]any{"usage": map[string]any{
		"input_tokens": 100, "input_tokens_details": map[string]any{"cached_tokens": 0},
		"output_tokens": 20, "output_tokens_details": map[string]any{"reasoning_tokens": 5}}}
}

// initSubmit answers with one submit_configuration call.
func initSubmit(args map[string]any) initSSE {
	b, _ := json.Marshal(args)
	call := map[string]any{"type": "function_call", "id": "fc_1", "call_id": "call_1", "name": "submit_configuration", "arguments": string(b), "status": "completed"}
	return func(w http.ResponseWriter) {
		io.WriteString(w, initFrame(map[string]any{"type": "response.output_item.done", "output_index": 0, "item": call}))
		io.WriteString(w, initFrame(map[string]any{"type": "response.completed", "response": initUsage()}))
	}
}

// initNothing is the reply `init-proposes-nothing`.
func initNothing() initSSE {
	return initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{}, "protect": []any{}})
}

func initAnswerText(text string) initSSE {
	msg := map[string]any{"type": "message", "id": "msg_1", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": text, "annotations": []any{}}}}
	return func(w http.ResponseWriter) {
		io.WriteString(w, initFrame(map[string]any{"type": "response.output_item.done", "output_index": 0, "item": msg}))
		io.WriteString(w, initFrame(map[string]any{"type": "response.completed", "response": initUsage()}))
	}
}

type initFx struct {
	t        *testing.T
	home     string
	bin      string
	repo     string
	srv      *httptest.Server
	mu       sync.Mutex
	script   []initSSE
	bodies   []map[string]any
	env      []string
	tools    verify.Tools
	out, err *strings.Builder
}

func initTestRun(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %v\n%s", args, err, out)
	}
	return string(out)
}

// initNewFx makes a temp HOME with a saved ChatGPT login (when signedIn), fake mix, npm and
// node programs, a scripted provider and an empty repository.
func initNewFx(t *testing.T, signedIn bool, script ...initSSE) *initFx {
	t.Helper()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	f := &initFx{t: t, home: filepath.Join(base, "home"), bin: filepath.Join(base, "bin"), repo: filepath.Join(base, "repo"), script: script,
		out: &strings.Builder{}, err: &strings.Builder{}}
	for _, d := range []string{f.home, f.bin, f.repo, filepath.Join(base, "cucumber")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	f.program("mix", `case "$*" in
  "deps.get") exit 0;;
  "format --check-formatted") exit 0;;
  "format") exit 0;;
  "compile --warnings-as-errors") echo "warning: unused variable" >&2; exit 1;;
  "test") exit 0;;
esac
exit 3`)
	f.program("npm", `case "$*" in
  "ci --no-audit --no-fund") exit 0;;
  "run test") exit 0;;
  "run lint") exit 2;;
esac
exit 3`)
	f.program("node", `[ -n "$FAKE_NODE_STATUS" ] && exit "$FAKE_NODE_STATUS"
[ -n "$KOGEN_ACCEPTANCE_REPORT" ] && echo '{}' > "$KOGEN_ACCEPTANCE_REPORT"
exit 0`)
	f.srv = httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(f.srv.Close)
	f.env = []string{"HOME=" + f.home, "PATH=" + f.bin + ":" + os.Getenv("PATH"), "KOGEN_PROVIDER_URL=" + f.srv.URL,
		"GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1"}
	f.tools = verify.Tools{Node: filepath.Join(f.bin, "node"), Cucumber: filepath.Join(base, "cucumber")}
	if signedIn {
		dir := filepath.Join(f.home, ".kogen", "credentials")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		creds := fmt.Sprintf(`{"client_id":"oaiapp_fixture","access_token":"fake-access","refresh_token":"fake-refresh","expires_at":%d}`, time.Now().Unix()+3600)
		if err := os.WriteFile(filepath.Join(dir, "chatgpt.json"), []byte(creds), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	initTestRun(t, f.repo, "git", "init", "-q")
	hooks := filepath.Join(base, "hooks")
	os.MkdirAll(hooks, 0o755)
	f.git("config", "core.hooksPath", hooks)
	f.git("config", "user.name", "Test User")
	f.git("config", "user.email", "test@example.invalid")
	f.git("config", "commit.gpgsign", "false")
	return f
}

func (f *initFx) program(name, body string) {
	f.t.Helper()
	if err := os.WriteFile(filepath.Join(f.bin, name), []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		f.t.Fatal(err)
	}
}

func (f *initFx) serve(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var doc map[string]any
	json.Unmarshal(body, &doc)
	f.mu.Lock()
	f.bodies = append(f.bodies, doc)
	n := len(f.bodies)
	var reply initSSE
	if n <= len(f.script) {
		reply = f.script[n-1]
	}
	f.mu.Unlock()
	if reply == nil {
		w.WriteHeader(400)
		io.WriteString(w, `{"error":{"message":"no scripted reply","code":"invalid_request_error"}}`)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	reply(w)
}

func (f *initFx) git(args ...string) string {
	f.t.Helper()
	return initTestRun(f.t, f.repo, append([]string{"git"}, args...)...)
}

func (f *initFx) write(path, content string) {
	f.t.Helper()
	full := filepath.Join(f.repo, path)
	os.MkdirAll(filepath.Dir(full), 0o755)
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		f.t.Fatal(err)
	}
}

func (f *initFx) read(path string) string {
	b, err := os.ReadFile(filepath.Join(f.repo, path))
	if err != nil {
		f.t.Fatal(err)
	}
	return string(b)
}

func (f *initFx) exists(path string) bool {
	_, err := os.Lstat(filepath.Join(f.repo, path))
	return err == nil
}

// commitAll commits every file written so far.
func (f *initFx) commitAll(message string) {
	f.git("add", "-A")
	f.git("commit", "-qm", message)
}

func (f *initFx) head() string { return strings.TrimSpace(f.git("rev-parse", "HEAD")) }

func (f *initFx) requests() []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]map[string]any(nil), f.bodies...)
}

// run runs Init in dir (the repository root when "") and returns what it printed.
func (f *initFx) run(dir string) (exit int, stdout, stderr string, err error) {
	f.t.Helper()
	if dir == "" {
		dir = f.repo
	}
	f.out.Reset()
	f.err.Reset()
	s := sys.NewWith(f.env, dir)
	s.Stdout, s.Stderr = f.out, f.err
	exit, err = Init(context.Background(), s, InitInput{Client: provider.NewClient("dev+12345678"), Tools: f.tools, Home: f.home})
	return exit, f.out.String(), f.err.String(), err
}

func (f *initFx) mustRun() (stdout, stderr string) {
	f.t.Helper()
	exit, out, errs, err := f.run("")
	if err != nil || exit != 0 {
		f.t.Fatalf("exit %d, err %v\nstdout %s\nstderr %s", exit, err, out, errs)
	}
	return out, errs
}

func (f *initFx) wantError(class, reason string, exit int) *sys.Error {
	f.t.Helper()
	got, out, errs, err := f.run("")
	e, ok := sys.AsError(err)
	if !ok || e.Class != class || e.Reason != reason || e.Exit != exit || got != exit {
		f.t.Fatalf("got exit %d, err %v; want %s/%s (%d)\nstdout %s\nstderr %s", got, err, class, reason, exit, out, errs)
	}
	return e
}

// shaPattern replaces the commit id of a `Commit:` line so the output can be compared.
func initScrub(out string) string {
	lines := strings.Split(out, "\n")
	for i, l := range lines {
		if rest, ok := strings.CutPrefix(l, "Commit: "); ok && len(rest) > 8 {
			lines[i] = "Commit: {sha8}" + rest[8:]
		}
	}
	return strings.Join(lines, "\n")
}

func initWantLines(t *testing.T, got string, want ...string) {
	t.Helper()
	if g, w := initScrub(got), strings.Join(want, "\n")+"\n"; g != w {
		t.Fatalf("stdout:\n%s\nwant:\n%s", g, w)
	}
}

func (f *initFx) commitFiles() []string {
	files := strings.Fields(f.git("show", "--name-only", "--format=", "HEAD"))
	slices.Sort(files)
	return files
}

func (f *initFx) subject() string { return strings.TrimSpace(f.git("log", "-1", "--format=%s")) }

func (f *initFx) dirtyPaths() string { return f.git("status", "--porcelain") }

func (f *initFx) config() *project.Config {
	f.t.Helper()
	cfg, err := project.LoadConfig(f.repo)
	if err != nil {
		f.t.Fatal(err)
	}
	return cfg
}

func TestInitEmptyRepositoryMakesTheFirstCommit(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	out, errs := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Commit: {sha8} Initial commit (the first commit of this repository)",
		initNextAcceptance, initNextChecks)
	if errs != "" || len(f.requests()) != 0 {
		t.Fatalf("stderr %q, %d requests", errs, len(f.requests()))
	}
	if f.subject() != "Initial commit" || !reflect.DeepEqual(f.commitFiles(), []string{".gitignore", ".kogen/models.yaml", ".kogen/project.yaml"}) {
		t.Fatalf("commit %q %v", f.subject(), f.commitFiles())
	}
	if f.read(".kogen/project.yaml") != strings.TrimSuffix(project.Template(), project.ModelsTemplate()) || f.read(project.ModelsPath) != project.ModelsTemplate() || f.read(".gitignore") != ".kogen/local/\n" {
		t.Fatalf("files: %q %q", f.read(".kogen/project.yaml"), f.read(".gitignore"))
	}
	if st := f.dirtyPaths(); st != "" {
		t.Fatalf("status %q", st)
	}
	// The commit hash printed is the new HEAD.
	if !strings.Contains(out, f.head()[:8]) {
		t.Fatalf("%s does not name %s", out, f.head()[:8])
	}
}

func TestInitEmptyRepositoryKeepsAnExistingGitignore(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	f.write(".gitignore", "node_modules")
	f.mustRun()
	if got := f.read(".gitignore"); got != "node_modules\n.kogen/local/\n" {
		t.Fatalf(".gitignore = %q", got)
	}
}

func TestInitRefusesFilesNotCommittedYet(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	f.write("app.txt", "x")
	e := f.wantError("environment", "no_commits", 3)
	if e.Detail != `1 file(s) are not committed yet; commit them first (git add -A && git commit -m "Initial commit"), then run kogen init` {
		t.Fatal(e.Detail)
	}
	if f.exists(".kogen") {
		t.Fatal("wrote .kogen")
	}
	// .gitignore alone is not an uncommitted file.
	os.Remove(filepath.Join(f.repo, "app.txt"))
	f.write(".gitignore", "x\n")
	f.mustRun()
}

func TestInitNotAGitRepository(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	plain := filepath.Join(filepath.Dir(f.repo), "plain")
	os.MkdirAll(plain, 0o755)
	exit, out, _, err := f.run(plain)
	e, ok := sys.AsError(err)
	if !ok || e.Reason != "not_a_git_repo" || exit != 3 || out != "" || !strings.HasSuffix(e.Detail, "; run git init first") {
		t.Fatalf("exit %d, %v, out %q", exit, err, out)
	}
	if _, err := os.Stat(filepath.Join(plain, ".kogen")); err == nil {
		t.Fatal("wrote .kogen")
	}
}

func TestInitWithoutGitIdentityWritesNothing(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.git("config", "--unset", "user.name")
	e := f.wantError("environment", "git_identity_missing", 3)
	if e.Detail != "no Git user.name and user.email; run git config user.name \"<name>\" and git config user.email \"<email>\" (global or repository)" || f.exists(".kogen") || len(f.requests()) != 0 {
		t.Fatalf("%v", e)
	}
}

func TestInitWithoutLoginWritesNothing(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	f.write("notes.txt", "x")
	f.commitAll("first")
	e := f.wantError("provider", "login", 4)
	if e.Detail != "not signed in; run kogen provider login for a supported provider" || f.exists(".kogen") || len(f.requests()) != 0 {
		t.Fatalf("%v", e)
	}
	if st := f.dirtyPaths(); st != "" {
		t.Fatalf("status %q", st)
	}
}

func TestInitConfiguresAProjectWithoutChecksAndAddsTheBridge(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("README.md", "# notes\n")
	f.write("notes.txt", "one\n")
	f.write("docs/guide.md", "guide\n")
	f.write("CLAUDE.md", "be nice\n")
	f.write(".cursor/rules/a.mdc", "rule\n")
	f.commitAll("notes")
	f.write("notes.txt", "changed outside Kogen\n")
	f.write("untracked.txt", "u\n")

	exit, out, errs, err := f.run(filepath.Join(f.repo, "docs"))
	if err != nil || exit != 0 {
		t.Fatalf("exit %d: %v\n%s\n%s", exit, err, out, errs)
	}
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: none",
		"Fix: none",
		"Checks: none found",
		"Protect: none",
		"Acceptance: Cucumber bridge added in features/steps",
		"Note: Kogen gives its models README.md only; it does not read CLAUDE.md, .cursor/rules",
		"Commit: {sha8} Add Kogen configuration",
		initNextChecks)
	for _, line := range []string{
		"kogen: detecting the project's commands",
		"kogen: asking gpt-6.1-sol/high about the project's commands",
		"kogen: checking the acceptance runner",
	} {
		if !strings.Contains(errs, line+"\n") {
			t.Errorf("stderr lacks %q:\n%s", line, errs)
		}
	}
	if !strings.Contains(errs, "kogen: init gpt-6.1-sol/high input=100 cached=0 output=20 reasoning=5 wall_ms=") {
		t.Errorf("stderr lacks the usage line:\n%s", errs)
	}
	if got := f.commitFiles(); !reflect.DeepEqual(got, []string{".gitignore", ".kogen/models.yaml", ".kogen/project.yaml", "features/steps/README.md"}) {
		t.Fatalf("commit files %v", got)
	}
	if f.subject() != "Add Kogen configuration" {
		t.Fatal(f.subject())
	}
	cfg := f.config()
	if cfg.Acceptance == nil || cfg.Acceptance.StepsDir != "features/steps" || !strings.Contains(cfg.Acceptance.Run, "$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js") {
		t.Fatalf("acceptance %+v", cfg.Acceptance)
	}
	if f.read("features/steps/README.md") != "Cucumber step definitions for Kogen acceptance scenarios.\n" || !strings.Contains(f.read(".gitignore"), ".kogen/local/") {
		t.Fatal("bridge files")
	}
	if st := f.dirtyPaths(); st != " M notes.txt\n?? untracked.txt\n" {
		t.Fatalf("working tree: %q", st)
	}
	req := f.requests()
	if len(req) != 1 || req[0]["model"] != "gpt-6.1-sol" || req[0]["reasoning"].(map[string]any)["effort"] != "high" {
		t.Fatalf("requests %v", req)
	}
	body, _ := json.Marshal(req[0])
	if !strings.Contains(string(body), `README.md`) || !strings.Contains(string(body), "# notes") || strings.Contains(string(body), "be nice") {
		t.Fatalf("request body: %s", body)
	}
	tools := req[0]["tools"].([]any)
	if len(tools) != 1 || tools[0].(map[string]any)["name"] != "submit_configuration" {
		t.Fatalf("tools %v", tools)
	}
	// The shaping prompt leads the conversation as the developer message.
	if text := initText(initInput(req[0])[0]); !strings.HasPrefix(text, "You configure Kogen for an existing software project.") || text != InitInstructions() {
		t.Fatalf("policy %q", text)
	}
}

func TestInitLeavesOutAFailingCheckOnTheCommittedTree(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("mix.exs", "defmodule ExApp.MixProject do\n  def project, do: [app: :ex_app]\nend\n")
	f.write(".formatter.exs", "[inputs: [\"lib/*.ex\"]]\n")
	f.write("lib/ex_app.ex", "defmodule ExApp do\nend\n")
	f.commitAll("ex app")
	f.write("lib/ex_app.ex", "defmodule ExApp do\n  # changed outside Kogen\nend\n")

	out, errs := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: mix deps.get",
		"Fix: mix format",
		"Checks: format, test",
		"Protect: .formatter.exs",
		"Left out: compile (mix compile --warnings-as-errors) failed with status 1",
		"Acceptance: Cucumber bridge added in features/steps",
		"Commit: {sha8} Add Kogen configuration")
	for _, line := range []string{
		"kogen: running setup-1: mix deps.get",
		"kogen: running setup-1 again: mix deps.get",
		"kogen: checking format: mix format --check-formatted",
		"kogen: checking compile: mix compile --warnings-as-errors",
		"kogen: checking test: mix test",
	} {
		if !strings.Contains(errs, line+"\n") {
			t.Errorf("stderr lacks %q:\n%s", line, errs)
		}
	}
	yaml := f.read(".kogen/project.yaml")
	for _, want := range []string{"    - name: format\n", "      run: 'mix format --check-formatted'\n", "    - 'mix format'\n", "  - '.formatter.exs'\n"} {
		if !strings.Contains(yaml, want) {
			t.Errorf("project.yaml lacks %q:\n%s", want, yaml)
		}
	}
	if st := f.dirtyPaths(); st != " M lib/ex_app.ex\n" {
		t.Fatalf("working tree %q", st)
	}
	body, _ := json.Marshal(f.requests()[0])
	if !strings.Contains(string(body), "## File mix.exs") || !strings.Contains(string(body), "defmodule ExApp.MixProject") {
		t.Fatalf("request lacks mix.exs: %s", body)
	}
	// The detection result is part of the request, keys in the Elixir order.
	if !strings.Contains(string(body), `# Detected\n\n{\"setup\":[\"mix deps.get\"],\"protect\":[\".formatter.exs\"],\"fix\":[\"mix format\"],\"checks\":[{\"name\":\"format\"`) {
		t.Fatalf("request lacks the detection result: %s", body)
	}
	if got := f.read(".kogen/project.yaml"); strings.Contains(got, "compile") {
		t.Fatalf("compile kept:\n%s", got)
	}
	if exit, _, _, err := f.run(""); exit != 0 || err != nil {
		t.Fatalf("second run: %d %v", exit, err)
	}
}

func TestInitRunsEveryProjectCommandOnACopyOfTheCommittedTree(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("mix.exs", "defmodule A.MixProject do\nend\n")
	f.write(".gitignore", "deps/\n")
	f.write("lib/a.ex", "tracked\n")
	f.commitAll("a")
	f.write("lib/a.ex", "changed\n")
	f.write("untracked.txt", "u\n")
	f.write("deps/dep.txt", "ignored\n")
	// Records what the checks see on the copy.
	f.program("mix", `case "$*" in
  "deps.get") exit 0;;
  "compile --warnings-as-errors") { cat lib/a.ex; [ -e untracked.txt ] && echo untracked; [ -e deps/dep.txt ] && echo deps; [ -e .git ] && echo git; pwd; } > "$MIXLOG"; exit 0;;
  "test") exit 0;;
esac
exit 3`)
	log := filepath.Join(filepath.Dir(f.repo), "mix.log")
	f.env = append(f.env, "MIXLOG="+log)
	f.mustRun()
	got, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(got)), "\n")
	if len(lines) != 3 || lines[0] != "tracked" || lines[1] != "deps" || strings.HasPrefix(lines[2], f.repo) {
		t.Fatalf("copy saw %q", lines)
	}
	if _, err := os.Stat(lines[2]); err == nil {
		t.Fatalf("copy %s was not removed", lines[2])
	}
}

func TestInitLeavesOutSetupThatCannotRunTwiceOnTheSameTree(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{"mkdir seeded", "echo run >> runs.txt", "test -f README.md"}, "fix": []any{}, "checks": []any{}, "protect": []any{}}))
	f.write("README.md", "x\n")
	f.write(".gitignore", "build/\n")
	f.commitAll("notes")
	out, _ := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: test -f README.md",
		"Fix: none",
		"Checks: none passed", // quirk kept: left-out setup entries count
		"Protect: none",
		"Left out: setup-1 (mkdir seeded) is not repeatable: its second run failed with status 1; setup-2 (echo run >> runs.txt) is not repeatable: its second run changed runs.txt",
		"Acceptance: Cucumber bridge added in features/steps",
		"Commit: {sha8} Add Kogen configuration",
		initNextChecks)
	if f.exists("seeded") || f.exists("runs.txt") {
		t.Fatal("setup ran in the working tree")
	}
}

func TestInitSetupThatFailsIsLeftOut(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{"exit 4"}, "fix": []any{"test -f README.md"}, "checks": []any{map[string]any{"name": "fails", "run": "exit 7"}}, "protect": []any{"README.md"}}))
	f.write("README.md", "x\n")
	f.commitAll("notes")
	out, _ := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: none",
		"Fix: test -f README.md",
		"Checks: none passed",
		"Protect: none",
		"Left out: setup-1 (exit 4) failed with status 4; fails (exit 7) failed with status 7",
		"Acceptance: Cucumber bridge added in features/steps",
		"Commit: {sha8} Add Kogen configuration",
		initNextChecks)
	cfg := f.config()
	// Without a passing check nothing is protected; a passing fixer is kept.
	if len(cfg.Protect) != 0 || !reflect.DeepEqual(cfg.Fix, []string{"test -f README.md"}) {
		t.Fatalf("config %+v", cfg)
	}
}

func TestInitLeavesOutAFailingFixerAndKeepsAPassingOne(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{"echo boom-fix >&2; exit 5", "test -f README.md && test -r README.md"}, "checks": []any{map[string]any{"name": "ok", "run": "test -f README.md"}}, "protect": []any{}}))
	f.write("README.md", "# notes\n")
	f.commitAll("notes")
	out, errs := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: none",
		"Fix: test -f README.md && test -r README.md",
		"Checks: ok",
		"Protect: none",
		"Left out: fix-1 (echo boom-fix >&2; exit 5) failed with status 5",
		"Acceptance: Cucumber bridge added in features/steps",
		"Commit: {sha8} Add Kogen configuration")
	for _, line := range []string{"kogen: checking ok: test -f README.md", "kogen: running fix-1: echo boom-fix >&2; exit 5\n  | boom-fix\nkogen: running fix-2: test -f README.md && test -r README.md"} {
		if !strings.Contains(errs, line+"\n") {
			t.Errorf("stderr lacks %q:\n%s", line, errs)
		}
	}
	if cfg := f.config(); !reflect.DeepEqual(cfg.Fix, []string{"test -f README.md && test -r README.md"}) {
		t.Fatalf("config %+v", cfg)
	}
}

func TestInitRunsFixersAfterTheChecksOnTheCopy(t *testing.T) {
	parallel(t)
	rewrite := `echo rewritten > notes.txt`
	again := `echo run > runs.txt && test ! -e .git && test -n "$KOGEN_NODE"`
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{rewrite, again}, "checks": []any{map[string]any{"name": "same", "run": "grep -qx '# notes' README.md"}}, "protect": []any{}}))
	f.write("README.md", "# notes\n")
	f.commitAll("notes")
	out, _ := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: none",
		"Fix: echo rewritten > notes.txt; echo run > runs.txt && test ! -e .git && test -n \"$KOGEN_NODE\"",
		"Checks: same",
		"Protect: none",
		"Acceptance: Cucumber bridge added in features/steps",
		"Commit: {sha8} Add Kogen configuration")
	if cfg := f.config(); !reflect.DeepEqual(cfg.Fix, []string{rewrite, again}) {
		t.Fatalf("config %+v", cfg)
	}
	if f.read("README.md") != "# notes\n" || f.exists("notes.txt") || f.exists("runs.txt") || f.dirtyPaths() != "" {
		t.Fatalf("fixers reached the working tree: %q", f.dirtyPaths())
	}
}

func TestInitUsesTheProjectsOwnCucumberRunner(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{}, "fix": []any{}, "checks": []any{map[string]any{"name": "docs", "run": "node docs-check.js"}}, "protect": []any{}}))
	f.write("README.md", "# node app\n")
	f.write("package.json", `{"scripts":{"test":"node --test","lint":"eslint ."},"devDependencies":{"@cucumber/cucumber":"13.3.0"}}`)
	f.write("package-lock.json", "{}")
	f.write("features/step_definitions/app_steps.js", "// steps\n")
	f.write("docs-check.js", "// check\n")
	f.commitAll("node app")
	out, _ := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: npm ci --no-audit --no-fund",
		"Fix: none",
		"Checks: test, docs",
		"Protect: none",
		"Left out: lint (npm run lint) failed with status 2",
		"Acceptance: existing Cucumber runner, steps in features/step_definitions",
		"Commit: {sha8} Add Kogen configuration")
	if got := f.commitFiles(); !reflect.DeepEqual(got, []string{".gitignore", ".kogen/models.yaml", ".kogen/project.yaml"}) {
		t.Fatalf("commit files %v", got)
	}
	yaml := f.read(".kogen/project.yaml")
	if !strings.Contains(yaml, "    - name: docs\n      run: 'node docs-check.js'\n") || !strings.Contains(yaml, `node_modules/@cucumber/cucumber/bin/cucumber.js`) {
		t.Fatalf("project.yaml:\n%s", yaml)
	}
	if cfg := f.config(); cfg.Acceptance.StepsDir != "features/step_definitions" {
		t.Fatalf("%+v", cfg.Acceptance)
	}
}

func TestInitReportsAnExistingRunnerThatDoesNotStart(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("README.md", "x\n")
	f.write("package.json", `{"devDependencies":{"@cucumber/cucumber":"13.3.0"}}`)
	f.write("features/steps/a.js", "this is not JavaScript\n")
	f.commitAll("node app")
	f.env = append(f.env, "FAKE_NODE_STATUS=1")
	out, _ := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: none",
		"Fix: none",
		"Checks: none found",
		"Protect: none",
		"Acceptance: not configured: the runner check failed with status 1",
		"Commit: {sha8} Add Kogen configuration",
		initNextAcceptance, initNextChecks)
	if f.exists("features/steps/README.md") {
		t.Fatal("added the bridge next to an existing runner")
	}
}

func TestInitBridgeThatWritesNoReportIsNotAdded(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("README.md", "x\n")
	f.commitAll("notes")
	f.program("node", "exit 0")
	out, _ := f.mustRun()
	initWantLines(t, out,
		"Initialized Kogen in "+f.repo,
		"Setup: none",
		"Fix: none",
		"Checks: none found",
		"Protect: none",
		"Acceptance: not configured: the runner check wrote no report",
		"Commit: {sha8} Add Kogen configuration",
		initNextAcceptance, initNextChecks)
	if f.exists("features/steps/README.md") || !reflect.DeepEqual(f.commitFiles(), []string{".gitignore", ".kogen/models.yaml", ".kogen/project.yaml"}) {
		t.Fatalf("files %v", f.commitFiles())
	}
}

func TestInitAsksOnceToRemoveDependencyOnlyProtection(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true,
		initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{}, "protect": []any{"mix.exs", ".formatter.exs"}}),
		initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{}, "protect": []any{".formatter.exs"}}))
	f.write("mix.exs", "defmodule A.MixProject do\n  def project, do: [app: :a, deps: []]\nend\n")
	f.write(".formatter.exs", "[]\n")
	f.commitAll("a")
	f.mustRun()
	req := f.requests()
	if len(req) != 2 {
		t.Fatalf("%d requests", len(req))
	}
	second, _ := json.Marshal(req[1])
	if !strings.Contains(string(second), "invalid: protect path mix.exs is not eligible") {
		t.Fatalf("request 2: %s", second)
	}
	yaml := f.read(".kogen/project.yaml")
	if !strings.Contains(yaml, "  - '.formatter.exs'\n") || strings.Contains(yaml, "mix.exs") {
		t.Fatalf("project.yaml:\n%s", yaml)
	}
}

func TestInitRepliesToACallWithItsOutputAndReplaysTheAnswer(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true,
		initSubmit(map[string]any{"setup": []any{"mix local.hex --force"}, "fix": []any{}, "checks": []any{}, "protect": []any{}}),
		initNothing())
	f.write("README.md", "x\n")
	f.commitAll("a")
	f.mustRun()
	req := f.requests()
	if len(req) != 2 {
		t.Fatalf("%d requests", len(req))
	}
	first, second := initInput(req[0]), initInput(req[1])
	if len(first) != 2 || len(second) != 4 || !reflect.DeepEqual(second[:2], first) {
		t.Fatalf("inputs %v / %v", first, second)
	}
	call, output := second[2], second[3]
	if call["type"] != "function_call" || call["call_id"] != "call_1" || output["type"] != "function_call_output" || output["call_id"] != "call_1" {
		t.Fatalf("conversation %v", second)
	}
	text := output["output"].(string)
	if !strings.HasPrefix(text, "invalid: setup command mix local.hex --force is a one-time machine prerequisite") {
		t.Fatalf("output %q", text)
	}
	if got := f.read(".kogen/project.yaml"); strings.Contains(got, "local.hex") {
		t.Fatal("kept the prerequisite")
	}
}

func TestInitAnAnswerWithoutTheCallIsAskedForAgain(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initAnswerText("I think the project is fine."), initNothing())
	f.write("README.md", "x\n")
	f.commitAll("a")
	f.mustRun()
	second := initInput(f.requests()[1])
	if len(second) != 4 {
		t.Fatalf("input %v", second)
	}
	last := second[3]
	if last["role"] != "user" || initText(last) != "Answer by calling submit_configuration." || second[2]["type"] != "message" {
		t.Fatalf("input %v", second)
	}
}

func TestInitTwoInvalidAnswersEndWithNothingWritten(t *testing.T) {
	parallel(t)
	bad := initSubmit(map[string]any{"setup": "no", "fix": []any{}, "checks": []any{}, "protect": []any{}})
	for name, script := range map[string][]initSSE{
		"invalid twice":      {bad, bad},
		"no call twice":      {initAnswerText("a"), initAnswerText("b")},
		"no call then bad":   {initAnswerText("a"), bad},
		"invalid then no it": {bad, initAnswerText("a")},
	} {
		t.Run(name, func(t *testing.T) {
			parallel(t)
			f := initNewFx(t, true, script...)
			f.write("notes.txt", "x\n")
			f.commitAll("a")
			head := f.head()
			e := f.wantError("provider", "init_invalid", 4)
			if e.Detail != "the model did not return a valid configuration; nothing was written" || f.exists(".kogen") || f.head() != head || f.dirtyPaths() != "" {
				t.Fatalf("%v %q", e, f.dirtyPaths())
			}
			if len(f.requests()) != 2 {
				t.Fatalf("%d requests", len(f.requests()))
			}
			if f.out.String() != "" {
				t.Fatalf("stdout %q", f.out.String())
			}
		})
	}
}

func TestInitProviderFailureEndsInitWithoutWriting(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true)
	f.write("notes.txt", "x\n")
	f.commitAll("a")
	_, _, _, err := f.run("")
	e, ok := sys.AsError(err)
	if !ok || e.Class != "provider" || f.exists(".kogen") {
		t.Fatalf("err %v", err)
	}
}

func TestInitAlreadyInitializedChangesNothing(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("README.md", "x\n")
	f.commitAll("a")
	f.mustRun()
	team := "models:\n  shape:\n    model: gpt-6.1-sol\n    effort: low\n"
	f.write(project.ModelsPath, team)
	f.commitAll("team selection")
	head := f.head()
	f.out.Reset()
	out, errs := f.mustRun()
	lineup, err := project.LoadModels(f.repo)
	if err != nil || lineup.Roles["shape"].Effort != "low" || f.read(project.ModelsPath) != team {
		t.Fatalf("team lineup changed: %+v %v", lineup, err)
	}
	initWantLines(t, out, "Kogen is already initialized in "+f.repo, initNextChecks)
	if errs != "" || f.head() != head || len(f.requests()) != 1 || f.dirtyPaths() != "" {
		t.Fatalf("stderr %q head %s requests %d", errs, f.head(), len(f.requests()))
	}
}

func TestInitAlreadyInitializedPrintsWhatIsMissing(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	f.write(".kogen/project.yaml", project.Template())
	f.commitAll("configured")
	out, _ := f.mustRun()
	initWantLines(t, out, "Kogen is already initialized in "+f.repo, initNextAcceptance, initNextChecks)
}

func TestInitAlreadyInitializedReportsOneTimeSetup(t *testing.T) {
	parallel(t)
	cases := []struct {
		name  string
		setup []string
		notes []string
	}{
		{"bootstrap", []string{"mix local.hex --force", "mix deps.get"}, []string{"mix local.hex --force"}},
		{"global install", []string{"npm install -g typescript"}, []string{"npm install -g typescript"}},
		{"publish and deploy", []string{"go mod download", "npm publish", "terraform apply"}, []string{"npm publish", "terraform apply"}},
		{"recurring", []string{"go mod download"}, nil},
		{"empty", []string{}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			parallel(t)
			f := initNewFx(t, false)
			cfg, err := json.Marshal(c.setup)
			if err != nil {
				t.Fatal(err)
			}
			f.write(".kogen/project.yaml", "version: 1\ncommands:\n  setup: "+string(cfg)+"\n")
			f.commitAll("configured")
			head := f.head()
			want := []string{"Kogen is already initialized in " + f.repo}
			for _, n := range c.notes {
				want = append(want, "Note: setup command ("+n+") looks like a one-time machine bootstrap")
			}
			want = append(want, initNextAcceptance, initNextChecks)
			out, _ := f.mustRun()
			initWantLines(t, out, want...)
			if f.head() != head || f.dirtyPaths() != "" {
				t.Fatalf("head %s dirty %q", f.head(), f.dirtyPaths())
			}
		})
	}
}

func TestInitCommitsTheConfigurationAFailedInitLeftBehind(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	f.write("README.md", "x\n")
	f.commitAll("a")
	f.write(".kogen/project.yaml", "version: 1\ncommands:\n  setup: []\n  fix: []\n  checks:\n    - name: test\n      run: 'true'\n  acceptance:\n    run: 'x'\n    steps_dir: features/steps\nprotect: []\n")
	f.write("features/steps/README.md", "x\n")
	f.write("other.txt", "stays out\n")
	f.write(".gitignore", "build")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Commit: {sha8} Add Kogen configuration")
	if got := f.commitFiles(); !reflect.DeepEqual(got, []string{".gitignore", ".kogen/models.yaml", ".kogen/project.yaml", "features/steps/README.md"}) {
		t.Fatalf("commit files %v", got)
	}
	if got := f.read(".gitignore"); got != "build\n.kogen/local/\n" {
		t.Fatalf(".gitignore %q", got)
	}
	if st := f.dirtyPaths(); st != "?? other.txt\n" || len(f.requests()) != 0 {
		t.Fatalf("status %q", st)
	}
}

func TestInitLeftoverConfigurationMustBeValid(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true)
	f.write("README.md", "x\n")
	f.commitAll("a")
	f.write(".kogen/project.yaml", "version: 1\nlimits: 3\n")
	e := f.wantError("environment", "project_config_invalid", 3)
	if len(e.Lines) != 1 || !strings.HasPrefix(e.Lines[0], "line 2: ") {
		t.Fatalf("%+v", e)
	}
}

func TestInitRefusesUncommittedChangesToTheFilesItWrites(t *testing.T) {
	parallel(t)
	for _, path := range []string{".gitignore", "features/steps/README.md"} {
		t.Run(path, func(t *testing.T) {
			parallel(t)
			f := initNewFx(t, true, initNothing())
			f.write("README.md", "x\n")
			f.commitAll("a")
			f.write(path, "changed\n")
			e := f.wantError("environment", "dirty_tree", 5)
			if e.Detail != path+" has uncommitted changes; commit, stash or discard them first" || f.exists(".kogen") || len(f.requests()) != 0 {
				t.Fatalf("%v", e)
			}
		})
	}
}

func TestInitRefusesAnEarlierKogensConfigurationBeforeLoginOrWrites(t *testing.T) {
	parallel(t)
	// SET-4: a legacy file the repository ignores is still refused, signed in or not.
	for _, signedIn := range []bool{false, true} {
		f := initNewFx(t, signedIn, initNothing())
		f.write("README.md", "x\n")
		f.write(".gitignore", ".kogen/\n")
		f.commitAll("ignore local configuration")
		legacy := "# Keep this legacy configuration\ncommands: {}\n"
		f.write(".kogen/project.yaml", legacy)
		head := f.head()
		e := f.wantError("environment", "old_kogen_config", 3)
		if e.Detail != ".kogen/ is from an earlier Kogen; move it aside (git mv .kogen .kogen-old), commit, and run kogen init" ||
			f.read(".kogen/project.yaml") != legacy || f.head() != head || len(f.requests()) != 0 {
			t.Fatalf("signedIn=%v: %v", signedIn, e)
		}
	}
}

func TestInitCommitFailureLeavesTheFilesUncommitted(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("README.md", "x\n")
	f.commitAll("a")
	hooks := strings.TrimSpace(f.git("config", "core.hooksPath"))
	if err := os.WriteFile(filepath.Join(hooks, "pre-commit"), []byte("#!/bin/sh\necho 'hook says no'\nexit 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	head := f.head()
	exit, out, _, err := f.run("")
	e, ok := sys.AsError(err)
	if !ok || e.Reason != "commit_failed" || exit != 3 || e.Detail != "git commit failed (status 1); the configuration is left uncommitted" ||
		!reflect.DeepEqual(e.Lines, []string{"hook says no"}) {
		t.Fatalf("exit %d err %+v", exit, err)
	}
	// The lines before the commit were printed; the files stay, unstaged.
	if !strings.HasPrefix(out, "Initialized Kogen in "+f.repo+"\n") || strings.Contains(out, "Commit:") {
		t.Fatalf("stdout %q", out)
	}
	if f.head() != head || !f.exists(".kogen/project.yaml") || !f.exists(project.ModelsPath) {
		t.Fatal("state after the failed commit")
	}
	if st := f.dirtyPaths(); st != "?? .gitignore\n?? .kogen/\n?? features/\n" {
		t.Fatalf("status %q", st)
	}
	// The next init commits what was left (SET-3).
	team := f.read(project.ModelsPath)
	os.Remove(filepath.Join(hooks, "pre-commit"))
	initWantAfter, _ := f.mustRun()
	initWantLines(t, initWantAfter, "Initialized Kogen in "+f.repo, "Commit: {sha8} Add Kogen configuration", initNextChecks)
	if f.read(project.ModelsPath) != team || !slices.Contains(f.commitFiles(), project.ModelsPath) {
		t.Fatal("leftover lineup not committed unchanged")
	}
}

func TestInitFirstCommitFailureLeavesNothingStaged(t *testing.T) {
	parallel(t)
	f := initNewFx(t, false)
	hooks := strings.TrimSpace(f.git("config", "core.hooksPath"))
	os.WriteFile(filepath.Join(hooks, "pre-commit"), []byte("#!/bin/sh\nexit 1\n"), 0o755)
	e := f.wantError("environment", "commit_failed", 3)
	_ = e
	if got := f.git("status", "--porcelain"); got != "?? .gitignore\n?? .kogen/\n" {
		t.Fatalf("status %q", got)
	}
}

func TestInitInterruptedBeforeAnyCommandStartsNothing(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("mix.exs", "x\n")
	f.commitAll("a")
	s := sys.NewWith(f.env, f.repo)
	s.Stdout, s.Stderr = f.out, f.err
	s.Interrupt("SIGINT")
	exit, err := Init(context.Background(), s, InitInput{Client: provider.NewClient("dev+12345678"), Tools: f.tools, Home: f.home})
	var in *sys.Interrupted
	if !errors.As(err, &in) || exit != 130 {
		t.Fatalf("exit %d err %v", exit, err)
	}
	if f.exists(".kogen") {
		t.Fatal("wrote .kogen")
	}
}

func TestInitHomeDefaultsToTheSessionsHome(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initNothing())
	f.write("README.md", "x\n")
	f.commitAll("a")
	s := sys.NewWith(f.env, f.repo)
	s.Stdout, s.Stderr = f.out, f.err
	exit, err := Init(context.Background(), s, InitInput{Client: provider.NewClient("dev+12345678"), Tools: f.tools})
	if exit != 0 || err != nil {
		t.Fatalf("exit %d err %v", exit, err)
	}
}

func TestInitCommitSubjectsFollowTheRepositoryState(t *testing.T) {
	parallel(t)
	// SET-3 quirk kept from the Elixir Kogen: a leftover configuration committed in a
	// repository without commits uses the first commit's subject but reports the usual line.
	f := initNewFx(t, false)
	f.write(".kogen/project.yaml", project.Template())
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Commit: {sha8} Add Kogen configuration", initNextAcceptance, initNextChecks)
	if f.subject() != "Initial commit" {
		t.Fatal(f.subject())
	}
}

func TestInitRejectsMutatingChecksAndRestoresSetupState(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{
		"setup": []any{"echo setup > setup.txt"}, "fix": []any{}, "checks": []any{
			map[string]any{"name": "fmt", "run": "echo y > a.txt"},
			map[string]any{"name": "delete", "run": "rm b.txt"},
			map[string]any{"name": "ok", "run": `test "$(cat setup.txt)" = setup && test "$(cat a.txt)" = x && test "$(cat b.txt)" = x`},
			map[string]any{"name": "scratch", "run": "echo note >> scratch.log"},
		}, "protect": []any{}}))
	f.write("README.md", "fixture\n")
	f.write("a.txt", "x\n")
	f.write("b.txt", "x\n")
	f.commitAll("seed")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: echo setup > setup.txt", "Fix: none", "Checks: ok, scratch", "Protect: none", "Left out: fmt (echo y > a.txt) changed a.txt; delete (rm b.txt) changed b.txt", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration")
	cfg := f.config()
	if len(cfg.Checks) != 2 || cfg.Checks[0].Name != "ok" || cfg.Checks[1].Name != "scratch" {
		t.Fatalf("checks: %+v", cfg.Checks)
	}
	if f.read("a.txt") != "x\n" || f.read("b.txt") != "x\n" || f.exists("scratch.log") {
		t.Fatal("working tree changed")
	}
}

func TestInitMutationPathListAtFive(t *testing.T) {
	for _, tc := range []struct{ command, paths string }{
		{"echo y > b.txt; echo y > a.txt", "a.txt, b.txt"},
		{"for p in e.txt d.txt c.txt b.txt a.txt; do echo y > \"$p\"; done", "a.txt, b.txt, c.txt, d.txt, e.txt"},
		{"for p in .kogen/models.yaml d.txt c.txt b.txt a.txt; do echo y > \"$p\"; done", ".kogen/models.yaml, a.txt, b.txt, c.txt, d.txt"},
	} {
		t.Run(tc.paths, func(t *testing.T) {
			f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{map[string]any{"name": "fmt", "run": tc.command}, map[string]any{"name": "ok", "run": "test -f README.md"}}, "protect": []any{}}))
			f.write("README.md", "fixture\n")
			f.write(project.ModelsPath, project.ModelsTemplate())
			for _, p := range []string{"a.txt", "b.txt", "c.txt", "d.txt", "e.txt"} {
				f.write(p, "x\n")
			}
			f.commitAll("seed")
			out, _ := f.mustRun()
			initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: none", "Fix: none", "Checks: ok", "Protect: none", "Left out: fmt ("+tc.command+") changed "+tc.paths, "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration")
		})
	}
}

func TestInitRestoresTrackedFilesWhenCheckReplacesTheirDirectory(t *testing.T) {
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{
		map[string]any{"name": "delete", "run": "rm -rf dir; echo x > dir"},
		map[string]any{"name": "ok", "run": `test "$(cat dir/a.txt)" = x && test "$(cat dir/b.txt)" = y`},
	}, "protect": []any{}}))
	f.write("README.md", "fixture\n")
	f.write("dir/a.txt", "x\n")
	f.write("dir/b.txt", "y\n")
	f.commitAll("seed")
	out, _ := f.mustRun()
	initWantLines(t, out, "Initialized Kogen in "+f.repo, "Setup: none", "Fix: none", "Checks: ok", "Protect: none", "Left out: delete (rm -rf dir; echo x > dir) changed dir/a.txt, dir/b.txt", "Acceptance: Cucumber bridge added in features/steps", "Commit: {sha8} Add Kogen configuration")
}

func TestInitResultFiltersProtectionForKeptChecks(t *testing.T) {
	lint := project.Check{Name: "lint", Run: "npm run lint"}
	ok := project.Check{Name: "ok", Run: "true"}
	mix := project.Check{Name: "mix-check", Run: "mix check"}
	protect := []string{"README.md", "package.json", "mix.exs", "docs.md"}
	manifests := map[string]string{
		"package.json": `{"scripts":{"lint":"eslint ."}}`,
		"mix.exs":      `def project, do: [aliases: [check: ["test"]]]`,
	}
	for _, tc := range []struct {
		name          string
		checks        []project.Check
		embedded      bool
		want, omitted []string
	}{
		{"lint and mix kept", []project.Check{lint, mix, ok}, false, protect, nil},
		{"only ok", []project.Check{ok}, false, []string{"README.md", "docs.md"}, []string{
			"protect package.json: npm package and dependency metadata is editable; verification definitions or embedded settings can be protected as a whole",
			"protect mix.exs: Mix project and dependency metadata is editable; verification definitions or embedded settings can be protected as a whole",
		}},
		{"embedded settings", []project.Check{ok}, true, []string{"README.md", "package.json", "docs.md"}, []string{
			"protect mix.exs: Mix project and dependency metadata is editable; verification definitions or embedded settings can be protected as a whole",
		}},
		{"none", nil, false, nil, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			contents := maps.Clone(manifests)
			if tc.embedded {
				contents["package.json"] = `{"scripts":{"lint":"eslint ."},"eslintConfig":{}}`
			}
			res := initResult{checks: tc.checks, leftOut: []string{"failed check"}}
			res.filterProtect(protect, contents)
			if !reflect.DeepEqual(res.protect, tc.want) || !reflect.DeepEqual(res.leftOut, append([]string{"failed check"}, tc.omitted...)) {
				t.Fatalf("protect %v, left out %v", res.protect, res.leftOut)
			}
		})
	}
}

func TestInitSetupPreservesTrackedFiles(t *testing.T) {
	cases := []struct {
		name, command, reason string
	}{
		{"content", "grep -q y a.txt || echo y >> a.txt", "changed a.txt"},
		{"mode", "chmod +x a.txt", "changed a.txt"},
		{"existence", "rm -f a.txt", "changed a.txt"},
		{"five", "printf y > e.txt; printf y > d.txt; printf y > c.txt; printf y > b.txt; printf y > a.txt", "changed a.txt, b.txt, c.txt, d.txt, e.txt"},
		{"six", "printf y > f.txt; printf y > e.txt; printf y > d.txt; printf y > c.txt; printf y > b.txt; printf y > a.txt", "changed a.txt, b.txt, c.txt, d.txt, e.txt, ..."},
		{"second failure", "grep -q y a.txt && exit 7; echo y >> a.txt", "is not repeatable: its second run failed with status 7"},
		{"second change", "echo y >> a.txt", "is not repeatable: its second run changed a.txt"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := initNewFx(t, true, initSubmit(map[string]any{
				"setup": []any{"mkdir -p deps && echo d > deps/f", "echo u > scratch", tc.command, `test "$(cat a.txt)" = x && test -f deps/f && test -f scratch`},
				"fix":   []any{}, "checks": []any{map[string]any{"name": "ok", "run": `test "$(cat a.txt b.txt c.txt d.txt e.txt f.txt | tr -d '\n')" = xxxxxx && test ! -x a.txt && test -f deps/f && test -f scratch`}}, "protect": []any{},
			}))
			f.write("README.md", "fixture\n")
			f.write(".gitignore", "deps/\n")
			for _, name := range []string{"a.txt", "b.txt", "c.txt", "d.txt", "e.txt", "f.txt"} {
				f.write(name, "x\n")
			}
			f.commitAll("fixture")
			out, _ := f.mustRun()
			want := "Left out: setup-3 (" + tc.command + ") " + tc.reason
			if !strings.Contains(out, want+"\n") {
				t.Fatalf("missing %q in %s", want, out)
			}
			cfg := f.config()
			if !reflect.DeepEqual(cfg.Setup, []string{"mkdir -p deps && echo d > deps/f", "echo u > scratch", `test "$(cat a.txt)" = x && test -f deps/f && test -f scratch`}) || len(cfg.Checks) != 1 || cfg.Checks[0].Name != "ok" {
				t.Fatalf("config %+v; output %s", cfg, out)
			}
		})
	}
}

func TestInitUnionCommandEquivalence(t *testing.T) {
	parallel(t)
	cases := []struct {
		name       string
		a, b, want []string
	}{
		{"boundary and tabs", []string{"  npm\tci\n"}, []string{"npm  ci ", "\tnpm ci"}, []string{"  npm\tci\n"}},
		{"quotes", []string{`echo "a  b"`, `echo 'a b'`}, []string{`echo "a b"`, `echo  "a  b"`, `echo "a\"  b"`, `echo "a\" b"`}, []string{`echo "a  b"`, `echo 'a b'`, `echo "a b"`, `echo "a\"  b"`, `echo "a\" b"`}},
		{"arguments and newline", []string{"go test ./...", "echo a\nb"}, []string{"go test -race ./...", "go test ./... -race", "echo a b"}, []string{"go test ./...", "echo a\nb", "go test -race ./...", "go test ./... -race", "echo a b"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := initUnion(tc.a, tc.b); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("union = %#v, want %#v", got, tc.want)
			}
		})
	}
}

func TestInitMergeWhitespaceCommandsAndExactPaths(t *testing.T) {
	parallel(t)
	detected := project.Detected{Checks: []project.Check{{Name: "test", Run: "old"}, {Name: "other", Run: "go test ./..."}}, Setup: []string{"npm ci"}, Fix: []string{"gofmt -w ."}, Protect: []string{"a b", "path"}}
	proposed := InitProposal{Checks: []project.Check{{Name: "test", Run: "  go\ttest ./...\n"}, {Name: "duplicate", Run: "go  test ./..."}, {Name: "race", Run: "go test -race ./..."}}, Setup: []string{"npm  ci "}, Fix: []string{"gofmt\t-w .\n"}, Protect: []string{"a  b", " path", "path"}}
	want := InitProposal{Checks: []project.Check{{Name: "test", Run: "  go\ttest ./...\n"}, {Name: "race", Run: "go test -race ./..."}}, Setup: []string{"npm ci"}, Fix: []string{"gofmt -w ."}, Protect: []string{"a b", "path", "a  b", " path"}}
	if got := Merge(detected, proposed); !reflect.DeepEqual(got, want) {
		t.Fatalf("merge = %#v, want %#v", got, want)
	}
}

func TestInitVerifiesEquivalentCheckOnce(t *testing.T) {
	parallel(t)
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": initCheckList("first", "test -f README.md", "second", "test -f README.md  "), "protect": []any{}}))
	f.write("README.md", "# notes\n")
	f.commitAll("notes")
	_, errs := f.mustRun()
	cfg := f.config()
	if len(cfg.Checks) != 1 || cfg.Checks[0].Name != "first" || cfg.Checks[0].Run != "test -f README.md" {
		t.Fatalf("checks: %+v", cfg.Checks)
	}
	if !strings.Contains(errs, "kogen: checking first: test -f README.md\n") || strings.Contains(errs, "kogen: checking second:") {
		t.Fatalf("stderr: %s", errs)
	}
}

func TestInitValidateRunsNothing(t *testing.T) {
	for _, tc := range []struct {
		command string
		reject  bool
		want    []string
	}{
		{"true", true, nil}, {":", true, nil},
		{"echo \"tests passed\"", false, nil},
		{"echo 'a;b|c'", false, nil}, {`printf "%s\n" ok`, false, nil}, {`echo "\$(pwd)"`, false, nil},
		{`echo "$(pwd)"`, false, nil}, {"test -f README.md", false, nil},
		{"echo hi > out.txt", false, nil}, {"go vet ./... && echo done", false, nil},
		{"echo $(pwd)", false, nil}, {"echo `pwd`", false, nil},
		{"echo ok && exit 0", false, nil},
		{"printf '%s' ok; true || : | echo done; exit 0", false, []string{"check a (printf '%s' ok; true || : | echo done; exit 0) ignores its own failure"}},
	} {
		t.Run(tc.command, func(t *testing.T) {
			_, problems := Validate(map[string]any{"checks": initCheckList("a", tc.command)}, InitContext{})
			if tc.want != nil {
				if !reflect.DeepEqual(problems, tc.want) {
					t.Fatalf("problems: %q, want %q", problems, tc.want)
				}
			} else if tc.reject {
				if len(problems) != 1 || !strings.Contains(problems[0], "a") || !strings.Contains(problems[0], "runs nothing") {
					t.Fatalf("problems: %q", problems)
				}
			} else if len(problems) != 0 {
				t.Fatalf("problems: %q", problems)
			}
		})
	}
	_, problems := Validate(map[string]any{"setup": []any{"true"}, "fix": []any{"echo ok"}}, InitContext{DetectedChecks: []project.Check{{Name: "detected", Run: "true"}}})
	if want := []string{"setup command true runs nothing", "fix command echo ok runs nothing"}; !reflect.DeepEqual(problems, want) {
		t.Fatalf("problems: %q, want %q", problems, want)
	}
}

func TestInitValidateSetupFixRunsNothing(t *testing.T) {
	for _, kind := range []string{"setup", "fix"} {
		for _, tc := range []struct {
			command string
			reject  bool
		}{
			{"true", true}, {"echo ready", true}, {"echo done", true}, {":", true}, {"exit 0", true},
			{"echo ok && exit 0", true}, {"printf ok; true", true}, {`echo 'a;b|c'`, true},
			{`echo "\$(pwd)"`, true}, {"test -f x", false}, {"echo hi > out.txt", false},
			{"go mod download && echo done", false}, {"echo $(pwd)", false}, {"echo `pwd`", false},
			{"mix deps.get", false}, {"mkdir -p tmp", false}, {"gofmt -w .", false},
		} {
			t.Run(kind+"/"+tc.command, func(t *testing.T) {
				_, problems := Validate(map[string]any{kind: []any{tc.command}}, InitContext{})
				var want []string
				if tc.reject {
					want = []string{kind + " command " + tc.command + " runs nothing"}
				}
				if kind == "setup" && tc.command == "printf ok; true" {
					want = append(want, "setup command printf ok; true ignores its own failure")
				}
				if !reflect.DeepEqual(problems, want) {
					t.Fatalf("problems: %q, want %q", problems, want)
				}
			})
		}
	}
}

func TestInitCorrectsRunsNothingSetupFix(t *testing.T) {
	for _, kind := range []string{"setup", "fix"} {
		t.Run(kind, func(t *testing.T) {
			f := initNewFx(t, true, initSubmit(map[string]any{kind: []any{"true"}}), initNothing())
			f.write("README.md", "notes\n")
			f.commitAll("notes")
			exit, _, _, err := f.run("")
			if err != nil || exit != 0 {
				t.Fatalf("exit %d, error %v", exit, err)
			}
			requests := f.requests()
			if len(requests) != 2 {
				t.Fatalf("requests: %d", len(requests))
			}
			body, _ := json.Marshal(requests[1])
			if !strings.Contains(string(body), kind+" command true runs nothing") {
				t.Fatalf("correction: %s", body)
			}
			cfg := f.config()
			if len(cfg.Setup) != 0 || len(cfg.Fix) != 0 {
				t.Fatalf("configuration: %+v", cfg)
			}
		})
	}
}

func TestInitCorrectsRunsNothingCheck(t *testing.T) {
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("a", "true")}), initNothing())
	f.write("README.md", "notes\n")
	f.commitAll("notes")
	exit, out, _, err := f.run("")
	if err != nil || exit != 0 || !strings.Contains(out, "Checks: none found") {
		t.Fatalf("exit %d, error %v, output %q", exit, err, out)
	}
	if len(f.requests()) != 2 {
		t.Fatalf("requests: %d", len(f.requests()))
	}
	body, _ := json.Marshal(f.requests()[1])
	if !strings.Contains(string(body), "runs nothing") || !strings.Contains(string(body), "check a") {
		t.Fatalf("correction: %s", body)
	}
	if checks := f.config().Checks; len(checks) != 0 {
		t.Fatalf("checks: %v", checks)
	}
}

func TestInitValidatePublishingCommands(t *testing.T) {
	publishing := []string{"git push", "npm publish", "yarn publish", "pnpm publish", "cargo publish", "gem push", "twine upload", "docker push", "mix hex.publish"}
	deploying := []string{"terraform apply", "kubectl apply", "helm install", "helm upgrade"}
	for _, action := range append(append([]string{}, publishing...), deploying...) {
		for _, kind := range []string{"setup", "fix", "checks"} {
			for _, suffix := range []string{"", " --dry-run", " -n"} {
				command := action + suffix
				args := map[string]any{kind: []any{command}}
				context := kind
				if kind == "checks" {
					args[kind] = initCheckList("release", command)
					context = "check release"
				}
				_, problems := Validate(args, InitContext{})
				reject := suffix == "" || (suffix == " -n" && slices.Contains(deploying, action))
				if reject {
					if len(problems) != 1 || !strings.Contains(problems[0], context) || !strings.Contains(problems[0], command) || !strings.Contains(problems[0], "publishes or deploys") {
						t.Fatalf("%s %q: %q", kind, command, problems)
					}
				} else if len(problems) != 0 {
					t.Fatalf("%s %q: %q", kind, command, problems)
				}
			}
		}
	}
	for _, tc := range []struct {
		command string
		reject  bool
	}{
		{"echo ok; npm publish", true}, {"echo ok && git push", true}, {"false || npm publish", true}, {"cat x | npm publish", true}, {"echo ok\nnpm publish", true},
		{"npm publish --dry-run && git push", true}, {"  git   push origin main  ", true},
		{"npm publish --dry-run=1", true}, {"npm publish -nother", true},
		{"printf '%s' 'git push' && npm test", false}, {"git pusher", false}, {"npm test", false}, {"git diff --check", false},
	} {
		_, problems := Validate(map[string]any{"checks": initCheckList("a", tc.command)}, InitContext{})
		if (len(problems) != 0) != tc.reject {
			t.Errorf("%q: %q", tc.command, problems)
		}
	}
	_, problems := Validate(map[string]any{}, InitContext{DetectedChecks: []project.Check{{Name: "release", Run: "git push"}}})
	if len(problems) != 0 {
		t.Fatalf("detected check: %q", problems)
	}
}

func TestInitCorrectsPublishingCheckBeforePush(t *testing.T) {
	f := initNewFx(t, true, initSubmit(map[string]any{"checks": initCheckList("release", "git push origin HEAD:refs/heads/main")}), initNothing())
	remote := filepath.Join(t.TempDir(), "remote.git")
	initTestRun(t, f.repo, "git", "init", "--bare", remote)
	marker := filepath.Join(t.TempDir(), "pushed")
	if err := os.WriteFile(filepath.Join(remote, "hooks", "pre-receive"), []byte("#!/bin/sh\ntouch "+marker+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	f.git("remote", "add", "origin", remote)
	f.write("README.md", "notes\n")
	f.commitAll("notes")
	exit, out, _, err := f.run("")
	if err != nil || exit != 0 || !strings.Contains(out, "Checks: none found") {
		t.Fatalf("exit %d, error %v, output %q", exit, err, out)
	}
	if len(f.requests()) != 2 {
		t.Fatalf("requests: %d", len(f.requests()))
	}
	body, _ := json.Marshal(f.requests()[1])
	for _, text := range []string{"check release", "git push origin HEAD:refs/heads/main", "publishes or deploys"} {
		if !strings.Contains(string(body), text) {
			t.Fatalf("correction: %s", body)
		}
	}
	if checks := f.config().Checks; len(checks) != 0 {
		t.Fatalf("checks: %v", checks)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("push marker stat: %v", err)
	}
}

func TestInitValidateProjectRootCommands(t *testing.T) {
	for _, tc := range []struct {
		kind, command, root string
		reject              bool
	}{
		{"setup", "cd /work/app && make build", "/work/app", true},
		{"fix", "rm -rf /work/app/build", "/work/app", true},
		{"checks", "ls /work/app/src", "/work/app", true},
		{"checks", "ls /work/app", "/work/app", true},
		{"checks", "ls '/work/app'", "/work/app", true},
		{"checks", "ls \"/work/app\"", "/work/app", true},
		{"checks", "make test", "/work/app", false},
		{"checks", "ls /work/app-other", "/work/app", false},
		{"checks", "cd \"$PWD\" && make test", "/work/app", false},
		{"setup", "make build", "/work/app", false},
		{"fix", "ls /work/app-other", "/work/app", false},
		{"checks", "ls /work/app", "", false},
		{"checks", "ls /work/a.b/src", "/work/a.b", true},
		{"checks", "ls /work/axb/src", "/work/a.b", false},
		{"checks", "ls /work/app-other /work/app/src", "/work/app", true},
	} {
		t.Run(tc.kind+"/"+tc.command+"/"+tc.root, func(t *testing.T) {
			args := map[string]any{tc.kind: []any{tc.command}}
			label := tc.kind + " command"
			if tc.kind == "checks" {
				args[tc.kind] = initCheckList("a", tc.command)
				label = "check a"
			}
			_, problems := Validate(args, InitContext{Root: tc.root})
			if !tc.reject {
				if len(problems) != 0 {
					t.Fatalf("problems: %q", problems)
				}
				return
			}
			if len(problems) != 1 {
				t.Fatalf("problems: %q", problems)
			}
			for _, text := range []string{label, tc.command, "names the project folder by absolute path", "relative path"} {
				if !strings.Contains(problems[0], text) {
					t.Fatalf("problems: %q", problems)
				}
			}
		})
	}
}

func TestInitCorrectsProjectRootCheck(t *testing.T) {
	f := initNewFx(t, true)
	command := "test -f " + f.repo + "/README.md"
	f.script = []initSSE{initSubmit(map[string]any{"checks": initCheckList("a", command)}), initNothing()}
	f.write("README.md", "notes\n")
	f.commitAll("notes")
	exit, out, _, err := f.run("")
	if err != nil || exit != 0 || !strings.Contains(out, "Checks: none found") {
		t.Fatalf("exit %d, error %v, output %q", exit, err, out)
	}
	if len(f.requests()) != 2 {
		t.Fatalf("requests: %d", len(f.requests()))
	}
	body, _ := json.Marshal(f.requests()[1])
	for _, text := range []string{"check a", command, "names the project folder by absolute path", "relative path"} {
		if !strings.Contains(string(body), text) {
			t.Fatalf("correction: %s", body)
		}
	}
	if checks := f.config().Checks; len(checks) != 0 {
		t.Fatalf("checks: %v", checks)
	}
}

func TestInitValidateSetupSuites(t *testing.T) {
	for _, command := range []string{"mix test", "go test ./...", "go vet", "npm test", "npm run test", "npm run lint", "yarn test", "pnpm test", "pytest", "python -m pytest", "cargo test", "cargo clippy", "bundle exec rspec", "rspec", "rake test"} {
		_, got := Validate(map[string]any{"setup": []any{command}}, InitContext{})
		want := []string{"setup command " + command + " runs tests or linting; put it in checks"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%q: %q", command, got)
		}
	}
	for _, separator := range []string{";", "&&", "||"} {
		_, got := Validate(map[string]any{"setup": []any{"npm ci " + separator + "  go test ./...  "}}, InitContext{})
		want := []string{"setup command go test ./... runs tests or linting; put it in checks"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%q: %q", separator, got)
		}
	}
	for _, command := range []string{"npm ci", "mix deps.get", "mix compile", "go mod download", "cargo fetch", "echo mix test > out.txt", "npm run testing", "mix testing", "python -m pytestfoo", "echo ok | go test"} {
		_, got := Validate(map[string]any{"setup": []any{command}}, InitContext{})
		if len(got) != 0 {
			t.Errorf("%q: %q", command, got)
		}
	}
	for _, command := range []string{"CI=1 npm test", "npx jest", "time go test ./...", "env CI=1 npm test", "pnpm exec jest", "yarn jest", "bunx vitest run", "npx eslint .", "CI=1 FORCE_COLOR=0 npx jest --ci", "time make test", "make test", "make lint", "just test", "jest", "vitest run", "eslint .", "ruff check .", "ruff .", "tox", "mvn test", "gradle test", "dotnet test", "phpunit"} {
		_, got := Validate(map[string]any{"setup": []any{command}}, InitContext{})
		want := []string{"setup command " + command + " runs tests or linting; put it in checks"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("setup %q: %q", command, got)
		}
	}
	_, got := Validate(map[string]any{"setup": []any{"npm ci && CI=1 npm test"}}, InitContext{})
	if want := []string{"setup command CI=1 npm test runs tests or linting; put it in checks"}; !reflect.DeepEqual(got, want) {
		t.Errorf("setup part: %q", got)
	}
	for _, command := range []string{"go test ./...", "CI=1 npm test", "npx eslint .", "make lint", "go vet ./..."} {
		_, got := Validate(map[string]any{"fix": []any{command}}, InitContext{})
		want := []string{"fix command " + command + " runs tests or linting; put it in checks"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("fix %q: %q", command, got)
		}
	}
	_, got = Validate(map[string]any{"fix": []any{"gofmt -w . && go vet ./..."}}, InitContext{})
	if want := []string{"fix command go vet ./... runs tests or linting; put it in checks"}; !reflect.DeepEqual(got, want) {
		t.Errorf("fix part: %q", got)
	}
	for _, command := range []string{"CI=1 npm ci", "env CI=1 npm ci", "yarn install --frozen-lockfile", "pnpm exec prisma generate", "make build", "just build", "make testdata", "npm run testing", "ruff format ."} {
		_, got := Validate(map[string]any{"setup": []any{command}}, InitContext{})
		if len(got) != 0 {
			t.Errorf("setup %q: %q", command, got)
		}
	}
	for _, command := range []string{"gofmt -w .", "mix format", "prettier --write .", "npx prettier --write .", "ruff format ."} {
		_, got := Validate(map[string]any{"fix": []any{command}}, InitContext{})
		if len(got) != 0 {
			t.Errorf("fix %q: %q", command, got)
		}
	}
	for _, command := range []string{"go test ./...", "CI=1 npm test", "npx jest", "make test", "time go test ./..."} {
		_, got := Validate(map[string]any{"checks": initCheckList("test", command)}, InitContext{})
		if len(got) != 0 {
			t.Errorf("check %q: %q", command, got)
		}
	}
}

func TestInitCorrectsSetupSuiteBeforeExecution(t *testing.T) {
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{"go test ./..."}}), initNothing())
	f.write("README.md", "notes\n")
	f.commitAll("notes")
	exit, _, _, err := f.run("")
	if err != nil || exit != 0 {
		t.Fatalf("exit %d, error %v", exit, err)
	}
	if len(f.requests()) != 2 {
		t.Fatalf("requests: %d", len(f.requests()))
	}
	body, _ := json.Marshal(f.requests()[1])
	if !strings.Contains(string(body), "setup command go test ./... runs tests or linting; put it in checks") {
		t.Fatalf("correction: %s", body)
	}
	if setup := f.config().Setup; len(setup) != 0 {
		t.Fatalf("setup: %v", setup)
	}
}

func TestInitValidateFailureMasks(t *testing.T) {
	for _, tc := range []struct{ command, result string }{
		{"false || true", "mask"}, {"ls missing-dir; true", "mask"}, {"sleep 1 &", "mask"},
		{"make test || true", "mask"}, {"npm test || :", "mask"}, {"pytest; true", "mask"},
		{"go test ./... || exit 0", "mask"}, {"false; :", "mask"}, {"false; exit 0", "mask"},
		{"test -f README.md || (echo missing; exit 1)", ""},
		{`echo "a || true"`, ""}, {"false || echo failed && exit 1", ""},
		{"false || (cat log; exit 1)", ""}, {"if false; then true; fi", ""},
		{"case x in x) true;; esac", ""}, {`test -f "a || true"`, ""},
		{"sleep 1 & wait", ""}, {"cmd1 | cat", ""},
		{"test -f README.md # || true", ""}, {"test -f README.md # sleep &", ""},
	} {
		t.Run(tc.command, func(t *testing.T) {
			_, problems := Validate(map[string]any{"checks": initCheckList("test", tc.command)}, InitContext{})
			var want []string
			if tc.result != "" {
				suffix := "ignores its own failure"
				if tc.result == "nothing" {
					suffix = "runs nothing"
				}
				want = []string{fmt.Sprintf("check test (%s) %s", tc.command, suffix)}
			}
			if !reflect.DeepEqual(problems, want) {
				t.Fatalf("problems: %q, want %q", problems, want)
			}
		})
	}
	_, problems := Validate(map[string]any{"fix": []any{"false || true"}}, InitContext{})
	if len(problems) != 0 {
		t.Fatalf("fix: %q", problems)
	}
}

func TestInitValidateSetupFailureMasks(t *testing.T) {
	for _, command := range []string{
		"false || true", "bundle install; true", "npm ci; :", "npm ci; exit 0", "npm ci &",
		"npm ci || true", "npm ci || :", "npm ci || exit 0",
	} {
		t.Run(command, func(t *testing.T) {
			got, problems := Validate(map[string]any{"setup": []any{command}}, InitContext{})
			want := []string{"setup command " + command + " ignores its own failure"}
			if !reflect.DeepEqual(problems, want) || !reflect.DeepEqual(got, InitProposal{}) {
				t.Fatalf("got proposal %+v, problems %q; want zero proposal and %q", got, problems, want)
			}
		})
	}
	for _, command := range []string{
		"npm ci", "npm ci || (cat log; exit 1)", "if false; then true; fi",
		"case x in x) true;; esac", "sleep 1 & wait", `test -f "a || true"`,
	} {
		t.Run(command, func(t *testing.T) {
			got, problems := Validate(map[string]any{"setup": []any{command}}, InitContext{})
			if len(problems) != 0 || reflect.DeepEqual(got, InitProposal{}) {
				t.Fatalf("got proposal %+v, problems %q", got, problems)
			}
		})
	}
	for _, tc := range []struct {
		command string
		want    []string
	}{
		{"echo 'a || true'", []string{"setup command echo 'a || true' runs nothing"}},
		{"npm test || true", []string{"setup command npm test || true ignores its own failure", "setup command npm test runs tests or linting; put it in checks"}},
	} {
		t.Run(tc.command, func(t *testing.T) {
			got, problems := Validate(map[string]any{"setup": []any{tc.command}}, InitContext{})
			if !reflect.DeepEqual(problems, tc.want) || !reflect.DeepEqual(got, InitProposal{}) {
				t.Fatalf("got proposal %+v, problems %q; want zero proposal and %q", got, problems, tc.want)
			}
		})
	}
}

func TestInitValidateProtectPathSpelling(t *testing.T) {
	ctx := InitContext{Root: "/work/p", Tracked: []string{"mix.exs", "config/.credo.exs"}, Contents: map[string]string{"mix.exs": "def project, do: [aliases: [check: [\"test\"]]]\n"}, DetectedChecks: []project.Check{{Name: "check", Run: "mix check"}}}
	cases := []struct {
		input   []string
		want    []string
		problem string
	}{
		{[]string{"./mix.exs", "/work/p/config//.credo.exs/", "mix.exs", "./config/.credo.exs"}, []string{"mix.exs", "config/.credo.exs"}, ""},
		{[]string{"../other/.credo.exs"}, nil, "protect path ../other/.credo.exs leaves the project folder"},
		{[]string{"config/../mix.exs"}, nil, "protect path config/../mix.exs leaves the project folder"},
		{[]string{"/etc/passwd"}, nil, "protect path /etc/passwd leaves the project folder"},
		{[]string{"/work/peer/config/.credo.exs"}, nil, "protect path /work/peer/config/.credo.exs leaves the project folder"},
		{[]string{"./config//missing.exs/"}, nil, "protect path config/missing.exs is not a tracked file"},
	}
	for _, tc := range cases {
		got, problems := Validate(map[string]any{"protect": tc.input}, ctx)
		if !reflect.DeepEqual(got.Protect, tc.want) || (tc.problem == "" && len(problems) != 0) || (tc.problem != "" && !reflect.DeepEqual(problems, []string{tc.problem})) {
			t.Errorf("%q: protect %q, problems %q", tc.input, got.Protect, problems)
		}
	}
}

func TestInitMergeProtectPathSpelling(t *testing.T) {
	got := Merge(project.Detected{Protect: []string{"./.credo.exs", "config//.credo.exs/"}}, InitProposal{Protect: []string{".credo.exs", "./config/.credo.exs", "./mix.exs"}})
	want := []string{".credo.exs", "config/.credo.exs", "mix.exs"}
	if !reflect.DeepEqual(got.Protect, want) {
		t.Fatalf("got %q, want %q", got.Protect, want)
	}
}

func TestInitMergeProtectDropsEmpty(t *testing.T) {
	for _, c := range []struct {
		detected, proposed, want []string
	}{
		{[]string{""}, []string{"mix.exs"}, []string{"mix.exs"}},
		{[]string{}, []string{""}, []string{}},
		{[]string{"", "config/.credo.exs"}, []string{"."}, []string{"config/.credo.exs", "."}},
	} {
		got := Merge(project.Detected{Protect: c.detected}, InitProposal{Protect: c.proposed}).Protect
		if !reflect.DeepEqual(got, c.want) {
			t.Fatalf("detected %q proposed %q: got %q, want %q", c.detected, c.proposed, got, c.want)
		}
	}
}

func TestInitValidateProtectListShapes(t *testing.T) {
	ctx := InitContext{Root: "/work/p", Tracked: []string{"mix.exs", "config/.credo.exs"}, Contents: map[string]string{"mix.exs": "def project, do: [deps: []]\n", "config/.credo.exs": "%{}\n"}}
	for _, list := range []any{[]string{"./config/.credo.exs"}, []any{"./config/.credo.exs"}} {
		got, problems := Validate(map[string]any{"protect": list}, ctx)
		if len(problems) != 0 || !reflect.DeepEqual(got.Protect, []string{"config/.credo.exs"}) {
			t.Fatalf("%T: protect %q problems %q", list, got.Protect, problems)
		}
	}
}

func TestInitValidateNormalizedProtectStillRequiresEligibility(t *testing.T) {
	ctx := InitContext{Root: "/work/p", Tracked: []string{"mix.exs"}, Contents: map[string]string{"mix.exs": "def project, do: [deps: []]\n"}}
	_, problems := Validate(map[string]any{"protect": []string{"./mix.exs"}}, ctx)
	if len(problems) != 1 || !strings.HasPrefix(problems[0], "protect path mix.exs is not eligible:") {
		t.Fatalf("problems: %q", problems)
	}
}

func TestInitPreservesExistingTeamLineup(t *testing.T) {
	f := initNewFx(t, true, initNothing())
	team := "models:\n  shape:\n    model: gpt-6.1-sol\n    effort: low\n"
	f.write("README.md", "fixture\n")
	f.write(project.ModelsPath, team)
	f.commitAll("team")
	f.mustRun()
	if f.read(project.ModelsPath) != team || len(f.requests()) != 1 {
		t.Fatal("existing team lineup changed")
	}
	lineup, err := project.LoadModels(f.repo)
	if err != nil || lineup.Roles["shape"].Effort != "low" {
		t.Fatalf("lineup %+v %v", lineup, err)
	}
}

func TestInitMergeDropsFixOnlyAfterCheckReplacement(t *testing.T) {
	detected := project.Detected{
		Setup:  []string{"npm ci"},
		Fix:    []string{"npm ci", "make  lint", "old check", "make lint --fix"},
		Checks: []project.Check{{Name: "lint", Run: "old check"}},
	}
	proposed := InitProposal{
		Setup:  []string{"make lint"},
		Fix:    []string{"npm  ci", "make lint FILTER=unit", "npm run format"},
		Checks: []project.Check{{Name: "lint", Run: "make lint"}},
	}
	want := InitProposal{
		Setup:  []string{"npm ci", "make lint"},
		Fix:    []string{"old check", "make lint --fix", "make lint FILTER=unit", "npm run format"},
		Checks: []project.Check{{Name: "lint", Run: "make lint"}}, Protect: []string{},
	}
	if got := Merge(detected, proposed); !reflect.DeepEqual(got, want) {
		t.Fatalf("merge = %+v, want %+v", got, want)
	}
}

func TestInitMergeDropsFixMatchingChecks(t *testing.T) {
	got := Merge(project.Detected{Fix: []string{"make  lint"}}, InitProposal{Fix: []string{"make lint --fix", "make lint FILTER=unit"}, Checks: []project.Check{{Name: "lint", Run: "make lint"}}})
	want := InitProposal{Setup: []string{}, Fix: []string{"make lint --fix", "make lint FILTER=unit"}, Checks: []project.Check{{Name: "lint", Run: "make lint"}}, Protect: []string{}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("merge = %+v, want %+v", got, want)
	}
}

func TestInitDropsRedundantFixBeforeVerification(t *testing.T) {
	f := initNewFx(t, true, initSubmit(map[string]any{"setup": []any{"test -f README.md"}, "fix": []any{"test  -f README.md", "test -r README.md"}, "checks": initCheckList("readable", "test -r README.md"), "protect": []any{}}))
	f.write("README.md", "fixture\n")
	f.commitAll("fixture")
	out, stderr := f.mustRun()
	if strings.Contains(stderr, "kogen: running fix-") {
		t.Fatalf("redundant fixer verified: %s", stderr)
	}
	if len(f.config().Fix) != 0 {
		t.Fatalf("fixers saved: %v", f.config().Fix)
	}
	for _, line := range []string{"Dropped: fix: test  -f README.md (already in setup)", "Dropped: fix: test -r README.md (already in checks)"} {
		if strings.Count(out, line+"\n") != 1 {
			t.Fatalf("missing or repeated %q: %s", line, out)
		}
	}
}

func TestInitVerifiesFixMatchingLeftOutCommand(t *testing.T) {
	cases := []struct {
		name, leftOut string
		setup         []any
		checks        any
	}{
		{"setup", "setup-1 (printf 'fixed\\n' > README.md) changed README.md", []any{"printf 'fixed\\n' > README.md"}, []any{}},
		{"check", "tidy (printf 'fixed\\n' > README.md) changed README.md", []any{}, initCheckList("tidy", "printf 'fixed\\n' > README.md")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := initNewFx(t, true, initSubmit(map[string]any{"setup": c.setup, "fix": []any{"printf 'fixed\\n' > README.md"}, "checks": c.checks, "protect": []any{}}))
			f.write("README.md", "draft\n")
			f.commitAll("fixture")
			out, stderr := f.mustRun()
			if got := f.config().Fix; !reflect.DeepEqual(got, []string{"printf 'fixed\\n' > README.md"}) {
				t.Fatalf("fix = %q", got)
			}
			if got := f.config().Setup; len(got) != 0 {
				t.Fatalf("setup = %q", got)
			}
			if strings.Contains(out, "Dropped:") {
				t.Fatalf("fix reported as dropped: %s", out)
			}
			if !strings.Contains(out, "Left out: "+c.leftOut+"\n") {
				t.Fatalf("missing left out %q: %s", c.leftOut, out)
			}
			if !strings.Contains(stderr, "kogen: running fix-1: ") {
				t.Fatalf("fixer not verified: %s", stderr)
			}
		})
	}
}

func TestInitMergeFixPreservesQuotedWhitespace(t *testing.T) {
	got := Merge(project.Detected{}, InitProposal{Setup: []string{`printf 'a  b'`}, Fix: []string{`printf  'a  b'`, `printf 'a b'`}})
	if !reflect.DeepEqual(got.Fix, []string{`printf 'a b'`}) {
		t.Fatalf("fix = %q", got.Fix)
	}
}

func TestInitAlreadyInitializedReportsVacuousChecks(t *testing.T) {
	parallel(t)
	type check struct{ name, run string }
	cases := []struct {
		name   string
		setup  []string
		checks []check
		notes  []string
	}{
		{"prints only", nil, []check{{"test", "echo ok"}}, []string{"Note: check test (echo ok) cannot fail: runs nothing"}},
		{"masked", nil, []check{{"test", "go test ./... || true"}}, []string{"Note: check test (go test ./... || true) cannot fail: masks its failure"}},
		{"both", nil, []check{{"test", "echo ok || true"}}, []string{"Note: check test (echo ok || true) cannot fail: runs nothing"}},
		{"real", nil, []check{{"test", "go test ./..."}}, nil},
		{"in order", nil, []check{{"lint", "touch check-ran || true"}, {"unit", "go test ./..."}, {"smoke", "echo ok"}}, []string{
			"Note: check lint (touch check-ran || true) cannot fail: masks its failure",
			"Note: check smoke (echo ok) cannot fail: runs nothing"}},
		{"after setup notes", []string{"mix local.hex --force"}, []check{{"test", "echo ok"}}, []string{
			"Note: setup command (mix local.hex --force) looks like a one-time machine bootstrap",
			"Note: check test (echo ok) cannot fail: runs nothing"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			parallel(t)
			f := initNewFx(t, false)
			setup, err := json.Marshal(append([]string{}, c.setup...))
			if err != nil {
				t.Fatal(err)
			}
			var yaml strings.Builder
			yaml.WriteString("version: 1\ncommands:\n  setup: " + string(setup) + "\n  checks:\n")
			for _, ck := range c.checks {
				yaml.WriteString("    - name: " + ck.name + "\n      run: '" + ck.run + "'\n")
			}
			f.write(".kogen/project.yaml", yaml.String())
			f.commitAll("configured")
			head := f.head()
			want := []string{"Kogen is already initialized in " + f.repo}
			want = append(want, c.notes...)
			want = append(want, initNextAcceptance)
			out, _ := f.mustRun()
			initWantLines(t, out, want...)
			if f.head() != head || f.dirtyPaths() != "" {
				t.Fatalf("head %s dirty %q", f.head(), f.dirtyPaths())
			}
		})
	}
}
