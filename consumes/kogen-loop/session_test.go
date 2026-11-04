package consumes_test

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-loop/tools"
)

func TestSessionExecutionAndInterrupt(t *testing.T) {
	home := t.TempDir()
	t.Setenv("TMPDIR", home)
	tmp := sys.TmpPath("kogen-init")
	if filepath.Dir(tmp) != home || !strings.HasPrefix(filepath.Base(tmp), "kogen-init-") {
		t.Fatalf("temporary path %q", tmp)
	}
	if err := os.Mkdir(tmp, 0700); err != nil {
		t.Fatal(err)
	}
	env := []string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + filepath.Join(home, "gitconfig")}
	s := sys.NewWith(env, home)
	var out, errout bytes.Buffer
	s.Stdout = &out
	s.Stderr = &errout
	if s.Cwd != home || s.Getenv("HOME") != home {
		t.Fatal("session environment")
	}
	s.Puts("result")
	s.Progress("progress")
	if out.String() != "result\n" || errout.String() != "progress\n" {
		t.Fatalf("output %q %q", out.String(), errout.String())
	}
	r, err := s.Run(`printf '%s' "$FIXTURE"; exit 7`, home, sys.Options{Env: map[string]string{"FIXTURE": "value"}, KillGroupOnExit: true})
	if err != nil || r.Status != 7 || r.Output != "value" || r.TimedOut {
		t.Fatalf("run %+v %v", r, err)
	}
	timed, err := s.Run(`while :; do :; done`, home, sys.Options{Timeout: 20 * time.Millisecond, KillGroupOnExit: true})
	if err != nil || !timed.TimedOut {
		t.Fatalf("timeout %+v %v", timed, err)
	}
	failure := sys.Fail("provider", "init_invalid", "bad", 4)
	e, ok := sys.AsError(failure)
	if !ok || e.Exit != 4 || e.Error() != "provider/init_invalid: bad" {
		t.Fatalf("failure %+v", e)
	}
	if !s.Interrupt("SIGINT") {
		t.Fatal("interrupt not recorded")
	}
	var interrupted *sys.Interrupted
	if !errors.As(s.Err(), &interrupted) || interrupted.ExitCode() != 130 || s.Context().Err() == nil {
		t.Fatalf("interrupt %v", s.Err())
	}
}

func TestRoutesAndDefinitions(t *testing.T) {
	home := t.TempDir()
	if provider.RequireLogin(home, []provider.Role{{Provider: "chatgpt"}}) == nil {
		t.Fatal("empty home is signed in")
	}
	if _, ok := provider.ClaudeCodeToken(home); ok {
		t.Fatal("unexpected token")
	}
	found := false
	for _, p := range provider.Catalog() {
		if p.Name == "chatgpt" {
			found = len(p.Models) == 0
		}
	}
	if !found {
		t.Fatal("missing chatgpt route")
	}
	dir := filepath.Join(home, ".kogen", "credentials")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "claude-code.json"), []byte(`{"provider":"claude-code","api_key":"fixture"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if token, ok := provider.ClaudeCodeToken(home); !ok || token != "fixture" {
		t.Fatalf("token %q %v", token, ok)
	}
	if err := os.WriteFile(filepath.Join(dir, "openai-compatible.json"), []byte(`{"api_key":"fixture"}`), 0600); err != nil {
		t.Fatal(err)
	}
	foundStatus := false
	for _, line := range provider.Status(home) {
		if strings.HasPrefix(line, "openai-compatible:") {
			foundStatus = true
		}
	}
	if !foundStatus {
		t.Fatal("saved compatible key must be identifiable in status")
	}
	d, ok := tools.Definition("read_file")
	if !ok || d["name"] != "read_file" {
		t.Fatalf("definition %#v %v", d, ok)
	}
	if _, ok := tools.Definition("submit_configuration"); ok {
		t.Fatal("setup submission is not generic")
	}
	if u := (provider.Usage{Input: 1, Output: 2}).Line(); !strings.Contains(u, "input=1") || !strings.Contains(u, "output=2") {
		t.Fatalf("usage %s", u)
	}
}
