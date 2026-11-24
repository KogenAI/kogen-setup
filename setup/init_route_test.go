package setup

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestInitRouteChild(t *testing.T) {
	repo := os.Getenv("INIT_ROUTE_TEST_REPO")
	if repo == "" {
		return
	}
	s := sys.NewWith(os.Environ(), repo)
	s.Stdout, s.Stderr = os.Stdout, os.Stderr
	code, err := Init(context.Background(), s, InitInput{Client: provider.NewClient("test")})
	if err != nil {
		os.Exit(code)
	}
	os.Exit(0)
}

func TestInitSelectedRoutePersistsModelsAndTracksThem(t *testing.T) {
	openCode, ok := provider.Lookup("opencode-go")
	if !ok || len(openCode.Models) == 0 {
		t.Fatal("OpenCode Go has no catalog model")
	}
	tests := []struct {
		name        string
		role        project.Role
		buildEffort string
	}{
		{"claude-code", project.Role{Executor: project.ExecutorClaudeCode, Model: "claude-sonnet-5-5", Effort: "high"}, "medium"},
		{"opencode-go", project.Role{Provider: "opencode-go", Model: openCode.Models[0], Effort: "high"}, "default"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := initNewFx(t, false)
			creds := filepath.Join(f.home, ".kogen", "credentials")
			if err := os.MkdirAll(creds, 0700); err != nil {
				t.Fatal(err)
			}
			key := fmt.Sprintf(`{"provider":%q,"api_key":"fixture"}`, tc.name)
			if err := os.WriteFile(filepath.Join(creds, tc.name+".json"), []byte(key), 0600); err != nil {
				t.Fatal(err)
			}
			f.write("README.md", "fixture\n")
			f.commitAll("first")

			var calls atomic.Int32
			if tc.name == "claude-code" {
				installInitClaudeStub(t, f.home)
			} else {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					w.Header().Set("Content-Type", "application/json")
					fmt.Fprintf(w, `{"id":"chatcmpl-fixture","choices":[{"message":{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"submit_configuration","arguments":"{\"setup\":[],\"fix\":[],\"checks\":[],\"protect\":[]}"}}]},"finish_reason":"tool_calls"}],"model":%q,"usage":{"prompt_tokens":1,"completion_tokens":1}}`, tc.role.Model)
				}))
				t.Cleanup(server.Close)
				for i, value := range f.env {
					if strings.HasPrefix(value, "KOGEN_PROVIDER_URL=") {
						f.env[i] = "KOGEN_PROVIDER_URL=" + server.URL
					}
				}
			}
			f.env = append(f.env, "KOGEN_INIT_ROUTE="+tc.name)
			if code, out, diag, err := f.run(""); code != 0 || err != nil {
				t.Fatalf("Init exit %d: %v\nstdout: %s\nstderr: %s", code, err, out, diag)
			}
			if tc.name == "opencode-go" && calls.Load() != 1 {
				t.Fatalf("OpenCode Go provider got %d discovery requests, want 1", calls.Load())
			}

			lineup, err := project.LoadModels(f.repo)
			if err != nil {
				t.Fatal(err)
			}
			for _, name := range project.ModelRoles {
				want := tc.role
				if name == "build" {
					want.Effort = tc.buildEffort
				}
				if got := lineup.Roles[name]; got != want {
					t.Errorf("models.%s = %#v, want %#v", name, got, want)
				}
			}
			if committed := f.git("show", "HEAD:"+project.ModelsPath); committed != f.read(project.ModelsPath) {
				t.Fatal("working and committed models.yaml differ")
			}
		})
	}
}

func installInitClaudeStub(t *testing.T, home string) {
	t.Helper()
	size, ok := claudecode.RuntimeSize()
	if !ok {
		t.Skip("Claude Code runtime is unavailable on this platform")
	}
	// An isolated HOME holds a sparse stand-in of the pinned size. If runtime
	// installation is attempted anyway, the loopback seam prevents a download.
	t.Setenv(claudecode.SeamEnv, "http://127.0.0.1:1")
	p := claudecode.RuntimePath(home)
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		t.Fatal(err)
	}
	stub := `#!/bin/sh
case "$1" in
  --version) echo '` + claudecode.Version + ` (Claude Code)'; exit 0;;
  auth) echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0;;
  -p) ;;
  *) exit 64;;
esac
while [ "$#" -gt 0 ]; do
  if [ "$1" = --session-id ]; then sid="$2"; break; fi
  shift
done
test -n "$sid" || exit 64
printf '{"type":"system","subtype":"init","cwd":"%s","session_id":"%s","model":"claude-sonnet-5-5","permissionMode":"acceptEdits","apiKeySource":"none","mcp_servers":[],"claude_code_version":"` + claudecode.Version + `","uuid":"00000000-0000-4000-8000-000000000001"}\n' "$PWD" "$sid"
printf '{"type":"result","subtype":"success","is_error":false,"num_turns":1,"session_id":"%s","result":"fixture","terminal_reason":"completed","stop_reason":"end_turn","permission_denials":[],"structured_output":{"setup":[],"fix":[],"checks":[],"protect":[]}}\n' "$sid"
`
	if err := os.WriteFile(p, []byte(stub), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(p, size); err != nil {
		t.Fatal(err)
	}
}

// initRouteTestPython prefers the system interpreter: a version-manager shim
// named python3 can fail on its own configuration before the script starts.
func initRouteTestPython() string {
	if st, err := os.Stat("/usr/bin/python3"); err == nil && st.Mode().IsRegular() {
		return "/usr/bin/python3"
	}
	return "python3"
}

func TestInitChooserRejectsInvalidAndEOF(t *testing.T) {
	for _, answer := range []string{"\n", "9\n", "eof"} {
		t.Run(answer, func(t *testing.T) {
			f := initNewFx(t, true)
			f.write("README.md", "fixture\n")
			f.commitAll("first")
			head := f.head()
			dir := filepath.Join(f.home, ".kogen", "credentials")
			if err := os.WriteFile(filepath.Join(dir, "claude-code.json"), []byte(`{"provider":"claude-code","api_key":"fixture"}`), 0600); err != nil {
				t.Fatal(err)
			}
			script := `import os,pty,select,sys
pid,fd=pty.fork()
if pid==0: os.execv(sys.argv[1],[sys.argv[1],'-test.run=^TestInitRouteChild$'])
data=b''
while b'claude-code' not in data:
 r,_,_=select.select([fd],[],[],10)
 if not r: os.kill(pid,9); raise RuntimeError('chooser timeout')
 try: chunk=os.read(fd,4096)
 except OSError: break
 if not chunk: break
 data+=chunk
os.write(fd,b'\x04' if sys.argv[2]=='eof' else sys.argv[2].encode())
while True:
 try:
  if not os.read(fd,4096): break
 except OSError: break
_,status=os.waitpid(pid,0)
sys.exit(os.waitstatus_to_exitcode(status))`
			exe, err := os.Executable()
			if err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command(initRouteTestPython(), "-c", script, exe, answer)
			cmd.Env = append(os.Environ(), f.env...)
			cmd.Env = append(cmd.Env, "INIT_ROUTE_TEST_REPO="+f.repo)
			err = cmd.Run()
			if e, ok := err.(*exec.ExitError); !ok || e.ExitCode() != 4 {
				t.Fatalf("exit: %v", err)
			}
			if f.exists(".kogen") || len(f.requests()) != 0 || f.head() != head {
				t.Fatal("invalid choice changed repository or sent request")
			}
		})
	}
}

func TestInitCompatibleKeyDoesNotSupplyRoute(t *testing.T) {
	f := initNewFx(t, false)
	f.write("README.md", "fixture\n")
	f.commitAll("first")
	head := f.head()
	dir := filepath.Join(f.home, ".kogen", "credentials")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "openai-compatible.json"), []byte(`{"provider":"openai-compatible","api_key":"fixture"}`), 0600); err != nil {
		t.Fatal(err)
	}
	f.wantError("provider", "login", 4)
	if f.exists(".kogen") || len(f.requests()) != 0 || f.head() != head {
		t.Fatal("incomplete route changed repository or sent request")
	}
}

// An explicit InitInput.Home must also be used by the selected native provider request.
func TestInitNativeUsesExplicitHome(t *testing.T) {
	f := initNewFx(t, true, initNothing())
	f.write("README.md", "fixture\n")
	f.commitAll("first")
	s := sys.NewWith(append(f.env, "HOME="+t.TempDir()), f.repo)
	s.Stdout, s.Stderr = f.out, f.err
	exit, err := Init(context.Background(), s, InitInput{Client: provider.NewClient("test"), Tools: f.tools, Home: f.home})
	if exit != 0 || err != nil || len(f.requests()) != 1 {
		t.Fatalf("exit %d error %v requests %d", exit, err, len(f.requests()))
	}
}

func TestInitClaudeUsageLine(t *testing.T) {
	parallel(t)
	n := func(v int) *int { return &v }
	round := func(in, cached, out int) executor.Usage {
		return executor.Usage{Input: n(in), Cached: n(cached), Output: n(out)}
	}
	for name, tc := range map[string]struct {
		rounds []executor.Usage
		want   string
	}{
		"one complete round":  {[]executor.Usage{round(100, 40, 10)}, "input=100 cached=40 output=10 reasoning=0"},
		"two complete rounds": {[]executor.Usage{round(100, 40, 10), round(50, 50, 5)}, "input=150 cached=90 output=15 reasoning=0"},
		"reported reasoning":  {[]executor.Usage{{Input: n(10), Cached: n(0), Output: n(5), Reasoning: n(3)}, round(1, 1, 1)}, "input=11 cached=1 output=6 reasoning=3"},
		"no usage":            {[]executor.Usage{{}}, "usage=unknown"},
		"complete then none":  {[]executor.Usage{round(100, 40, 10), {}}, "usage=unknown"},
		"nil cached":          {[]executor.Usage{{Input: n(100), Output: n(10)}}, "usage=unknown"},
	} {
		if got := initClaudeUsageLine(tc.rounds); got != tc.want {
			t.Errorf("%s: %q, want %q", name, got, tc.want)
		}
	}
}
