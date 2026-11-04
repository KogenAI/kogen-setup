// Acceptance steps of k-setup-command-references-unset-variable. A Go driver (built once per
// process from DRIVER) calls setup.Validate with an explicit InitContext.Env, or runs setup.Init
// on a fresh synthetic repository with a loopback model that proposes the same checks on every
// request. Run directly with `good` or `bad`, the file checks its own observer against the real
// driver on an existing refusal (a check that leaves the project folder).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const P = 'k-setup-command-references-unset-variable: ';
const DRIVER = String.raw`package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-setup/setup"
	"github.com/KogenAI/kogen-verification/verify"
)

type input struct {
	Mode    string           "json:\"mode\""
	Role    string           "json:\"role\""
	Command string           "json:\"command\""
	Checks  []map[string]any "json:\"checks\""
	Env     []string         "json:\"env\""
	// RequireEnv makes validate fail when setup.InitContext has no Env []string field.
	RequireEnv bool "json:\"requireEnv\""
}

func main() {
	var in input
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		panic(err)
	}
	var out any
	var err error
	switch in.Mode {
	case "validate":
		out, err = validate(in)
	case "init":
		out, err = initRun(in)
	default:
		err = fmt.Errorf("unknown mode %q", in.Mode)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver:", err)
		os.Exit(2)
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}

func validate(in input) (any, error) {
	args := map[string]any{}
	if in.Role == "check" {
		args["checks"] = []any{map[string]any{"name": "t", "run": in.Command}}
	} else {
		args[in.Role] = []any{in.Command}
	}
	var ctx setup.InitContext
	if f := reflect.ValueOf(&ctx).Elem().FieldByName("Env"); f.IsValid() && f.Type() == reflect.TypeOf([]string(nil)) {
		f.Set(reflect.ValueOf(append([]string{}, in.Env...)))
	} else if in.RequireEnv {
		return nil, fmt.Errorf("setup.InitContext has no Env []string field to hold the init environment")
	}
	proposal, problems := setup.Validate(args, ctx)
	if problems == nil {
		problems = []string{}
	}
	return map[string]any{"problems": problems, "empty": len(proposal.Setup)+len(proposal.Fix)+len(proposal.Checks)+len(proposal.Protect) == 0}, nil
}

func initRun(in input) (any, error) {
	tmp, err := os.MkdirTemp("", "kogen-unset-variable-")
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
	if err := os.WriteFile(filepath.Join(bin, "node"), []byte("#!/bin/sh\n[ -n \"$KOGEN_ACCEPTANCE_REPORT\" ] && echo '{}' > \"$KOGEN_ACCEPTANCE_REPORT\"\nexit 0\n"), 0o755); err != nil {
		return nil, err
	}
	creds := fmt.Sprintf("{\"client_id\":\"oaiapp_fixture\",\"access_token\":\"fake-access\",\"refresh_token\":\"fake-refresh\",\"expires_at\":%d}", time.Now().Unix()+3600)
	if err := os.WriteFile(filepath.Join(home, ".kogen", "credentials", "chatgpt.json"), []byte(creds), 0o600); err != nil {
		return nil, err
	}
	checks := in.Checks
	if checks == nil {
		checks = []map[string]any{}
	}
	args, err := json.Marshal(map[string]any{"setup": []string{}, "fix": []string{}, "checks": checks, "protect": []string{}})
	if err != nil {
		return nil, err
	}
	var mu sync.Mutex
	var bodies [][]byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, body)
		mu.Unlock()
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
		if strings.HasPrefix(k, "GIT_") || strings.HasPrefix(k, "KOGEN_") || k == "HOME" || k == "PATH" || k == "SET_ONE" || k == "UNSET_ONE" {
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
	for _, a := range [][]string{
		{"init", "-q"},
		{"config", "user.name", "Fixture"},
		{"config", "user.email", "fixture@example.invalid"},
		{"config", "core.hooksPath", hooks},
		{"config", "commit.gpgsign", "false"},
	} {
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

	s := sys.NewWith(append(env, in.Env...), repo)
	var stdout, stderr strings.Builder
	s.Stdout, s.Stderr = &stdout, &stderr
	exit, initErr := setup.Init(s.Context(), s, setup.InitInput{
		Client: provider.NewClient("dev+12345678"),
		Tools:  verify.Tools{Node: filepath.Join(bin, "node"), Cucumber: cucumber},
	})
	res := map[string]any{"exit": exit, "requests": len(bodies), "correction": "", "checks": nil}
	if initErr != nil {
		res["error"] = initErr.Error()
	}
	if len(bodies) > 1 {
		var req struct {
			Input []map[string]any "json:\"input\""
		}
		if err := json.Unmarshal(bodies[len(bodies)-1], &req); err != nil {
			return nil, fmt.Errorf("second request: %w", err)
		}
		for _, item := range req.Input {
			if item["type"] == "function_call_output" {
				if text, ok := item["output"].(string); ok {
					res["correction"] = text
				} else {
					b, _ := json.Marshal(item["output"])
					res["correction"] = string(b)
				}
			}
		}
	}
	if _, err := os.Stat(filepath.Join(repo, project.ConfigPath)); err == nil {
		cfg, err := project.LoadConfig(repo)
		if err != nil {
			return nil, fmt.Errorf("loading the written project.yaml: %w", err)
		}
		names := []string{}
		for _, c := range cfg.Checks {
			names = append(names, c.Name)
		}
		res["checks"] = names
	}
	res["stderr"] = stderr.String()
	return res, nil
}
`;

let driverBin = null;
function driver(input) {
  if (driverBin === null) {
    const src = fs.mkdtempSync(path.join(process.cwd(), '.unset-variable-driver-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unset-variable-driver-'));
    process.on('exit', () => fs.rmSync(outDir, {recursive: true, force: true}));
    try {
      fs.writeFileSync(path.join(src, 'main.go'), DRIVER);
      const bin = path.join(outDir, 'driver');
      const b = cp.spawnSync('go', ['build', '-o', bin, './' + path.basename(src)], {cwd: process.cwd(), encoding: 'utf8', timeout: 200000});
      assert.equal(b.status, 0, `go build of the Validate/Init driver failed (status ${b.status}): ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
      driverBin = bin;
    } finally {
      fs.rmSync(src, {recursive: true, force: true});
    }
  }
  const r = cp.spawnSync(driverBin, [], {input: JSON.stringify(input), encoding: 'utf8', timeout: 200000});
  assert.equal(r.status, 0, `driver ${JSON.stringify(input)} failed (status ${r.status}): ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function observeProblems(result, expected) {
  assert.deepEqual(result.problems, expected, `Validate problems: ${JSON.stringify(result.problems)}`);
  assert.equal(result.empty, expected.length > 0, `Validate proposal empty=${result.empty} with problems ${JSON.stringify(result.problems)}; a refused proposal is empty, an accepted one is not`);
}

function observeInit(result, expected) {
  const {stderr, error, ...actual} = result;
  assert.deepEqual(actual, expected, `Init result (error ${JSON.stringify(error || null)}):\n${JSON.stringify(actual)}\nstderr:\n${stderr}`);
}

if (require.main === module) {
  // Observer controls on the real driver, independent of the new rule: an existing refusal.
  const mode = process.argv[2];
  const env = ['SET_ONE=1'];
  const outside = 'check t (cd .. && make test) reaches outside the project folder; use a path inside the project';
  try {
    const v = driver({mode: 'validate', role: 'check', command: 'cd .. && make test', env});
    const i = driver({mode: 'init', checks: [{name: 't', run: 'cd .. && make test'}], env});
    if (mode === 'good') {
      observeProblems(v, [outside]);
      observeInit(i, {exit: 4, requests: 2, correction: 'invalid: ' + outside, checks: null});
    } else {
      let rejected = 0;
      try { observeProblems(v, []); } catch (_) { rejected++; }
      try { observeInit(i, {exit: 0, requests: 1, correction: '', checks: ['t']}); } catch (_) { rejected++; }
      if (rejected === 2) process.exitCode = 1;
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(P + 'run existing setup tests requiring these passing tests', {timeout: 300000}, function (text) {
    const names = JSON.parse(text);
    const args = ['test', '-json', './setup', '-run', '^(' + names.join('|') + ')$', '-count=1'];
    const command = 'go ' + args.join(' ');
    const r = cp.spawnSync('go', args, {encoding: 'utf8', timeout: 280000, maxBuffer: 64 * 1024 * 1024});
    const events = (r.stdout || '').trim().split('\n').filter(Boolean).map((s) => { try { return JSON.parse(s); } catch (_) { return {}; } });
    const problems = names.filter((name) => !events.some((e) => e.Test === name && e.Action === 'pass')).map((name) => {
      const ev = events.filter((e) => e.Test === name && ['fail', 'skip'].includes(e.Action));
      return `${name}: ${command} (exit ${r.status}): ${ev.length ? ev[0].Action : 'absent or ran zero times'}; no pass event`;
    });
    this.unsetResult = {problems, empty: problems.length > 0};
  });
  When(P + 'Validate this proposal', {timeout: 300000}, function (text) {
    const input = JSON.parse(text);
    this.unsetResult = driver({mode: 'validate', role: input.role, command: input.command, env: input.env, requireEnv: true});
  });
  Then(P + 'problems equal', function (text) {
    observeProblems(this.unsetResult, JSON.parse(text));
  });
  When(P + 'run init with this proposal', {timeout: 300000}, function (text) {
    const input = JSON.parse(text);
    this.unsetInit = driver({mode: 'init', checks: input.checks, env: input.env});
  });
  Then(P + 'the init result equals', function (text) {
    observeInit(this.unsetInit, JSON.parse(text));
  });
}
