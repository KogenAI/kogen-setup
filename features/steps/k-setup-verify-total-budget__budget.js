// Acceptance steps of k-setup-verify-total-budget. The When step copies this checkout (without
// .git and node_modules), lowers initVerifyBudget (30 * time.Minute) to the scenario's budget and
// initCommandTimeout (10 * time.Minute) to 10 seconds in the copy's setup/init.go, builds the Go
// harness below inside the copy and runs setup.Init once on a fresh README-only repository with a
// loopback model. Commands see RUN_LOG, a file outside the project copy, so a command that ran
// leaves a line there. Run `node <this file> --control good|bad` to qualify the observer.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const P = 'k-setup-verify-total-budget: ';
const TIMEOUT_RE = /\binitCommandTimeout\s*(?:time\.Duration\s*)?=\s*10\s*\*\s*time\.Minute\b/;
const BUDGET_RE = /\binitVerifyBudget\s*(?:time\.Duration\s*)?=\s*30\s*\*\s*time\.Minute\b/;

const HARNESS = String.raw`
// Command harness runs setup.Init once on a fresh repository whose only file is README.md
// ("# notes\n"), with a loopback model that proposes the setup, checks and fix commands given
// as JSON in the first argument and replies after delayMs. Commands see RUN_LOG, a file
// outside the project copy. It prints one JSON object describing what Init did.
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
	"sync"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-setup/setup"
	"github.com/KogenAI/kogen-verification/verify"
)

type check struct{ Name, Run string }

type spec struct {
	Setup   []string
	Checks  []check
	Fix     []string
	DelayMs int
}

func main() {
	out, err := run()
	if err != nil {
		fmt.Fprintln(os.Stderr, "budget harness:", err)
		os.Exit(2)
	}
	fmt.Println(out)
}

func run() (string, error) {
	if len(os.Args) != 2 {
		return "", fmt.Errorf("usage: harness '<spec json>'")
	}
	var sp spec
	if err := json.Unmarshal([]byte(os.Args[1]), &sp); err != nil {
		return "", fmt.Errorf("spec: %w", err)
	}
	checks := []map[string]string{}
	for _, c := range sp.Checks {
		checks = append(checks, map[string]string{"name": c.Name, "run": c.Run})
	}
	if sp.Setup == nil {
		sp.Setup = []string{}
	}
	if sp.Fix == nil {
		sp.Fix = []string{}
	}
	tmp, err := os.MkdirTemp("", "kogen-budget-harness-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmp)
	base, err := filepath.EvalSymlinks(tmp)
	if err != nil {
		return "", err
	}
	home, bin, repo, hooks, cucumber := filepath.Join(base, "home"), filepath.Join(base, "bin"), filepath.Join(base, "repo"), filepath.Join(base, "hooks"), filepath.Join(base, "cucumber")
	for _, d := range []string{home, bin, repo, hooks, cucumber, filepath.Join(home, ".kogen", "credentials")} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return "", err
		}
	}
	if err := os.WriteFile(filepath.Join(bin, "node"), []byte("#!/bin/sh\n[ -n \"$KOGEN_ACCEPTANCE_REPORT\" ] && echo '{}' > \"$KOGEN_ACCEPTANCE_REPORT\"\nexit 0\n"), 0o755); err != nil {
		return "", err
	}
	creds := fmt.Sprintf("{\"client_id\":\"oaiapp_fixture\",\"access_token\":\"fake-access\",\"refresh_token\":\"fake-refresh\",\"expires_at\":%d}", time.Now().Unix()+3600)
	if err := os.WriteFile(filepath.Join(home, ".kogen", "credentials", "chatgpt.json"), []byte(creds), 0o600); err != nil {
		return "", err
	}
	args, err := json.Marshal(map[string]any{"setup": sp.Setup, "fix": sp.Fix, "checks": checks, "protect": []string{}})
	if err != nil {
		return "", err
	}
	var mu sync.Mutex
	requests := 0
	var replied time.Time
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
		time.Sleep(time.Duration(sp.DelayMs) * time.Millisecond)
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
		mu.Lock()
		replied = time.Now()
		mu.Unlock()
	}))
	defer srv.Close()

	runLog := filepath.Join(base, "runs.log")
	var env []string
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") || strings.HasPrefix(k, "KOGEN_") || k == "HOME" || k == "PATH" || k == "EMAIL" || k == "RUN_LOG" {
			continue
		}
		env = append(env, kv)
	}
	env = append(env, "HOME="+home, "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"),
		"KOGEN_PROVIDER_URL="+srv.URL, "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1", "GIT_TERMINAL_PROMPT=0", "RUN_LOG="+runLog)
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
			return "", err
		}
	}
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("# notes\n"), 0o644); err != nil {
		return "", err
	}
	if _, err := git("add", "-A"); err != nil {
		return "", err
	}
	if _, err := git("commit", "-qm", "notes"); err != nil {
		return "", err
	}

	s := sys.NewWith(env, repo)
	var stdout, stderr strings.Builder
	s.Stdout, s.Stderr = &stdout, &stderr
	started := time.Now()
	exit, initErr := setup.Init(s.Context(), s, setup.InitInput{
		Client: provider.NewClient("dev+12345678"),
		Tools:  verify.Tools{Node: filepath.Join(bin, "node"), Cucumber: cucumber},
	})
	finished := time.Now()

	mu.Lock()
	verifyMs := int64(-1)
	if !replied.IsZero() {
		verifyMs = finished.Sub(replied).Milliseconds()
	}
	res := map[string]any{
		"exit": exit, "error": "", "stdout": strings.ReplaceAll(stdout.String(), repo, "{repo}"), "stderr": stderr.String(),
		"requests": requests, "elapsedMs": finished.Sub(started).Milliseconds(), "verifyMs": verifyMs,
		"config": "", "setup": []string{}, "checks": []string{}, "fix": []string{}, "runLog": nil, "alive": []int{},
	}
	mu.Unlock()
	if initErr != nil {
		res["error"] = initErr.Error()
	}
	alive := []int{}
	for _, g := range s.Groups() {
		if syscall.Kill(-g, 0) != syscall.ESRCH {
			alive = append(alive, g)
		}
	}
	res["alive"] = alive
	if b, err := os.ReadFile(filepath.Join(repo, project.ConfigPath)); err == nil {
		res["config"] = string(b)
		cfg, err := project.LoadConfig(repo)
		if err != nil {
			return "", fmt.Errorf("loading the written project.yaml: %w", err)
		}
		names := []string{}
		for _, c := range cfg.Checks {
			names = append(names, c.Name)
		}
		res["setup"], res["checks"], res["fix"] = append([]string{}, cfg.Setup...), names, append([]string{}, cfg.Fix...)
	}
	if b, err := os.ReadFile(runLog); err == nil {
		res["runLog"] = string(b)
	}
	b, err := os.ReadFile(filepath.Join(repo, "README.md"))
	if err != nil {
		return "", err
	}
	res["readme"] = string(b)
	if res["status"], err = git("status", "--porcelain", "--untracked-files=all"); err != nil {
		return "", err
	}
	out, err := json.Marshal(res)
	return string(out), err
}
`;

// outcome checks the harness result against the expectation of a Then step.
function outcome(r, e) {
  assert.equal(r.exit, 0, `init exit ${r.exit}, error ${JSON.stringify(r.error)}\nstderr:\n${r.stderr}`);
  assert.equal(r.error, '');
  assert.equal(r.requests, 1, 'model requests');
  assert.deepEqual(r.alive, [], 'process groups still alive after init');
  assert.equal(r.status, '', 'git status after init');
  assert.equal(r.readme, '# notes\n');
  assert.deepEqual(r.setup, e.setup, 'setup in the written .kogen/project.yaml');
  assert.deepEqual(r.checks, e.checks, 'check names in the written .kogen/project.yaml');
  assert.deepEqual(r.fix, e.fix, 'fix in the written .kogen/project.yaml');
  assert.equal(r.runLog, e.runLog, `commands that ran (RUN_LOG)\nstderr:\n${r.stderr}`);
  assert.ok(r.verifyMs >= e.minVerifyMs && r.verifyMs < e.maxVerifyMs,
    `init took ${r.verifyMs}ms after the model replied; expected at least ${e.minVerifyMs}ms and under ${e.maxVerifyMs}ms`);
  assert.ok(r.elapsedMs < e.maxElapsedMs, `init took ${r.elapsedMs}ms in total; expected under ${e.maxElapsedMs}ms`);
  if (e.minElapsedMs !== undefined) assert.ok(r.elapsedMs >= e.minElapsedMs, `init took ${r.elapsedMs}ms in total; expected at least ${e.minElapsedMs}ms`);
}

// stdoutIs compares Init's stdout exactly, with the commit id replaced by {sha}.
function stdoutIs(r, text) {
  assert.equal(r.stdout.replace(/^Commit: [0-9a-f]+ /m, 'Commit: {sha} '), text + '\n');
}

function initWithBudget(budget, proposal) {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-budget-'));
  try {
    fs.cpSync(root, dir, {recursive: true, filter: p => !path.relative(root, p).split(path.sep).some(x => x === '.git' || x === 'node_modules')});
    const file = path.join(dir, 'setup', 'init.go');
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(TIMEOUT_RE.test(source), 'setup/init.go: missing the initCommandTimeout = 10 * time.Minute test seam');
    assert.ok(BUDGET_RE.test(source), 'setup/init.go: missing the initVerifyBudget = 30 * time.Minute test seam');
    fs.writeFileSync(file, source.replace(TIMEOUT_RE, 'initCommandTimeout = 10 * time.Second').replace(BUDGET_RE, `initVerifyBudget = ${budget} * time.Second`));
    fs.mkdirSync(path.join(dir, 'kvtb_harness'));
    fs.writeFileSync(path.join(dir, 'kvtb_harness', 'main.go'), HARNESS);
    const bin = path.join(dir, 'kvtb-harness-bin');
    const built = cp.spawnSync('go', ['build', '-o', bin, './kvtb_harness'], {cwd: dir, timeout: 240000, encoding: 'utf8'});
    assert.equal(built.status, 0, `go build ./kvtb_harness in the copy failed:\n${built.stdout}${built.stderr}${built.error || ''}`);
    const ran = cp.spawnSync(bin, [proposal], {cwd: dir, timeout: 90000, encoding: 'utf8'});
    assert.equal(ran.status, 0, `the budget harness failed (status ${ran.status}, ${ran.error || 'no spawn error'}):\n${ran.stderr}`);
    return JSON.parse(ran.stdout);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

if (process.argv[2] === '--control') {
  const log = '"$RUN_LOG"';
  const base = {exit: 0, error: '', requests: 1, alive: [], status: '', readme: '# notes\n', stderr: ''};
  const spent = s => `${s} not verified: init time budget of 2s used up`;
  const cases = [
    {
      // The 2 s budget case, as the requested behavior produces it.
      result: {...base, setup: [`echo setup >> ${log}`], checks: [], fix: [], runLog: 'setup\nsetup\n', verifyMs: 2152, elapsedMs: 2171,
        stdout: `Initialized Kogen in {repo}\nSetup: echo setup >> ${log}\nChecks: none passed\nLeft out: slow (sleep 30) timed out: init time budget of 2s used up; ${spent(`later-a (echo later-a >> ${log})`)}; ${spent(`later-b (echo later-b >> ${log})`)}; ${spent(`fix-1 (echo fix >> ${log})`)}\nAcceptance: Cucumber bridge added in features/steps\nCommit: 594ba418 Add Kogen configuration\nNext: add the project's checks to commands.checks in .kogen/project.yaml\n`},
      expect: {setup: [`echo setup >> ${log}`], checks: [], fix: [], runLog: 'setup\nsetup\n', minVerifyMs: 1900, maxVerifyMs: 6000, maxElapsedMs: 6000},
      stdout: `Initialized Kogen in {repo}\nSetup: echo setup >> ${log}\nChecks: none passed\nLeft out: slow (sleep 30) timed out: init time budget of 2s used up; ${spent(`later-a (echo later-a >> ${log})`)}; ${spent(`later-b (echo later-b >> ${log})`)}; ${spent(`fix-1 (echo fix >> ${log})`)}\nAcceptance: Cucumber bridge added in features/steps\nCommit: {sha} Add Kogen configuration\nNext: add the project's checks to commands.checks in .kogen/project.yaml`,
      bad: [x => x.stdout = x.stdout.replace('timed out: init time budget of 2s used up', 'timed out after 10s'),
        x => x.stdout = x.stdout.replace(`; ${spent(`later-b (echo later-b >> ${log})`)}`, ''),
        x => x.stdout = x.stdout.replaceAll('2s used up', '30m used up'),
        x => x.runLog += 'later-a\nlater-a\n'],
    },
    {
      // The 60 s budget case: the real harness result on the unchanged tree with a 10 s per-command limit.
      result: {...base, setup: [`echo setup >> ${log}`], checks: ['later-a', 'later-b'], fix: [`echo fix >> ${log}`], runLog: 'setup\nsetup\nlater-a\nlater-a\nlater-b\nlater-b\nfix\n', verifyMs: 10874, elapsedMs: 10888,
        stdout: `Initialized Kogen in {repo}\nSetup: echo setup >> ${log}\nChecks: later-a, later-b\nLeft out: slow (sleep 30) timed out after 10s\nAcceptance: Cucumber bridge added in features/steps\nCommit: 594ba418 Add Kogen configuration\n`},
      expect: {setup: [`echo setup >> ${log}`], checks: ['later-a', 'later-b'], fix: [`echo fix >> ${log}`], runLog: 'setup\nsetup\nlater-a\nlater-a\nlater-b\nlater-b\nfix\n', minVerifyMs: 9900, maxVerifyMs: 30000, maxElapsedMs: 30000},
      stdout: `Initialized Kogen in {repo}\nSetup: echo setup >> ${log}\nChecks: later-a, later-b\nLeft out: slow (sleep 30) timed out after 10s\nAcceptance: Cucumber bridge added in features/steps\nCommit: {sha} Add Kogen configuration`,
      bad: [x => x.stdout = x.stdout.replace('timed out after 10s', 'timed out: init time budget of 1m used up'),
        x => x.verifyMs = 2100, x => x.runLog = 'setup\nsetup\n'],
    },
    {
      // The 2 s budget case behind a model that replies after 2.5 s.
      result: {...base, setup: [`echo setup >> ${log}`], checks: [], fix: [], runLog: 'setup\nsetup\n', verifyMs: 2148, elapsedMs: 4668, stdout: ''},
      expect: {setup: [`echo setup >> ${log}`], checks: [], fix: [], runLog: 'setup\nsetup\n', minVerifyMs: 1900, maxVerifyMs: 6000, minElapsedMs: 2500, maxElapsedMs: 8500},
      stdout: null,
      bad: [x => x.elapsedMs = 1200, x => x.setup = []],
    },
  ];
  const observe = (r, c) => { outcome(r, c.expect); if (c.stdout !== null) stdoutIs(r, c.stdout); };
  const common = [x => x.exit = 1, x => x.error = 'boom', x => x.requests = 2, x => x.alive = [4242], x => x.status = ' M README.md\n',
    x => x.readme = 'changed\n', x => x.setup = [...x.setup, 'sleep 30'], x => x.checks = ['slow', ...x.checks], x => x.fix = [...x.fix, 'sleep 30'],
    x => x.runLog = null, x => x.verifyMs += 30000, x => x.verifyMs = 1000, x => x.elapsedMs += 30000];
  const stdoutBad = [x => x.stdout += 'extra\n', x => x.stdout = x.stdout.replace('Checks: ', 'Checks: slow, '), x => x.stdout = x.stdout.replace(/timed out[^;\n]*/, 'failed with status 143')];
  try {
    if (process.argv[3] === 'good') {
      for (const c of cases) observe(c.result, c);
      console.log('accepted');
    } else {
      for (const c of cases) {
        for (const change of [...common, ...(c.stdout === null ? [] : stdoutBad), ...c.bad]) {
          const copy = JSON.parse(JSON.stringify(c.result));
          change(copy);
          assert.notDeepEqual(copy, c.result, `corruption ${change} did not change the result`);
          let rejected = false;
          try { observe(copy, c); } catch (_) { rejected = true; }
          assert.ok(rejected, `corruption ${change} escaped the observer`);
        }
      }
      console.log('rejected');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(P + 'init verifies with a {int} second budget and the model proposes:', {timeout: 360000}, function (budget, proposal) {
    this.budgetResult = initWithBudget(budget, proposal);
  });
  Then(P + 'the outcome is:', function (text) { outcome(this.budgetResult, JSON.parse(text)); });
  Then(P + 'stdout is:', function (text) { stdoutIs(this.budgetResult, text); });
}
