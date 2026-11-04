const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
function observe(actual, expected) {
  if (JSON.stringify(actual || []) !== JSON.stringify(expected)) throw new Error('Validate problems: '+JSON.stringify(actual || [])+'; expected '+JSON.stringify(expected));
}
if (require.main === module) {
  try { observe(process.argv[2] === 'good' ? ['diagnostic'] : [], ['diagnostic']); }
  catch (_) { process.exitCode = 1; }
} else {
  const {When, Then, setDefaultTimeout} = require('@cucumber/cucumber');
  setDefaultTimeout(180000);
  When('k-setup-check-masks-failure: Validate check {string} with command {string} in {string}', function(name, command, role) {
    command = command.replace(/\\u007c/g, '|');
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.mask-validate-'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mask-readme-'));
    try {
      fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
      fs.writeFileSync(path.join(dir, 'main.go'), `package main
import("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")
func main(){var in struct{Name,Command,Role,Root string};if err:=json.NewDecoder(os.Stdin).Decode(&in);err!=nil{panic(err)};args:=map[string]any{};if in.Role=="checks"{args[in.Role]=[]any{map[string]any{"name":in.Name,"run":in.Command}}}else{args[in.Role]=[]any{in.Command}};_,p:=setup.Validate(args,setup.InitContext{Root:in.Root,Tracked:[]string{"README.md"},Contents:map[string]string{}});if err:=json.NewEncoder(os.Stdout).Encode(p);err!=nil{panic(err)}}
`);
      this.maskProblems = JSON.parse(execFileSync('go', ['run', './'+path.basename(dir)], {cwd:process.cwd(), input:JSON.stringify({Name:name,Command:command,Role:role,Root:root}), encoding:'utf8', timeout:120000}));
      this.maskName = name; this.maskCommand = command;
    } finally { fs.rmSync(dir,{recursive:true,force:true}); fs.rmSync(root,{recursive:true,force:true}); }
  });
  Then('k-setup-check-masks-failure: the problems are {string}', function(result) {
    const suffix = {mask:'ignores its own failure', nothing:'runs nothing'}[result];
    observe(this.maskProblems, result === 'none' ? [] : [`check ${this.maskName} (${this.maskCommand}) ${suffix}`]);
  });
}
