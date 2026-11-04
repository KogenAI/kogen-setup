const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
function observe(actual, expected) { assert.deepEqual(actual || [], expected); }
if (require.main === module) {
  try { observe(process.argv[2] === 'good' ? ['diagnostic'] : [], ['diagnostic']); }
  catch (_) { process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('k-setup-command-leaves-project-folder: run existing init tests requiring these passing tests', {timeout:180000}, function(text) {
    const names = JSON.parse(text);
    const command = 'go test -json ./setup -run ^TestInit -count=1';
    const output = cp.execFileSync('go', ['test','-json','./setup','-run','^TestInit','-count=1'], {encoding:'utf8',timeout:150000});
    const events = output.trim().split('\n').map(s => JSON.parse(s));
    this.outsideProblems = names.filter(name => !events.some(e => e.Test === name && e.Action === 'pass')).map(name => `${name}: ${command}: absent, skipped or ran zero times; no pass event`);
  });
  When('k-setup-command-leaves-project-folder: Validate this proposal', {timeout:180000}, function(text) {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.outside-validate-'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-project-'));
    try {
      fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
      fs.writeFileSync(path.join(dir, 'main.go'), `package main
import("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")
func main(){var in struct{Role,Command,Root string};if e:=json.NewDecoder(os.Stdin).Decode(&in);e!=nil{panic(e)};args:=map[string]any{};if in.Role=="check"{args["checks"]=[]any{map[string]any{"name":"test","run":in.Command}}}else{args[in.Role]=[]any{in.Command}};_,problems:=setup.Validate(args,setup.InitContext{Root:in.Root,Tracked:[]string{"README.md"}});if e:=json.NewEncoder(os.Stdout).Encode(problems);e!=nil{panic(e)}}
`);
      const input = {...JSON.parse(text), root};
      const result = cp.execFileSync('go', ['run', './'+path.basename(dir)], {cwd:process.cwd(), input:JSON.stringify(input), encoding:'utf8', timeout:150000});
      this.outsideProblems = JSON.parse(result);
    } finally {
      fs.rmSync(dir, {recursive:true, force:true});
      fs.rmSync(root, {recursive:true, force:true});
    }
  });
  Then('k-setup-command-leaves-project-folder: problems equal', function(text) {
    observe(this.outsideProblems, JSON.parse(text));
  });
}
