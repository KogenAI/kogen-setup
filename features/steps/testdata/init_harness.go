// Command init_harness runs setup.Init once on a fresh synthetic repository whose only file is
// README.md ("# notes\n"), with a loopback model that proposes the fix commands and checks given
// as JSON in the first argument ({"fix":[...],"checks":[{"name":...,"run":...}]}). It prints one
// JSON object describing what Init did. Nothing reaches the network.
//
// The acceptance steps of k-setup-fix-command-unverified build and run it; it lives in testdata
// so that ./... does not include it.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-setup/setup"
	"github.com/KogenAI/kogen-verification/verify"
	"kogen-loop/provider"
	"kogen-loop/sys"
)

type check struct {
	Name string `json:"name"`
	Run  string `json:"run"`
}

type spec struct {
	Fix    []string `json:"fix"`
	Checks []check  `json:"checks"`
}

type result struct {
	Exit     int      `json:"exit"`
	Error    string   `json:"error"`
	Stdout   string   `json:"stdout"`
	Stderr   string   `json:"stderr"`
	Config   string   `json:"config"`
	Fix      []string `json:"fix"`
	Checks   []string `json:"checks"`
	Requests int      `json:"requests"`
	FixLog   *string  `json:"fixLog"`
	Readme   string   `json:"readme"`
	Status   string   `json:"status"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "init_harness:", err)
		os.Exit(2)
	}
}

func run() error {
	if len(os.Args) != 2 {
		return fmt.Errorf("usage: init_harness '<spec json>'")
	}
	var sp spec
	if err := json.Unmarshal([]byte(os.Args[1]), &sp); err != nil {
		return fmt.Errorf("spec: %w", err)
	}
	if sp.Fix == nil {
		sp.Fix = []string{}
	}
	if sp.Checks == nil {
		sp.Checks = []check{}
	}
	tmp, err := os.MkdirTemp("", "kogen-init-harness-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	base, err := filepath.EvalSymlinks(tmp)
	if err != nil {
		return err
	}
	home, bin, repo, hooks, cucumber := filepath.Join(base, "home"), filepath.Join(base, "bin"), filepath.Join(base, "repo"), filepath.Join(base, "hooks"), filepath.Join(base, "cucumber")
	for _, d := range []string{home, bin, repo, hooks, cucumber, filepath.Join(home, ".kogen", "credentials")} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return err
		}
	}
	// A node that writes the acceptance report, so the Cucumber bridge check passes.
	if err := os.WriteFile(filepath.Join(bin, "node"), []byte("#!/bin/sh\n[ -n \"$KOGEN_ACCEPTANCE_REPORT\" ] && echo '{}' > \"$KOGEN_ACCEPTANCE_REPORT\"\nexit 0\n"), 0o755); err != nil {
		return err
	}
	creds := fmt.Sprintf(`{"client_id":"oaiapp_fixture","access_token":"fake-access","refresh_token":"fake-refresh","expires_at":%d}`, time.Now().Unix()+3600)
	if err := os.WriteFile(filepath.Join(home, ".kogen", "credentials", "chatgpt.json"), []byte(creds), 0o600); err != nil {
		return err
	}

	args, err := json.Marshal(map[string]any{"setup": []string{}, "fix": sp.Fix, "checks": sp.Checks, "protect": []string{}})
	if err != nil {
		return err
	}
	requests := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		requests++
		if requests > 1 {
			w.WriteHeader(400)
			io.WriteString(w, `{"error":{"message":"no scripted reply","code":"invalid_request_error"}}`)
			return
		}
		call := map[string]any{"type": "function_call", "id": "fc_1", "call_id": "call_1", "name": "submit_configuration", "arguments": string(args), "status": "completed"}
		usage := map[string]any{"usage": map[string]any{
			"input_tokens": 100, "input_tokens_details": map[string]any{"cached_tokens": 0},
			"output_tokens": 20, "output_tokens_details": map[string]any{"reasoning_tokens": 5}}}
		w.Header().Set("Content-Type", "text/event-stream")
		for _, ev := range []any{
			map[string]any{"type": "response.output_item.done", "output_index": 0, "item": call},
			map[string]any{"type": "response.completed", "response": usage},
		} {
			b, _ := json.Marshal(ev)
			io.WriteString(w, "data: "+string(b)+"\n\n")
		}
	}))
	defer srv.Close()

	fixLog := filepath.Join(base, "fix.log")
	var env []string
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") || strings.HasPrefix(k, "KOGEN_") || k == "HOME" || k == "PATH" || k == "EMAIL" || k == "FIX_LOG" {
			continue
		}
		env = append(env, kv)
	}
	env = append(env, "HOME="+home, "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"),
		"KOGEN_PROVIDER_URL="+srv.URL, "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1", "GIT_TERMINAL_PROMPT=0", "FIX_LOG="+fixLog)
	git := func(args ...string) (string, error) {
		cmd := exec.Command("git", args...)
		cmd.Dir, cmd.Env = repo, env
		out, err := cmd.CombinedOutput()
		if err != nil {
			return "", fmt.Errorf("git %s: %v: %s", strings.Join(args, " "), err, out)
		}
		return string(out), nil
	}
	for _, a := range [][]string{
		{"init", "-q"},
		{"config", "user.name", "Fixture"},
		{"config", "user.email", "fixture@example.invalid"},
		{"config", "core.hooksPath", hooks},
		{"config", "commit.gpgsign", "false"},
	} {
		if _, err := git(a...); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("# notes\n"), 0o644); err != nil {
		return err
	}
	if _, err := git("add", "-A"); err != nil {
		return err
	}
	if _, err := git("commit", "-qm", "notes"); err != nil {
		return err
	}

	s := sys.NewWith(env, repo)
	var stdout, stderr strings.Builder
	s.Stdout, s.Stderr = &stdout, &stderr
	exit, initErr := setup.Init(s.Context(), s, setup.InitInput{
		Client: provider.NewClient("dev+12345678"),
		Tools:  verify.Tools{Node: filepath.Join(bin, "node"), Cucumber: cucumber},
	})

	res := result{Exit: exit, Stdout: scrub(stdout.String(), repo), Stderr: stderr.String(), Fix: []string{}, Checks: []string{}, Requests: requests}
	if initErr != nil {
		res.Error = initErr.Error()
	}
	if b, err := os.ReadFile(filepath.Join(repo, project.ConfigPath)); err == nil {
		res.Config = string(b)
		cfg, err := project.LoadConfig(repo)
		if err != nil {
			return fmt.Errorf("loading the written project.yaml: %w", err)
		}
		res.Fix = append(res.Fix, cfg.Fix...)
		for _, c := range cfg.Checks {
			res.Checks = append(res.Checks, c.Name)
		}
	}
	if b, err := os.ReadFile(fixLog); err == nil {
		text := string(b)
		res.FixLog = &text
	}
	b, err := os.ReadFile(filepath.Join(repo, "README.md"))
	if err != nil {
		return err
	}
	res.Readme = string(b)
	if res.Status, err = git("status", "--porcelain", "--untracked-files=all"); err != nil {
		return err
	}
	out, err := json.Marshal(res)
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}

// scrub replaces the fixture repository's path with {repo} and the commit id of a `Commit:`
// line with {sha8}.
func scrub(out, repo string) string {
	lines := strings.Split(strings.ReplaceAll(out, repo, "{repo}"), "\n")
	for i, l := range lines {
		if rest, ok := strings.CutPrefix(l, "Commit: "); ok && len(rest) > 8 {
			lines[i] = "Commit: {sha8}" + rest[8:]
		}
	}
	return strings.Join(lines, "\n")
}
