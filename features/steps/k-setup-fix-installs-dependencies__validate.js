const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
function observe(actual, expected) { assert.deepEqual(actual || [], expected); }
if (process.argv[2] === '--control') {
  try {
    observe(process.argv[3] === 'good' ? ['fix command npm install installs dependencies; put the install in setup'] : [], ['fix command npm install installs dependencies; put the install in setup']);
    console.log('accepted');
  } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('k-setup-fix-installs-dependencies: Validate proposal:', {timeout:240000}, function(text) {
    const args = JSON.parse(text);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-install-validate-'));
    try {
      const file = path.join(dir, 'main.go');
      fs.writeFileSync(file, `package main
import("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")
func main(){var a map[string]any;if e:=json.Unmarshal([]byte(os.Getenv("VALIDATE_ARGS")),&a);e!=nil{panic(e)};p,q:=setup.Validate(a,setup.InitContext{});if e:=json.NewEncoder(os.Stdout).Encode(map[string]any{"problems":q,"setup":p.Setup,"fix":p.Fix});e!=nil{panic(e)}}
`);
      const binary = path.join(dir, 'validate');
      const b = cp.spawnSync('go', ['build', '-o', binary, file], {encoding:'utf8',timeout:200000});
      assert.equal(b.status, 0, `build Validate driver: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
      const r = cp.spawnSync(binary, [], {env:{...process.env,VALIDATE_ARGS:JSON.stringify(args)},encoding:'utf8',timeout:10000});
      assert.equal(r.status, 0, `run Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.fixInstallResult = JSON.parse(r.stdout);
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  });
  Then('k-setup-fix-installs-dependencies: problems equal:', function(text) { observe(this.fixInstallResult.problems, JSON.parse(text)); });
  Then('k-setup-fix-installs-dependencies: the proposal is:', function(text) {
    const expected = JSON.parse(text);
    assert.deepEqual({setup:this.fixInstallResult.setup || [], fix:this.fixInstallResult.fix || []}, expected);
  });
}
