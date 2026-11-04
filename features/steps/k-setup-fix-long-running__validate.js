const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const LONG = 'does not exit on its own';

// validateDriver prints the problems setup.Validate returns for the arguments in VALIDATE_ARGS.
const validateDriver = String.raw`package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-setup/setup"
)

func main() {
	var a map[string]any
	if err := json.Unmarshal([]byte(os.Getenv("VALIDATE_ARGS")), &a); err != nil {
		panic(err)
	}
	_, p := setup.Validate(a, setup.InitContext{})
	if p == nil {
		p = []string{}
	}
	if err := json.NewEncoder(os.Stdout).Encode(p); err != nil {
		panic(err)
	}
}
`;

// initDriver runs setup.Init once on a fresh repository whose only file is README.md ("# notes\n"),
// with a loopback model that answers request n with the n-th submit_configuration arguments of the
// JSON array in its first argument. Fake tools on PATH: node (writes the acceptance report), tsc
// (records that it ran, then sleeps 40 s like a watcher) and prettier (logs its arguments, exits 0).
const initDriver = String.raw`package main

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

type result struct {
	Exit        int      ` + '`json:"exit"`' + String.raw`
	Error       string   ` + '`json:"error"`' + String.raw`
	Bodies      []string ` + '`json:"bodies"`' + String.raw`
	Fix         []string ` + '`json:"fix"`' + String.raw`
	WatchRan    bool     ` + '`json:"watchRan"`' + String.raw`
	PrettierLog string   ` + '`json:"prettierLog"`' + String.raw`
	ElapsedMs   int64    ` + '`json:"elapsedMs"`' + String.raw`
	Status      string   ` + '`json:"status"`' + String.raw`
	Stderr      string   ` + '`json:"stderr"`' + String.raw`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "fix-long-running init driver:", err)
		os.Exit(2)
	}
}

func run() error {
	var replies []map[string]any
	if err := json.Unmarshal([]byte(os.Args[1]), &replies); err != nil {
		return fmt.Errorf("replies: %w", err)
	}
	tmp, err := os.MkdirTemp("", "kogen-fix-long-running-")
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
	marker, prettierLog := filepath.Join(base, "watch-ran"), filepath.Join(base, "prettier.log")
	scripts := map[string]string{
		"node":     "#!/bin/sh\n[ -n \"$KOGEN_ACCEPTANCE_REPORT\" ] && echo '{}' > \"$KOGEN_ACCEPTANCE_REPORT\"\nexit 0\n",
		"tsc":      "#!/bin/sh\necho ran > '" + marker + "'\nsleep 40\n",
		"prettier": "#!/bin/sh\necho \"$*\" >> '" + prettierLog + "'\n",
	}
	for name, body := range scripts {
		if err := os.WriteFile(filepath.Join(bin, name), []byte(body), 0o755); err != nil {
			return err
		}
	}
	creds := fmt.Sprintf("{\"client_id\":\"oaiapp_fixture\",\"access_token\":\"fake-access\",\"refresh_token\":\"fake-refresh\",\"expires_at\":%d}", time.Now().Unix()+3600)
	if err := os.WriteFile(filepath.Join(home, ".kogen", "credentials", "chatgpt.json"), []byte(creds), 0o600); err != nil {
		return err
	}
	var mu sync.Mutex
	var bodies []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		n := len(bodies)
		bodies = append(bodies, string(b))
		mu.Unlock()
		if n >= len(replies) {
			w.WriteHeader(400)
			io.WriteString(w, "{\"error\":{\"message\":\"no scripted reply\",\"code\":\"invalid_request_error\"}}")
			return
		}
		args, _ := json.Marshal(replies[n])
		call := map[string]any{"type": "function_call", "id": fmt.Sprintf("fc_%d", n+1), "call_id": fmt.Sprintf("call_%d", n+1), "name": "submit_configuration", "arguments": string(args), "status": "completed"}
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
	started := time.Now()
	exit, initErr := setup.Init(s.Context(), s, setup.InitInput{
		Client: provider.NewClient("dev+12345678"),
		Tools:  verify.Tools{Node: filepath.Join(bin, "node"), Cucumber: cucumber},
	})
	res := result{Exit: exit, ElapsedMs: time.Since(started).Milliseconds(), Fix: []string{}, Stderr: stderr.String()}
	if initErr != nil {
		res.Error = initErr.Error()
	}
	mu.Lock()
	res.Bodies = append([]string{}, bodies...)
	mu.Unlock()
	if _, err := os.Stat(filepath.Join(repo, project.ConfigPath)); err == nil {
		cfg, err := project.LoadConfig(repo)
		if err != nil {
			return fmt.Errorf("loading the written project.yaml: %w", err)
		}
		res.Fix = append(res.Fix, cfg.Fix...)
	}
	_, err = os.Stat(marker)
	res.WatchRan = err == nil
	if b, err := os.ReadFile(prettierLog); err == nil {
		res.PrettierLog = string(b)
	}
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
`;

function observeLong(actual, expected) {
  assert.deepEqual((actual || []).filter(p => p.includes(LONG)), expected, `long-running problems of ${JSON.stringify(actual)}`);
}

function observeAll(actual, expected) {
  assert.deepEqual(actual, expected, `problems ${JSON.stringify(actual)}`);
}

function observeInit(r, e) {
  const why = `init run: exit ${r.exit}, error ${JSON.stringify(r.error)}, ${r.bodies.length} model request(s), fix ${JSON.stringify(r.fix)}, watch stand-in ran ${r.watchRan}, ${r.elapsedMs} ms\nstderr:\n${r.stderr}`;
  const quoted = JSON.stringify(e.correction);
  assert.equal(r.exit, e.exit, why);
  assert.equal(r.error, e.error, why);
  assert.equal(r.bodies.length, e.requests, why);
  assert.ok(!r.bodies[0].includes(quoted), `the first model request already holds ${quoted}\n${why}`);
  assert.ok(r.bodies[1].includes(quoted), `the correction request lacks the tool output ${quoted}\n${why}`);
  assert.deepEqual(r.fix, e.fix, why);
  assert.equal(r.watchRan, e.watchRan, `the refused watch fixer ran\n${why}`);
  assert.equal(r.prettierLog, e.prettierLog, why);
  assert.equal(r.status, e.status, why);
  assert.ok(r.elapsedMs < e.maxElapsedMs, `init took ${r.elapsedMs} ms, limit ${e.maxElapsedMs} ms\n${why}`);
}

function buildDriver(dir, source) {
  const file = path.join(dir, 'main.go');
  fs.writeFileSync(file, source);
  const binary = path.join(dir, 'driver');
  const b = cp.spawnSync('go', ['build', '-o', binary, file], {encoding: 'utf8', timeout: 200000});
  assert.equal(b.status, 0, `go build ${file}: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
  return binary;
}

if (process.argv[2] === '--control') {
  const fixProblem = 'fix command tsc --watch does not exit on its own (watch or server mode); use a command that runs once';
  const expected = {exit: 0, error: '', requests: 2, correction: 'invalid: ' + fixProblem, fix: ['prettier --write .'], watchRan: false, prettierLog: '--write .\n', status: '', maxElapsedMs: 20000};
  // Shaped like an observed run: the second request replays the first call and its tool output.
  const b0 = '{"input":[{"content":"notes","role":"user"}],"tools":[{"name":"submit_configuration"}]}';
  const b1 = '{"input":[{"arguments":"{}","call_id":"call_1","id":"fc_1","name":"submit_configuration","status":"completed","type":"function_call"},{"call_id":"call_1","output":"invalid: ' + fixProblem + '","type":"function_call_output"}]}';
  const good = {exit: 0, error: '', bodies: [b0, b1], fix: ['prettier --write .'], watchRan: false, prettierLog: '--write .\n', elapsedMs: 118, status: '', stderr: ''};
  const bad = [
    x => x.exit = 4,
    x => x.error = 'provider/init_invalid',
    x => x.bodies = [b0],
    x => x.bodies = [b1, b1],
    x => x.bodies[1] = b1.replace('fix command', 'setup command'),
    x => x.bodies[1] = b1.replace('invalid: ', ''),
    x => x.fix = ['tsc --watch'],
    x => x.fix = [],
    x => x.watchRan = true,
    x => x.prettierLog = '',
    x => x.prettierLog = '--write .\n--write .\n',
    x => x.status = ' M README.md\n',
    x => x.elapsedMs = 40158,
  ];
  const problems = [fixProblem];
  const badProblems = [[], ['setup command tsc --watch does not exit on its own (watch or server mode); use a command that runs once'], [fixProblem, fixProblem]];
  try {
    if (process.argv[3] === 'good') {
      observeInit(good, expected);
      observeLong(problems, [fixProblem]);
      observeAll(problems, [fixProblem]);
      console.log('accepted');
    } else {
      for (const change of bad) {
        const copy = JSON.parse(JSON.stringify(good));
        change(copy);
        assert.throws(() => observeInit(copy, expected), undefined, `corruption escaped the init observer: ${change}`);
      }
      for (const p of badProblems) {
        assert.throws(() => observeAll(p, [fixProblem]), undefined, `corruption escaped the problems observer: ${JSON.stringify(p)}`);
        assert.throws(() => observeLong(p, [fixProblem]), undefined, `corruption escaped the long-running observer: ${JSON.stringify(p)}`);
      }
      console.log('rejected');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');

  When('k-setup-fix-long-running: Validate arguments:', {timeout: 240000}, function (text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-long-running-validate-'));
    try {
      const binary = buildDriver(dir, validateDriver);
      const r = cp.spawnSync(binary, [], {env: {...process.env, VALIDATE_ARGS: JSON.stringify(JSON.parse(text))}, encoding: 'utf8', timeout: 10000});
      assert.equal(r.status, 0, `Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.fixLongRunningProblems = JSON.parse(r.stdout);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  });

  Then('k-setup-fix-long-running: all problems equal:', function (text) {
    observeAll(this.fixLongRunningProblems, JSON.parse(text));
  });

  Then('k-setup-fix-long-running: long-running problems equal:', function (text) {
    observeLong(this.fixLongRunningProblems, JSON.parse(text));
  });

  When('k-setup-fix-long-running: init runs with the model replies:', {timeout: 360000}, function (text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-long-running-init-'));
    try {
      const binary = buildDriver(dir, initDriver);
      const r = cp.spawnSync(binary, [JSON.stringify(JSON.parse(text))], {encoding: 'utf8', timeout: 150000});
      assert.equal(r.status, 0, `init driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.fixLongRunningInit = JSON.parse(r.stdout);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  });

  Then('k-setup-fix-long-running: the init outcome is:', function (text) {
    observeInit(this.fixLongRunningInit, JSON.parse(text));
  });

  Then('k-setup-fix-long-running: existing init tests pass', {timeout: 300000}, function () {
    const r = cp.spawnSync('go', ['test', './setup', '-count=1'], {encoding: 'utf8', timeout: 280000});
    assert.equal(r.status, 0, `go test ./setup -count=1 (includes TestInitValidateLongRunning and TestInitCorrectsLongRunningBeforeVerification): ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  });
}
