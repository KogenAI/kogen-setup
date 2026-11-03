package contract

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/KogenAI/kogen-setup/setup"
	"github.com/KogenAI/kogen-verification/verify"
	"kogen-loop/provider"
	"kogen-loop/sys"
)

const (
	fixtureName  = "Fixture"
	fixtureEmail = "fixture@example.invalid"
	// fixtureVersion is the version line the client sends, as kogen passes versionLine.
	fixtureVersion = "dev+12345678"
)

// reply writes one scripted streamed response of the loopback provider.
type reply func(w http.ResponseWriter, r *http.Request)

// initFx is a temporary repository with its own identity, no signing and an empty hooks folder,
// a HOME of its own (signed in to ChatGPT when asked), fake mix, npm and node programs, an empty
// Cucumber folder and a loopback provider on a free port that plays a script, as kogen-setup's
// setup/init_test.go builds it. Nothing reaches the network.
type initFx struct {
	t      *testing.T
	base   string
	home   string
	bin    string
	repo   string
	hooks  string
	srv    *httptest.Server
	mu     sync.Mutex
	script []reply
	bodies []map[string]any
	env    []string
	tools  verify.Tools
}

func newInitFx(t *testing.T, signedIn bool, script ...reply) *initFx {
	t.Helper()
	t.Parallel()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	f := &initFx{t: t, base: base, home: filepath.Join(base, "home"), bin: filepath.Join(base, "bin"),
		repo: filepath.Join(base, "repo"), hooks: filepath.Join(base, "hooks"), script: script}
	for _, d := range []string{f.home, f.bin, f.repo, f.hooks, filepath.Join(base, "cucumber")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	f.program("npm", `case "$*" in
  "ci --no-audit --no-fund") exit 0;;
  "run test") exit 0;;
  "run lint") exit 2;;
esac
exit 3`)
	f.program("node", `[ -n "$KOGEN_ACCEPTANCE_REPORT" ] && echo '{}' > "$KOGEN_ACCEPTANCE_REPORT"
exit 0`)
	f.srv = httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(f.srv.Close)
	f.env = envWith(os.Environ(), "HOME="+f.home, "PATH="+f.bin+string(os.PathListSeparator)+os.Getenv("PATH"),
		"KOGEN_PROVIDER_URL="+f.srv.URL)
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
	f.git("init", "-q")
	f.git("config", "user.name", fixtureName)
	f.git("config", "user.email", fixtureEmail)
	f.git("config", "core.hooksPath", f.hooks)
	f.git("config", "commit.gpgsign", "false")
	return f
}

// envWith is env with each KEY=value of set replacing the variable of the same name.
func envWith(env []string, set ...string) []string {
	out := slices.Clone(env)
	for _, kv := range set {
		k, _, _ := strings.Cut(kv, "=")
		out = slices.DeleteFunc(out, func(e string) bool { return strings.HasPrefix(e, k+"=") })
		out = append(out, kv)
	}
	return out
}

func (f *initFx) program(name, body string) {
	f.t.Helper()
	if err := os.WriteFile(filepath.Join(f.bin, name), []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		f.t.Fatal(err)
	}
}

func (f *initFx) hook(name, body string) {
	f.t.Helper()
	if err := os.WriteFile(filepath.Join(f.hooks, name), []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
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
	var rep reply
	if n <= len(f.script) {
		rep = f.script[n-1]
	}
	f.mu.Unlock()
	if rep == nil {
		w.WriteHeader(400)
		io.WriteString(w, `{"error":{"message":"no scripted reply","code":"invalid_request_error"}}`)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	rep(w, r)
}

// requests are the bodies the loopback provider received, in order.
func (f *initFx) requests() []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.bodies)
}

// git runs a command in the fixture directly (not through the package under test) and fails the
// test unless it succeeds.
func (f *initFx) git(args ...string) string {
	f.t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = f.repo
	cmd.Env = f.env
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		f.t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, stderr.String())
	}
	return string(out)
}

func (f *initFx) write(rel, content string) {
	f.t.Helper()
	path := filepath.Join(f.repo, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		f.t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		f.t.Fatal(err)
	}
}

func (f *initFx) read(rel string) string {
	f.t.Helper()
	b, err := os.ReadFile(filepath.Join(f.repo, rel))
	if err != nil {
		f.t.Fatal(err)
	}
	return string(b)
}

func (f *initFx) exists(rel string) bool {
	_, err := os.Lstat(filepath.Join(f.repo, rel))
	return err == nil
}

func (f *initFx) commitAll(message string) {
	f.t.Helper()
	f.git("add", "-A")
	f.git("commit", "-qm", message)
}

// head is HEAD's commit, or "" before the first commit.
func (f *initFx) head() string {
	cmd := exec.Command("git", "rev-parse", "-q", "--verify", "HEAD")
	cmd.Dir, cmd.Env = f.repo, f.env
	out, _ := cmd.Output()
	return strings.TrimSpace(string(out))
}

// countN is the number of commits on HEAD.
func (f *initFx) countN() int {
	n, err := strconv.Atoi(strings.TrimSpace(f.git("rev-list", "--count", "HEAD")))
	if err != nil {
		f.t.Fatal(err)
	}
	return n
}

func (f *initFx) status() string { return f.git("status", "--porcelain", "--untracked-files=all") }

// session is a session in dir (the repository when ""), as kogen's runEngine makes one: its
// output goes to the returned builders.
func (f *initFx) session(dir string) (*sys.Session, *strings.Builder, *strings.Builder) {
	if dir == "" {
		dir = f.repo
	}
	s := sys.NewWith(f.env, dir)
	out, errs := &strings.Builder{}, &strings.Builder{}
	s.Stdout, s.Stderr = out, errs
	return s, out, errs
}

// input is the InitInput kogen passes: the client and the tools, no Home.
func (f *initFx) input() setup.InitInput {
	return setup.InitInput{Client: provider.NewClient(fixtureVersion), Tools: f.tools}
}

// run calls setup.Init as kogen cli/engine.go does: with the session's context.
func (f *initFx) run(dir string) (exit int, stdout, stderr string, err error) {
	f.t.Helper()
	s, out, errs := f.session(dir)
	exit, err = setup.Init(s.Context(), s, f.input())
	return exit, out.String(), errs.String(), err
}

func (f *initFx) mustRun() (stdout, stderr string) {
	f.t.Helper()
	exit, out, errs, err := f.run("")
	if err != nil || exit != 0 {
		f.t.Fatalf("exit %d, err %v\nstdout %s\nstderr %s", exit, err, out, errs)
	}
	return out, errs
}

// wantSysError checks that Init failed with a *sys.Error of the class, reason and exit status
// and returned that exit status.
func wantSysError(t *testing.T, exit int, err error, class, reason string, want int) *sys.Error {
	t.Helper()
	e, ok := sys.AsError(err)
	if !ok {
		t.Fatalf("exit %d, error %v; want *sys.Error %s/%s", exit, err, class, reason)
	}
	if e.Class != class || e.Reason != reason || e.Exit != want || exit != want {
		t.Fatalf("exit %d, error %s (exit %d); want %s/%s (exit %d)", exit, e.Error(), e.Exit, class, reason, want)
	}
	return e
}

func frame(v any) string {
	b, _ := json.Marshal(v)
	return "data: " + string(b) + "\n\n"
}

func usage() map[string]any {
	return map[string]any{"usage": map[string]any{
		"input_tokens": 100, "input_tokens_details": map[string]any{"cached_tokens": 0},
		"output_tokens": 20, "output_tokens_details": map[string]any{"reasoning_tokens": 5}}}
}

// submit answers with one submit_configuration call.
func submit(args map[string]any) reply {
	b, _ := json.Marshal(args)
	call := map[string]any{"type": "function_call", "id": "fc_1", "call_id": "call_1", "name": "submit_configuration", "arguments": string(b), "status": "completed"}
	return func(w http.ResponseWriter, _ *http.Request) {
		io.WriteString(w, frame(map[string]any{"type": "response.output_item.done", "output_index": 0, "item": call}))
		io.WriteString(w, frame(map[string]any{"type": "response.completed", "response": usage()}))
	}
}

// nothing proposes no command.
func nothing() reply {
	return submit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{}, "protect": []any{}})
}

// text answers with a message and no call.
func text(s string) reply {
	msg := map[string]any{"type": "message", "id": "msg_1", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": s, "annotations": []any{}}}}
	return func(w http.ResponseWriter, _ *http.Request) {
		io.WriteString(w, frame(map[string]any{"type": "response.output_item.done", "output_index": 0, "item": msg}))
		io.WriteString(w, frame(map[string]any{"type": "response.completed", "response": usage()}))
	}
}

// scrub replaces the commit id of a `Commit:` line so the output can be compared.
func scrub(out string) string {
	lines := strings.Split(out, "\n")
	for i, l := range lines {
		if rest, ok := strings.CutPrefix(l, "Commit: "); ok && len(rest) > 8 {
			lines[i] = "Commit: {sha8}" + rest[8:]
		}
	}
	return strings.Join(lines, "\n")
}

func wantLines(t *testing.T, got string, want ...string) {
	t.Helper()
	if g, w := scrub(got), strings.Join(want, "\n")+"\n"; g != w {
		t.Fatalf("stdout:\n%s\nwant:\n%s", g, w)
	}
}

func equal[T comparable](t *testing.T, name string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %v, want %v", name, got, want)
	}
}

func equalList(t *testing.T, name string, got, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("%s = %q, want %q", name, got, want)
	}
}

// committed are the paths HEAD's commit changed, sorted.
func (f *initFx) committed() []string {
	files := strings.Fields(f.git("show", "--name-only", "--format=", "HEAD"))
	slices.Sort(files)
	return files
}

// runSession calls setup.Init on a session the test prepared, as kogen does.
func runSession(f *initFx, s *sys.Session) (int, error) {
	return setup.Init(s.Context(), s, f.input())
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
