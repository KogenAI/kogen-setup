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
)

func TestClaudeRounds(t *testing.T) {
	// The stand-in is not the pinned size; the origin is never contacted while a runtime is installed.
	t.Setenv(claudecode.SeamEnv, "http://127.0.0.1:1")
	base := t.TempDir()
	home := filepath.Join(base, "home")
	root := filepath.Join(base, "root")
	dir := filepath.Join(base, "task")
	for _, p := range []string{home, root, filepath.Dir(claudecode.RuntimePath(home))} {
		if err := os.MkdirAll(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	fake := `#!/bin/sh
if [ "$1" = --version ]; then echo '2.1.318 (Claude Code)'; exit 0; fi
if [ "$1" = auth ]; then echo '{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty","subscriptionType":"max"}'; exit 0; fi
printf '%s\n' "$@" > "$HOME/args"
cat <&3 > "$HOME/token"
session=''
while [ "$#" -gt 0 ]; do
 case "$1" in --session-id|--resume) session="$2"; shift;; esac
 shift
done
cat > "$HOME/prompt"
printf '{"type":"system","subtype":"init","cwd":"%s","session_id":"%s","mcp_servers":[],"model":"claude-sonnet-5-5","permissionMode":"acceptEdits","apiKeySource":"none","claude_code_version":"2.1.318","uuid":"00000000-0000-4000-8000-000000000001"}\n' "$PWD" "$session"
printf '{"type":"result","subtype":"success","is_error":false,"num_turns":1,"session_id":"%s","result":"done","terminal_reason":"completed","stop_reason":"end_turn","permission_denials":[],"structured_output":{"setup":[],"checks":[]}}\n' "$session"
`
	if err := os.WriteFile(claudecode.RuntimePath(home), []byte(fake), 0700); err != nil {
		t.Fatal(err)
	}
	a := claudecode.New(claudecode.Options{Home: home, Env: []string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + filepath.Join(home, "gitconfig")}, Stderr: io.Discard, Token: "fake-token", HookCommand: []string{"fixture", claudecode.HookSubcommand}})
	s, err := a.Start(context.Background(), executor.Task{Role: executor.RoleShape, Root: root, Home: home, Dir: dir, Model: "claude-sonnet-5-5", Effort: "high", Schema: json.RawMessage(`{"type":"object"}`), Brief: executor.Brief{Stable: "policy", Dynamic: "input"}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, feedback := range []string{"", "invalid: retry"} {
		result, err := s.Round(context.Background(), executor.Input{Feedback: feedback})
		if err != nil {
			t.Fatal(err)
		}
		var got map[string]any
		if err := json.Unmarshal(result.Structured, &got); err != nil || !reflect.DeepEqual(got, map[string]any{"setup": []any{}, "checks": []any{}}) {
			t.Fatalf("structured %s %v", result.Structured, err)
		}
		args, err := os.ReadFile(filepath.Join(home, "args"))
		if err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{"--model\nclaude-sonnet-5-5", "--effort\nhigh", "--json-schema\n{\"type\":\"object\"}"} {
			if !strings.Contains(string(args), want) {
				t.Fatalf("missing %q in arguments %s", want, args)
			}
		}
		token, err := os.ReadFile(filepath.Join(home, "token"))
		if err != nil || string(token) != "fake-token" {
			t.Fatalf("token %q %v", token, err)
		}
		prompt, err := os.ReadFile(filepath.Join(home, "prompt"))
		if err != nil {
			t.Fatal(err)
		}
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
