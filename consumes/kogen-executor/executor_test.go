package consumes_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/agent"
	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
	"github.com/KogenAI/kogen-executor/testkit/clauderuntime"
)

func TestClaudeRounds(t *testing.T) {
	base := t.TempDir()
	home := filepath.Join(base, "home")
	root := filepath.Join(base, "root")
	dir := filepath.Join(base, "task")
	for _, p := range []string{home, root} {
		if err := os.MkdirAll(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	checkout, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	resultLine := clauderuntime.ResultLine(map[string]any{"structured_output": map[string]any{"setup": []any{}, "checks": []any{}}})
	fixture := clauderuntime.Install(t, clauderuntime.Options{
		Home: home, State: filepath.Join(base, "state"), Checkout: checkout,
		Rounds: [][]string{{resultLine}, {resultLine}},
	})
	a := claudecode.New(claudecode.Options{Home: home, Env: []string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + filepath.Join(home, "gitconfig")}, Stderr: io.Discard, Token: "fake-token", HookCommand: []string{"fixture", claudecode.HookSubcommand}})
	s, err := a.Start(context.Background(), executor.Task{Role: executor.RoleShape, Root: root, Home: home, Dir: dir, Model: "claude-sonnet-5-5", Effort: "high", Schema: json.RawMessage(`{"type":"object"}`), Brief: executor.Brief{Stable: "policy", Dynamic: "input"}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for i, feedback := range []string{"", "invalid: retry"} {
		result, err := s.Round(context.Background(), executor.Input{Feedback: feedback})
		if err != nil {
			t.Fatal(err)
		}
		var got map[string]any
		if err := json.Unmarshal(result.Structured, &got); err != nil || !reflect.DeepEqual(got, map[string]any{"setup": []any{}, "checks": []any{}}) {
			t.Fatalf("structured %s %v", result.Structured, err)
		}
		args := fixture.Args(t, i+1)
		for _, want := range []string{"--model\nclaude-sonnet-5-5", "--effort\nhigh", "--json-schema\n{\"type\":\"object\"}"} {
			if !strings.Contains(strings.Join(args, "\n"), want) {
				t.Fatalf("missing %q in arguments %v", want, args)
			}
		}
		if token := fixture.Token(t, i+1); token != "fake-token" {
			t.Fatalf("token %q", token)
		}
		prompt := fixture.Prompt(t, i+1)
		if feedback != "" && !strings.Contains(string(prompt), feedback) {
			t.Fatalf("feedback missing: %s", prompt)
		}
		if feedback == "" && (!strings.Contains(string(prompt), "policy") || !strings.Contains(string(prompt), "input")) {
			t.Fatalf("brief missing: %s", prompt)
		}
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestHookAndToolDefinitions(t *testing.T) {
	root := t.TempDir()
	policy := filepath.Join(root, "policy.json")
	log := filepath.Join(root, "hook.jsonl")
	b, _ := json.Marshal(map[string]any{"root": root, "log": log, "nonce": "fixture", "read_only": true})
	if err := os.WriteFile(policy, b, 0600); err != nil {
		t.Fatal(err)
	}
	input, _ := json.Marshal(map[string]any{"cwd": root, "tool_name": "Write", "tool_use_id": "1", "tool_input": map[string]any{"file_path": filepath.Join(root, "file")}})
	var out, errs bytes.Buffer
	if code := claudecode.RunHook([]string{"pretool", "--policy", policy}, bytes.NewReader(input), &out, &errs); code != 0 || !strings.Contains(out.String(), "deny") {
		t.Fatalf("hook %d %q %q", code, out.String(), errs.String())
	}
	defs := []map[string]any{{"name": "submit_configuration"}}
	got := agent.AsAny(defs)
	if len(got) != 1 || got[0].(map[string]any)["name"] != "submit_configuration" {
		t.Fatalf("definitions %#v", got)
	}
}
