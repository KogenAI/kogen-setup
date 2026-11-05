const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const TEST = 'TestFixSameCommandIntentCapture';
const COMMAND = `go test ./setup -run ^${TEST}$ -count=1`;
function lines(text, start) { return text.split('\n').filter(x => x.startsWith(start)); }
function observe(actual, expected) {
  assert.deepStrictEqual(actual.saved, expected.saved, 'saved .kogen/project.yaml setup/fix/checks');
  assert.deepStrictEqual(lines(actual.out, 'Dropped: '), expected.dropped, 'Dropped: lines on Init stdout');
  assert.deepStrictEqual(lines(actual.out, 'Left out: '), expected.leftOut, 'Left out: lines on Init stdout');
  assert.deepStrictEqual(lines(actual.stderr, 'kogen: running fix-'), expected.fixRuns, 'fix verification progress on Init stderr');
}
const driver = `package setup
import (
 "encoding/json"
 "os"
 "testing"
)
func ${TEST}(t *testing.T) {
 var input struct { Proposal map[string]any; Files map[string]string }
 if err := json.Unmarshal([]byte(os.Getenv("FIX_SAME_COMMAND_INPUT")), &input); err != nil { t.Fatal(err) }
 f := initNewFx(t, true, initSubmit(input.Proposal))
 for p, c := range input.Files { f.write(p, c) }
 f.commitAll("fixture")
 exit, out, stderr, err := f.run("")
 if err != nil || exit != 0 { t.Fatalf("Init exit=%d err=%v stdout=%s stderr=%s", exit, err, out, stderr) }
 cfg := f.config()
 list := func(x []string) []string { if x == nil { return []string{} }; return x }
 checks := []map[string]string{}
 for _, c := range cfg.Checks { checks = append(checks, map[string]string{"name": c.Name, "run": c.Run}) }
 data, err := json.Marshal(map[string]any{"saved": map[string]any{"setup": list(cfg.Setup), "fix": list(cfg.Fix), "checks": checks}, "out": out, "stderr": stderr})
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("FIX_SAME_COMMAND_RESULT"), data, 0o600); err != nil { t.Fatal(err) }
}
`;
if (require.main === module) {
  const cmd = "printf 'fixed\\n' > README.md";
  const expected = {saved:{setup:[],fix:[cmd],checks:[]},dropped:[],leftOut:[`Left out: setup-1 (${cmd}) changed README.md`],fixRuns:[`kogen: running fix-1: ${cmd}`,`kogen: running fix-1 again: ${cmd}`]};
  const good = {saved:{setup:[],fix:[cmd],checks:[]},
    out:`Initialized Kogen in /tmp/repo\nSetup: none\nFix: ${cmd}\nChecks: none passed\nProtect: none\nLeft out: setup-1 (${cmd}) changed README.md\nAcceptance: Cucumber bridge added in features/steps\n`,
    stderr:`kogen: running setup-1: ${cmd}\nkogen: running setup-1 again: ${cmd}\nkogen: checking the acceptance runner\nkogen: running fix-1: ${cmd}\nkogen: running fix-1 again: ${cmd}\n`};
  // Observed on unchanged main: the fix is dropped as a duplicate of the left-out setup command.
  const main = {saved:{setup:[],fix:[],checks:[]},
    out:`Initialized Kogen in /tmp/repo\nSetup: none\nFix: none\nChecks: none passed\nDropped: fix: ${cmd} (already in setup)\nProtect: none\nLeft out: setup-1 (${cmd}) changed README.md\nAcceptance: Cucumber bridge added in features/steps\n`,
    stderr:`kogen: running setup-1: ${cmd}\nkogen: running setup-1 again: ${cmd}\nkogen: checking the acceptance runner\n`};
  if (process.argv[2] === 'good') { observe(good, expected); console.log('accepted'); }
  else {
    const bads = [main];
    for (const mutate of [r=>r.saved.fix.pop(),r=>r.saved.setup.push(cmd),r=>r.out+=`Dropped: fix: ${cmd} (already in setup)\n`,r=>r.out=r.out.replace(/Left out: .*\n/,''),r=>r.stderr='']) {
      const bad = JSON.parse(JSON.stringify(good)); mutate(bad); bads.push(bad);
    }
    for (const bad of bads) {
      let rejected = false; try { observe(bad, expected); } catch (_) { rejected = true; }
      if (!rejected) throw new Error('observer accepted bad control');
    }
    console.log('rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('fix-k-setup-setup-fix-same-command: Init runs with:', {timeout:300000}, function(text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-same-command-'));
    try {
      for (const name of ['go.mod','go.sum','setup']) fs.cpSync(path.join(process.cwd(), name), path.join(dir, name), {recursive:true});
      fs.writeFileSync(path.join(dir, 'setup/fix_same_command_intent_test.go'), driver);
      const result = path.join(dir, 'result.json');
      const run = cp.spawnSync('go', ['test','./setup','-run',`^${TEST}$`,'-count=1'], {cwd:dir, env:{...process.env, FIX_SAME_COMMAND_INPUT:text, FIX_SAME_COMMAND_RESULT:result}, encoding:'utf8', timeout:270000});
      assert.equal(run.status, 0, `${TEST}: ${COMMAND} outcome ${run.status}: ${run.stdout}\n${run.stderr}`);
      assert.ok(fs.existsSync(result), `${TEST} absent/skipped/ran zero times: ${COMMAND} wrote no result: ${run.stdout}`);
      this.fixSameCommand = JSON.parse(fs.readFileSync(result, 'utf8'));
    } finally { fs.rmSync(dir, {recursive:true, force:true}); }
  });
  Then('fix-k-setup-setup-fix-same-command: the results are:', function(text) { observe(this.fixSameCommand, JSON.parse(text)); });
  Then('fix-k-setup-setup-fix-same-command: the existing setup tests pass', {timeout:300000}, function() {
    const r = cp.spawnSync('go', ['test','./setup','-count=1'], {encoding:'utf8', timeout:270000});
    assert.equal(r.status, 0, `go test ./setup -count=1 failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  });
}
