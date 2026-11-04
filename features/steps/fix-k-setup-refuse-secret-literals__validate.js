const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
if (process.argv[2] === '--control') {
  try { observe(JSON.parse(process.argv[3]), JSON.parse(process.argv[4])); console.log('accepted'); }
  catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then, AfterAll} = require('@cucumber/cucumber');
  let dir = null;
  let binary = null;
  // Build one Validate driver per run from the checkout's current setup package.
  function driver() {
    if (binary) return binary;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colon-secret-validate-'));
    const file = path.join(dir, 'main.go');
    fs.writeFileSync(file, 'package main\nimport("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")\nfunc main(){var a map[string]any;if e:=json.Unmarshal([]byte(os.Getenv("VALIDATE_ARGS")),&a);e!=nil{panic(e)};_,p:=setup.Validate(a,setup.InitContext{});if p==nil{p=[]string{}};if e:=json.NewEncoder(os.Stdout).Encode(p);e!=nil{panic(e)}}\n');
    const out = path.join(dir, 'validate');
    const b = cp.spawnSync('go', ['build', '-o', out, file], {encoding:'utf8',timeout:200000});
    assert.equal(b.status, 0, `go build Validate driver: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
    binary = out;
    return binary;
  }
  AfterAll(function() { if (dir) fs.rmSync(dir, {recursive:true,force:true}); });
  When('fix-k-setup-refuse-secret-literals: Validate {word} command:', {timeout:240000}, function(kind, command) {
    const args = kind === 'checks' ? {checks:[{name:'a',run:command}]} : {[kind]:[command]};
    const r = cp.spawnSync(driver(), [], {env:{...process.env,VALIDATE_ARGS:JSON.stringify(args)},encoding:'utf8',timeout:10000});
    assert.equal(r.status, 0, `Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
    this.colonSecretProblems = JSON.parse(r.stdout);
  });
  Then('fix-k-setup-refuse-secret-literals: problems equal:', function(text) {
    assert.ok(Array.isArray(this.colonSecretProblems), 'Validate driver did not run');
    observe(this.colonSecretProblems, JSON.parse(text));
  });
}
