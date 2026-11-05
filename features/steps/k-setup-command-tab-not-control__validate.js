const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

// The acceptance driver: "validate" prints what setup.Validate returns for the proposal in
// TAB_PROPOSAL; "init" runs setup.Init once on a synthetic repository (README.md only) whose
// loopback model proposes it, then reads the written .kogen/project.yaml back with
// project.LoadConfig. Nothing reaches the network.
const source = String.raw`package main

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
	"sync"
	"time"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-setup/setup"
	"github.com/KogenAI/kogen-verification/verify"
)

func main() {
	var proposal map[string]any
	if err := json.Unmarshal([]byte(os.Getenv("TAB_PROPOSAL")), &proposal); err != nil {
		fail(fmt.Errorf("TAB_PROPOSAL: %w", err))
	}
	var out map[string]any
	var err error
	switch strings.Join(os.Args[1:], " ") {
	case "validate":
		p, problems := setup.Validate(proposal, setup.InitContext{})
		out = map[string]any{"problems": strs(problems), "setup": strs(p.Setup), "fix": strs(p.Fix), "checks": checks(p.Checks)}
	case "init":
		out, err = initOnce(proposal)
	default:
		err = fmt.Errorf("usage: driver validate|init")
	}
	if err != nil {
		fail(err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "tab driver:", err)
	os.Exit(2)
}

func strs(ss []string) []string {
	if ss == nil {
		return []string{}
	}
	return ss
}

func checks(cs []project.Check) []map[string]string {
	out := []map[string]string{}
	for _, c := range cs {
		out = append(out, map[string]string{"name": c.Name, "run": c.Run})
	}
	return out
}

func initOnce(proposal map[string]any) (map[string]any, error) {
	for _, key := range []string{"setup", "fix", "checks", "protect"} {
		if _, ok := proposal[key]; !ok {
			proposal[key] = []any{}
		}
	}
	tmp, err := os.MkdirTemp("", "kogen-tab-init-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	base, err := filepath.EvalSymlinks(tmp)
	if err != nil {
		return nil, err
	}
	home, bin, repo, hooks, cucumber := filepath.Join(base, "home"), filepath.Join(base, "bin"), filepath.Join(base, "repo"), filepath.Join(base, "hooks"), filepath.Join(base, "cucumber")
	for _, d := range []string{home, bin, repo, hooks, cucumber, filepath.Join(home, ".kogen", "credentials")} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return nil, err
		}
	}
	// A node that writes the acceptance report, so the Cucumber bridge check passes.
	if err := os.WriteFile(filepath.Join(bin, "node"), []byte("#!/bin/sh\n[ -n \"$KOGEN_ACCEPTANCE_REPORT\" ] && echo '{}' > \"$KOGEN_ACCEPTANCE_REPORT\"\nexit 0\n"), 0o755); err != nil {
		return nil, err
	}
	creds := fmt.Sprintf("{\"client_id\":\"oaiapp_fixture\",\"access_token\":\"fake-access\",\"refresh_token\":\"fake-refresh\",\"expires_at\":%d}", time.Now().Unix()+3600)
	if err := os.WriteFile(filepath.Join(home, ".kogen", "credentials", "chatgpt.json"), []byte(creds), 0o600); err != nil {
		return nil, err
	}
	args, err := json.Marshal(proposal)
	if err != nil {
		return nil, err
	}
	var mu sync.Mutex
	requests := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		mu.Lock()
		requests++
		n := requests
		mu.Unlock()
		if n > 1 {
			w.WriteHeader(400)
			io.WriteString(w, "{\"error\":{\"message\":\"no scripted reply\",\"code\":\"invalid_request_error\"}}")
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
	var env []string
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") || strings.HasPrefix(k, "KOGEN_") || k == "HOME" || k == "PATH" || k == "EMAIL" {
			continue
		}
		env = append(env, kv)
	}
	env = append(env, "HOME="+home, "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"),
		"KOGEN_PROVIDER_URL="+srv.URL, "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1", "GIT_TERMINAL_PROMPT=0")
	git := func(args ...string) error {
		cmd := exec.Command("git", args...)
		cmd.Dir, cmd.Env = repo, env
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git %s: %v: %s", strings.Join(args, " "), err, out)
		}
		return nil
	}
	for _, a := range [][]string{{"init", "-q"}, {"config", "user.name", "Fixture"}, {"config", "user.email", "fixture@example.invalid"}, {"config", "core.hooksPath", hooks}, {"config", "commit.gpgsign", "false"}} {
		if err := git(a...); err != nil {
			return nil, err
		}
	}
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("# notes\n"), 0o644); err != nil {
		return nil, err
	}
	if err := git("add", "-A"); err != nil {
		return nil, err
	}
	if err := git("commit", "-qm", "notes"); err != nil {
		return nil, err
	}
	s := sys.NewWith(env, repo)
	var stdout, stderr strings.Builder
	s.Stdout, s.Stderr = &stdout, &stderr
	exit, initErr := setup.Init(s.Context(), s, setup.InitInput{Client: provider.NewClient("dev+12345678"), Tools: verify.Tools{Node: filepath.Join(bin, "node"), Cucumber: cucumber}, Home: home})
	mu.Lock()
	n := requests
	mu.Unlock()
	out := map[string]any{"exit": exit, "error": "", "requests": n, "stdout": stdout.String(), "stderr": stderr.String(), "config": nil, "setup": []string{}, "fix": []string{}, "checks": []map[string]string{}}
	if initErr != nil {
		out["error"] = initErr.Error()
	}
	if b, err := os.ReadFile(filepath.Join(repo, project.ConfigPath)); err == nil {
		out["config"] = string(b)
		cfg, err := project.LoadConfig(repo)
		if err != nil {
			return nil, fmt.Errorf("reading the written %s back: %w", project.ConfigPath, err)
		}
		out["setup"], out["fix"], out["checks"] = strs(cfg.Setup), strs(cfg.Fix), checks(cfg.Checks)
	}
	return out, nil
}
`;

function observe(actual, expected, context) { assert.deepEqual(actual, expected, context); }

if (require.main === module) {
  if (process.argv[2] === '--control') {
    try { observe(JSON.parse(process.argv[3]), JSON.parse(process.argv[4])); console.log('accepted'); }
    catch (_) { console.log('rejected'); process.exitCode = 1; }
  } else {
    console.log('usage: --control <actual json> <expected json>');
    process.exitCode = 2;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const prefix = 'k-setup-command-tab-not-control: ';
  let binary;
  function driver() {
    if (binary) return binary;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-not-control-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true,force:true}));
    const file = path.join(dir, 'main.go');
    fs.writeFileSync(file, source);
    const out = path.join(dir, 'driver');
    const b = cp.spawnSync('go', ['build', '-o', out, file], {encoding:'utf8',timeout:200000});
    assert.equal(b.status, 0, `go build of the acceptance driver from ${process.cwd()}: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
    binary = out;
    return binary;
  }
  function run(mode, proposal) {
    const r = cp.spawnSync(driver(), [mode], {env:{...process.env,TAB_PROPOSAL:JSON.stringify(proposal)},encoding:'utf8',timeout:120000});
    assert.equal(r.status, 0, `acceptance driver ${mode} ${JSON.stringify(proposal)}: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(r.stdout);
  }
  When(prefix + 'Validate the proposal:', {timeout:240000}, function(text) {
    this.tabValidate = run('validate', JSON.parse(text));
  });
  Then(prefix + 'the problems equal:', function(text) {
    observe(this.tabValidate.problems, JSON.parse(text), 'Validate returned ' + JSON.stringify(this.tabValidate));
  });
  Then(prefix + 'the accepted proposal equals:', function(text) {
    const {setup, fix, checks} = this.tabValidate;
    observe({setup, fix, checks}, JSON.parse(text), 'Validate returned ' + JSON.stringify(this.tabValidate));
  });
  When(prefix + 'Init runs once with the proposal:', {timeout:240000}, function(text) {
    this.tabInit = run('init', JSON.parse(text));
  });
  Then(prefix + 'the Init outcome equals:', function(text) {
    const {exit, error, requests} = this.tabInit;
    observe({exit, error, requests}, JSON.parse(text), 'Init returned ' + JSON.stringify(this.tabInit));
  });
  Then(prefix + 'the Init output includes the line:', function(text) {
    const line = JSON.parse(text);
    assert.ok(this.tabInit.stdout.split('\n').includes(line), `Init stdout has no line ${JSON.stringify(line)}: ${JSON.stringify(this.tabInit)}`);
  });
  Then(prefix + 'the written configuration includes the line:', function(text) {
    const line = JSON.parse(text);
    const config = this.tabInit.config;
    assert.ok(typeof config === 'string' && config.split('\n').includes(line), `written .kogen/project.yaml has no line ${JSON.stringify(line)}: ${JSON.stringify(config)}`);
  });
  Then(prefix + 'the configuration read back equals:', function(text) {
    const {setup, fix, checks} = this.tabInit;
    observe({setup, fix, checks}, JSON.parse(text), 'project.LoadConfig after Init returned ' + JSON.stringify(this.tabInit));
  });
}
