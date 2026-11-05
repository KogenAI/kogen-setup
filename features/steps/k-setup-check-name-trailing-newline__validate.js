const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
function observe(actual, expected) { assert.deepEqual(actual || [], expected); }
if (process.argv[2] === '--control') {
  try { observe(JSON.parse(process.argv[3]), JSON.parse(process.argv[4])); console.log('accepted'); }
  catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  let binary;
  function driver() {
    if (binary) return binary;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-name-validate-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true,force:true}));
    const file = path.join(dir, 'main.go');
    fs.writeFileSync(file, 'package main\nimport("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")\nfunc main(){var checks []any;if e:=json.Unmarshal([]byte(os.Getenv("VALIDATE_CHECKS")),&checks);e!=nil{panic(e)};p,problems:=setup.Validate(map[string]any{"checks":checks},setup.InitContext{});out:=[]map[string]string{};for _,c:=range p.Checks{out=append(out,map[string]string{"name":c.Name,"run":c.Run})};if problems==nil{problems=[]string{}};if e:=json.NewEncoder(os.Stdout).Encode(map[string]any{"checks":out,"problems":problems});e!=nil{panic(e)}}\n');
    const out = path.join(dir, 'validate');
    const b = cp.spawnSync('go', ['build', '-o', out, file], {encoding:'utf8',timeout:200000});
    assert.equal(b.status, 0, `go build Validate driver: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
    binary = out;
    return binary;
  }
  When('k-setup-check-name-trailing-newline: Validate checks:', {timeout:240000}, function(text) {
    const checks = JSON.parse(text);
    const r = cp.spawnSync(driver(), [], {env:{...process.env,VALIDATE_CHECKS:JSON.stringify(checks)},encoding:'utf8',timeout:10000});
    assert.equal(r.status, 0, `Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
    this.checkNameResult = JSON.parse(r.stdout);
  });
  Then('k-setup-check-name-trailing-newline: problems equal:', function(text) {
    observe(this.checkNameResult.problems, JSON.parse(text));
  });
  Then('k-setup-check-name-trailing-newline: proposed checks equal:', function(text) {
    observe(this.checkNameResult.checks, JSON.parse(text));
  });
}
