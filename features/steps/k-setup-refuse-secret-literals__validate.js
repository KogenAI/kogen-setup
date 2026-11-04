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
  When('k-setup-refuse-secret-literals: Validate {word} command:', {timeout:240000}, function(kind, command) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-validate-'));
    try {
      const file = path.join(dir, 'main.go');
      fs.writeFileSync(file, 'package main\nimport("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")\nfunc main(){var a map[string]any;if e:=json.Unmarshal([]byte(os.Getenv("VALIDATE_ARGS")),&a);e!=nil{panic(e)};_,p:=setup.Validate(a,setup.InitContext{});if e:=json.NewEncoder(os.Stdout).Encode(p);e!=nil{panic(e)}}\n');
      const binary = path.join(dir, 'validate');
      const b = cp.spawnSync('go', ['build', '-o', binary, file], {encoding:'utf8',timeout:200000});
      assert.equal(b.status, 0, `go build Validate driver: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
      const args = kind === 'checks' ? {checks:[{name:'a',run:command}]} : {[kind]:[command]};
      const r = cp.spawnSync(binary, [], {env:{...process.env,VALIDATE_ARGS:JSON.stringify(args)},encoding:'utf8',timeout:10000});
      assert.equal(r.status, 0, `Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.secretProblems = JSON.parse(r.stdout);
    } finally { fs.rmSync(dir, {recursive:true,force:true}); }
  });
  Then('k-setup-refuse-secret-literals: problems equal:', function(text) { observe(this.secretProblems, JSON.parse(text)); });
}
