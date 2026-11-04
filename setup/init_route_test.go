package setup

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
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
			cmd := exec.Command("python3", "-c", script, exe, answer)
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
	exit, _, _, err := f.run("")
	if exit != 4 || err == nil || !strings.Contains(err.Error(), "host/base URL and model") {
		t.Fatalf("exit %d error %v", exit, err)
	}
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

func TestInitRenderKeepsCommandsContainingModelsHeader(t *testing.T) {
	cfg := &project.Config{Setup: []string{"printf 'models:\n'"}}
	text := initRenderConfig(cfg, initRoute{name: "chatgpt"})
	if !strings.Contains(text, "printf") || !strings.Contains(text, "effort: medium") {
		t.Fatalf("truncated configuration: %s", text)
	}
}
