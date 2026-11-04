const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
function observe(actual, expected) { assert.deepEqual(actual || [], expected); }
if (process.argv[2] === '--control') {
  try {
    observe(process.argv[3] === 'good' ? ['diagnostic'] : [], ['diagnostic']);
    console.log('accepted');
  } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('k-setup-test-run-as-setup: Validate {string} as {word}', {timeout:240000}, function(command, kind) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-validate-'));
    try {
      const source = `package main
import("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")
func main(){var args map[string]any;if e:=json.Unmarshal([]byte(os.Getenv("VALIDATE_ARGS")),&args);e!=nil{panic(e)};_,p:=setup.Validate(args,setup.InitContext{});if e:=json.NewEncoder(os.Stdout).Encode(p);e!=nil{panic(e)}}
`;
      const file = path.join(dir, 'main.go'); fs.writeFileSync(file, source);
      const binary = path.join(dir, 'validate');
      const build = cp.spawnSync('go', ['build', '-o', binary, file], {cwd:process.cwd(),encoding:'utf8',timeout:200000});
      assert.equal(build.status,0,`go build Validate driver: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
      const args = kind === 'checks' ? {checks:[{name:'suite',run:command}]} : {[kind]:[command]};
      const r = cp.spawnSync(binary, [], {cwd:process.cwd(), env:{...process.env,VALIDATE_ARGS:JSON.stringify(args)},encoding:'utf8',timeout:10000});
      assert.equal(r.status,0,`Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.setupSuiteProblems = JSON.parse(r.stdout);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  });
  Then('k-setup-test-run-as-setup: problems equal:', function(text) {observe(this.setupSuiteProblems, JSON.parse(text));});
}
