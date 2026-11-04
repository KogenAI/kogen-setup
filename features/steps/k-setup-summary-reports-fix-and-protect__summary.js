const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const TEST = 'TestSummaryFixProtectIntentCapture';
// The capture runs the real Init through setup's own test fixture: a scripted provider that
// answers with the proposal, fake programs on PATH and a synthetic repository holding
// README.md and Makefile.
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
	if err := json.Unmarshal([]byte(os.Getenv("SUMMARY_ARGS")), &args); err != nil {
		t.Fatal(err)
	}
	f := initNewFx(t, true, initSubmit(args))
	f.program("gofmt", "echo gofmt-ran >&2\\nexit "+os.Getenv("SUMMARY_GOFMT_STATUS"))
	f.write("README.md", "# fixture\\n")
	f.write("Makefile", "check:\\n\\ttest -f Makefile\\n")
	f.commitAll("fixture")
	exit, out, errs, err := f.run("")
	result := map[string]any{"exit": exit, "error": "", "stdout": strings.ReplaceAll(initScrub(out), f.repo, "{repo}"), "stderr": errs, "fix": nil, "protect": nil}
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
		result["fix"], result["protect"] = append([]string{}, cfg.Fix...), append([]string{}, cfg.Protect...)
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("SUMMARY_RESULT"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;
function observeStdout(r, want) {
 assert.equal(r.error, '', `Init error: ${r.error}\n${r.stderr}`);
 assert.equal(r.exit, 0, `Init exit ${r.exit}\n${r.stderr}`);
 assert.equal(r.stdout, want + '\n', `Init stdout:\n${r.stdout}\nwant:\n${want}\n`);
}
function observeConfig(r, want) {
 assert.deepEqual({fix: r.fix, protect: r.protect}, want, `committed .kogen/project.yaml fix/protect`);
}
if (process.argv[2] === '--control') {
 const want = 'Initialized Kogen in {repo}\nSetup: none\nFix: gofmt -w .\nChecks: ok\nProtect: Makefile\nAcceptance: Cucumber bridge added in features/steps\nCommit: {sha8} Add Kogen configuration';
 const r = {exit:0, error:'', stderr:'', stdout:want+'\n', fix:['gofmt -w .'], protect:['Makefile']};
 if (process.argv[3] === 'bad') r.stdout = 'Initialized Kogen in {repo}\nSetup: none\nChecks: ok\nAcceptance: Cucumber bridge added in features/steps\nCommit: {sha8} Add Kogen configuration\n';
 try { observeStdout(r, want); observeConfig(r, {fix:['gofmt -w .'], protect:['Makefile']}); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
 const {When, Then, AfterAll} = require('@cucumber/cucumber');
 let work = null;
 function binary() {
  if (work) return work;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-fix-protect-'));
  const src = path.join(dir, 'src');
  fs.cpSync(process.cwd(), src, {recursive:true, filter:p => !path.relative(process.cwd(), p).split(path.sep).some(x => x === '.git' || x === 'node_modules')});
  fs.writeFileSync(path.join(src, 'setup', 'zz_summary_fix_protect_intent_test.go'), driver);
  const bin = path.join(dir, 'setup.test');
  const r = cp.spawnSync('go', ['test', '-c', '-o', bin, './setup'], {cwd:src, encoding:'utf8', timeout:240000});
  assert.equal(r.status, 0, `go test -c -o ${bin} ./setup (for ${TEST}) failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  work = {dir, src, bin};
  return work;
 }
 AfterAll(function() { if (work) fs.rmSync(work.dir, {recursive:true, force:true}); });
 When('k-setup-summary-reports-fix-and-protect: Init runs with gofmt exiting {int} and this proposal:', {timeout:300000}, function(status, text) {
  const w = binary();
  const result = path.join(w.dir, `result-${process.hrtime.bigint()}.json`);
  const args = ['-test.run', `^${TEST}$`, '-test.count=1', '-test.v'];
  const r = cp.spawnSync(w.bin, args, {cwd:path.join(w.src, 'setup'), env:{...process.env, SUMMARY_ARGS:text, SUMMARY_GOFMT_STATUS:String(status), SUMMARY_RESULT:result}, encoding:'utf8', timeout:240000});
  const ran = `${w.bin} ${args.join(' ')}`;
  assert.equal(r.status, 0, `${TEST} via ${ran} failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes(`--- PASS: ${TEST} `), `${TEST} did not run via ${ran}: ${r.stdout}\n${r.stderr}`);
  assert.ok(fs.existsSync(result), `${TEST} via ${ran} wrote no result: ${r.stdout}\n${r.stderr}`);
  this.summary = JSON.parse(fs.readFileSync(result, 'utf8'));
 });
 Then('k-setup-summary-reports-fix-and-protect: Init exits 0 and prints:', function(text) { observeStdout(this.summary, text); });
 Then('k-setup-summary-reports-fix-and-protect: the committed configuration has:', function(text) { observeConfig(this.summary, JSON.parse(text)); });
}
