const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const TEST = 'TestOutputTailRedactsCredentialsIntentCapture';
// The capture runs the real Init through setup's own test fixture: a scripted provider that
// answers with the proposal and a synthetic repository holding only README.md. It reports
// Init's exit, error, stdout (repository path and commit scrubbed), stderr and the checks in
// the committed .kogen/project.yaml.
const driver = `package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

func ${TEST}(t *testing.T) {
	var args map[string]any
	if err := json.Unmarshal([]byte(os.Getenv("OUTPUT_TAIL_ARGS")), &args); err != nil {
		t.Fatal(err)
	}
	f := initNewFx(t, true, initSubmit(args))
	f.write("README.md", "x\\n")
	f.commitAll("fixture")
	exit, out, errs, err := f.run("")
	result := map[string]any{"exit": exit, "error": "", "stdout": strings.ReplaceAll(initScrub(out), f.repo, "{repo}"), "stderr": errs, "checks": nil}
	if err != nil {
		result["error"] = err.Error()
	} else {
		committed := t.TempDir()
		if err := os.MkdirAll(filepath.Join(committed, ".kogen"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(committed, project.ConfigPath), []byte(f.git("show", "HEAD:"+project.ConfigPath)), 0o644); err != nil {
			t.Fatal(err)
		}
		cfg, err := project.LoadConfig(committed)
		if err != nil {
			t.Fatal(err)
		}
		checks := []map[string]string{}
		for _, c := range cfg.Checks {
			checks = append(checks, map[string]string{"name": c.Name, "run": c.Run})
		}
		result["checks"] = checks
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("OUTPUT_TAIL_RESULT"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;
function observeRun(r) {
 assert.equal(r.error, '', `Init error: ${r.error}\n${r.stderr}`);
 assert.equal(r.exit, 0, `Init exit ${r.exit}\n${r.stderr}`);
}
function progressLine(proposal, name) {
 const check = (proposal.checks || []).find(c => c.name === name);
 assert.ok(check, `no check ${name} in the proposal`);
 return `kogen: checking ${name}: ${check.run}`;
}
function observeTail(r, progress, want) {
 observeRun(r);
 const lines = r.stderr.split('\n');
 const start = lines.indexOf(progress);
 assert.notEqual(start, -1, `missing progress line ${JSON.stringify(progress)} in stderr ${JSON.stringify(r.stderr)}`);
 const got = [];
 for (let i = start + 1; i < lines.length && lines[i].startsWith('  | '); i++) got.push(lines[i]);
 assert.deepEqual(got, want.map(x => '  | ' + x), `output lines under ${JSON.stringify(progress)}: got ${JSON.stringify(got)}`);
}
function observeAbsent(r, secret) {
 observeRun(r);
 assert.ok(!r.stderr.includes(secret), `stderr contains ${JSON.stringify(secret)}: ${JSON.stringify(r.stderr)}`);
}
function observeStdout(r, want) {
 observeRun(r);
 assert.equal(r.stdout, want + '\n', `Init stdout:\n${r.stdout}\nwant:\n${want}\n`);
}
function observeStdoutLine(r, want) {
 observeRun(r);
 assert.ok(r.stdout.split('\n').includes(want), `stdout has no line ${JSON.stringify(want)}:\n${r.stdout}`);
}
function observeChecks(r, want) {
 observeRun(r);
 assert.deepEqual(r.checks, want, `committed .kogen/project.yaml checks: ${JSON.stringify(r.checks)}`);
}
if (process.argv[2] === '--control') {
 // Known-bad is the stderr Init printed on the unchanged tree for the bad check.
 const proposal = {setup:[], fix:[], checks:[{name:'bad', run:'echo API_TOK""EN=abcd1234""secretvalue; echo plain line; exit 2'}, {name:'good', run:'test -f README.md'}], protect:[]};
 const progress = progressLine(proposal, 'bad');
 const stdout = `Initialized Kogen in {repo}\nSetup: none\nFix: none\nChecks: good\nProtect: none\nLeft out: bad (${proposal.checks[0].run}) failed with status 2\nAcceptance: Cucumber bridge added in features/steps\nCommit: {sha8} Add Kogen configuration`;
 const tail = process.argv[3] === 'bad' ? '  | API_TOKEN=abcd1234secretvalue\n  | plain line\n' : '  | API_TOKEN=***\n  | plain line\n';
 const r = {exit:0, error:'', stdout:stdout + '\n', checks:[{name:'good', run:'test -f README.md'}],
  stderr:`kogen: selected chatgpt for discovery and shape, build and review\nkogen: detecting the project's commands\nkogen: asking gpt-6.1-sol/high about the project's commands\nkogen: init gpt-6.1-sol/high input=100 cached=0 output=20 reasoning=5 wall_ms=4\nkogen: checking the acceptance runner\n${progress}\n${tail}kogen: checking good: test -f README.md\nkogen: running good again: test -f README.md\n`};
 try {
  observeTail(r, progress, ['API_TOKEN=***', 'plain line']);
  observeAbsent(r, 'abcd1234secretvalue');
  observeStdout(r, stdout);
  observeChecks(r, [{name:'good', run:'test -f README.md'}]);
  console.log('accepted');
 } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
 const {When, Then, AfterAll} = require('@cucumber/cucumber');
 let work = null;
 function binary() {
  if (work) return work;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-tail-redacts-'));
  const src = path.join(dir, 'src');
  fs.cpSync(process.cwd(), src, {recursive:true, filter:p => !path.relative(process.cwd(), p).split(path.sep).some(x => x === '.git' || x === 'node_modules')});
  fs.writeFileSync(path.join(src, 'setup', 'zz_output_tail_redacts_intent_test.go'), driver);
  const bin = path.join(dir, 'setup.test');
  const r = cp.spawnSync('go', ['test', '-c', '-o', bin, './setup'], {cwd:src, encoding:'utf8', timeout:240000});
  assert.equal(r.status, 0, `go test -c -o ${bin} ./setup (for ${TEST}) failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  work = {dir, src, bin};
  return work;
 }
 AfterAll(function() { if (work) fs.rmSync(work.dir, {recursive:true, force:true}); });
 When('k-setup-output-tail-redacts-credentials: Init runs on a repository holding only README.md with this proposal:', {timeout:300000}, function(text) {
  const w = binary();
  this.redactsProposal = JSON.parse(text);
  const result = path.join(w.dir, `result-${process.hrtime.bigint()}.json`);
  const args = ['-test.run', `^${TEST}$`, '-test.count=1', '-test.v'];
  const r = cp.spawnSync(w.bin, args, {cwd:path.join(w.src, 'setup'), env:{...process.env, OUTPUT_TAIL_ARGS:text, OUTPUT_TAIL_RESULT:result}, encoding:'utf8', timeout:240000});
  const ran = `${w.bin} ${args.join(' ')}`;
  assert.equal(r.status, 0, `${TEST} via ${ran} failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes(`--- PASS: ${TEST} `), `${TEST} did not run via ${ran}: ${r.stdout}\n${r.stderr}`);
  assert.ok(fs.existsSync(result), `${TEST} via ${ran} wrote no result: ${r.stdout}\n${r.stderr}`);
  this.redactsResult = JSON.parse(fs.readFileSync(result, 'utf8'));
 });
 Then('k-setup-output-tail-redacts-credentials: stderr shows these output lines under check {string}:', function(name, text) {
  observeTail(this.redactsResult, progressLine(this.redactsProposal, name), JSON.parse(text));
 });
 Then('k-setup-output-tail-redacts-credentials: stderr does not contain {string}', function(secret) { observeAbsent(this.redactsResult, secret); });
 Then('k-setup-output-tail-redacts-credentials: stdout is:', function(text) { observeStdout(this.redactsResult, text); });
 Then('k-setup-output-tail-redacts-credentials: stdout has the line:', function(text) { observeStdoutLine(this.redactsResult, text); });
 Then('k-setup-output-tail-redacts-credentials: the committed checks are:', function(text) { observeChecks(this.redactsResult, JSON.parse(text)); });
}
