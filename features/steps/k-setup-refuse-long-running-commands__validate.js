const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
function observe(actual, expected) {
  assert.deepEqual((actual || []).filter(p => p.includes('does not exit on its own')), expected);
}
if (process.argv[2] === '--control') {
  const expected = ['check a (npx jest --watch) does not exit on its own (watch or server mode); use a command that runs once'];
  try { observe(process.argv[3] === 'good' ? expected : [], expected); console.log('accepted'); }
  catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('k-setup-refuse-long-running-commands: Validate arguments:', {timeout:240000}, function(text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'long-running-validate-'));
    try {
      const file = path.join(dir, 'main.go');
      fs.writeFileSync(file, 'package main\nimport("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")\nfunc main(){var a map[string]any;if e:=json.Unmarshal([]byte(os.Getenv("VALIDATE_ARGS")),&a);e!=nil{panic(e)};_,p:=setup.Validate(a,setup.InitContext{});if e:=json.NewEncoder(os.Stdout).Encode(p);e!=nil{panic(e)}}\n');
      const binary = path.join(dir, 'validate');
      const b = cp.spawnSync('go', ['build', '-o', binary, file], {encoding:'utf8',timeout:200000});
      assert.equal(b.status, 0, `go build Validate driver: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
      const r = cp.spawnSync(binary, [], {env:{...process.env,VALIDATE_ARGS:JSON.stringify(JSON.parse(text))},encoding:'utf8',timeout:10000});
      assert.equal(r.status, 0, `Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.longRunningProblems = JSON.parse(r.stdout);
    } finally { fs.rmSync(dir, {recursive:true,force:true}); }
  });
  Then('k-setup-refuse-long-running-commands: long-running problems equal:', function(text) { observe(this.longRunningProblems, JSON.parse(text)); });
  Then('k-setup-refuse-long-running-commands: all problems equal:', function(text) { assert.deepEqual(this.longRunningProblems || [], JSON.parse(text)); });
  Then('k-setup-refuse-long-running-commands: existing init tests pass', {timeout:240000}, function() {
    const r = cp.spawnSync('go', ['test', './setup', '-count=1'], {encoding:'utf8',timeout:220000});
    assert.equal(r.status, 0, `go test ./setup -count=1 (includes TestInitCorrectsRepositoryStateBeforeVerification): ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  });
}
