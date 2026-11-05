const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const TEST = 'TestProtectLeftOutReasonIntentCapture';
// The capture runs the real Init through setup's own test fixture: a scripted provider that
// answers with the proposal, a fake npm on PATH whose `npm test` and `npm run test` both run the
// package's one test script and exit with the given status, and a synthetic repository holding
// a package.json with a real test script.
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
	if err := json.Unmarshal([]byte(os.Getenv("PROTECT_LEFT_OUT_ARGS")), &args); err != nil {
		t.Fatal(err)
	}
	f := initNewFx(t, true, initSubmit(args))
	f.program("npm", "case \\"$*\\" in\\n  test|\\"run test\\") echo '1 tests'; exit "+os.Getenv("PROTECT_LEFT_OUT_NPM_STATUS")+";;\\nesac\\nexit 3")
	f.write("package.json", \`{"scripts":{"test":"node --test"}}\`)
	f.commitAll("fixture")
	exit, out, errs, err := f.run("")
	result := map[string]any{"exit": exit, "error": "", "stdout": strings.ReplaceAll(initScrub(out), f.repo, "{repo}"), "stderr": errs, "protect": nil}
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
		result["protect"] = append([]string{}, cfg.Protect...)
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("PROTECT_LEFT_OUT_RESULT"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;
function observeStdout(r, want) {
 assert.equal(r.error, '', `Init error: ${r.error}\n${r.stderr}`);
 assert.equal(r.exit, 0, `Init exit ${r.exit}\n${r.stderr}`);
 assert.equal(r.stdout, want + '\n', `Init stdout:\n${r.stdout}\nwant:\n${want}\n`);
}
function observeProtect(r, want) {
 assert.deepEqual(r.protect, want, `committed .kogen/project.yaml protect`);
}
if (process.argv[2] === '--control') {
 const left = 'Left out: test (npm run test) failed with status 1; t (npm test) failed with status 1; ';
 const want = 'Initialized Kogen in {repo}\nSetup: none\nFix: none\nChecks: u\nProtect: none\n' + left + 'protect package.json: npm package and dependency metadata is editable; verification definitions or embedded settings can be protected as a whole\nAcceptance: Cucumber bridge added in features/steps\nCommit: {sha8} Add Kogen configuration';
 const r = {exit:0, error:'', stderr:'', stdout:want+'\n', protect:[]};
 if (process.argv[3] === 'bad') r.stdout = 'Initialized Kogen in {repo}\nSetup: none\nFix: none\nChecks: u\nProtect: none\n' + left + 'package.json\nAcceptance: Cucumber bridge added in features/steps\nCommit: {sha8} Add Kogen configuration\n';
 try { observeStdout(r, want); observeProtect(r, []); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
 const {When, Then, AfterAll} = require('@cucumber/cucumber');
 let work = null;
 function binary() {
  if (work) return work;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'protect-left-out-reason-'));
  const src = path.join(dir, 'src');
  fs.cpSync(process.cwd(), src, {recursive:true, filter:p => !path.relative(process.cwd(), p).split(path.sep).some(x => x === '.git' || x === 'node_modules')});
  fs.writeFileSync(path.join(src, 'setup', 'zz_protect_left_out_reason_intent_test.go'), driver);
  const bin = path.join(dir, 'setup.test');
  const r = cp.spawnSync('go', ['test', '-c', '-o', bin, './setup'], {cwd:src, encoding:'utf8', timeout:240000});
  assert.equal(r.status, 0, `go test -c -o ${bin} ./setup (for ${TEST}) failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  work = {dir, src, bin};
  return work;
 }
 AfterAll(function() { if (work) fs.rmSync(work.dir, {recursive:true, force:true}); });
 When('k-setup-protect-left-out-reason: Init runs with the test script exiting {int} and this proposal:', {timeout:300000}, function(status, text) {
  const w = binary();
  const result = path.join(w.dir, `result-${process.hrtime.bigint()}.json`);
  const args = ['-test.run', `^${TEST}$`, '-test.count=1', '-test.v'];
  const r = cp.spawnSync(w.bin, args, {cwd:path.join(w.src, 'setup'), env:{...process.env, PROTECT_LEFT_OUT_ARGS:text, PROTECT_LEFT_OUT_NPM_STATUS:String(status), PROTECT_LEFT_OUT_RESULT:result}, encoding:'utf8', timeout:240000});
  const ran = `${w.bin} ${args.join(' ')}`;
  assert.equal(r.status, 0, `${TEST} via ${ran} failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes(`--- PASS: ${TEST} `), `${TEST} did not run via ${ran}: ${r.stdout}\n${r.stderr}`);
  assert.ok(fs.existsSync(result), `${TEST} via ${ran} wrote no result: ${r.stdout}\n${r.stderr}`);
  this.protectLeftOut = JSON.parse(fs.readFileSync(result, 'utf8'));
 });
 Then('k-setup-protect-left-out-reason: Init exits 0 and prints:', function(text) { observeStdout(this.protectLeftOut, text); });
 Then('k-setup-protect-left-out-reason: the committed protect list is:', function(text) { observeProtect(this.protectLeftOut, JSON.parse(text)); });
}
