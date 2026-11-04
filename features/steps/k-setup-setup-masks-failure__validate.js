const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
if (require.main === module) {
  try {
    const expected = {problems:['setup command npm ci || true ignores its own failure'],zero:true};
    observe(process.argv[2] === 'good' ? expected : {problems:[],zero:false}, expected);
    console.log('accepted');
  } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('k-setup-setup-masks-failure: Validate {string} command {string}', {timeout:180000}, function(role,command) {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.setup-mask-'));
    try {
      fs.writeFileSync(path.join(dir,'main.go'), `package main
import("encoding/json";"os";"reflect";"sort";"github.com/KogenAI/kogen-setup/setup")
func main(){var in struct{Role,Command string};if e:=json.NewDecoder(os.Stdin).Decode(&in);e!=nil{panic(e)};args:=map[string]any{in.Role:[]any{in.Command}};if in.Role=="checks"{args[in.Role]=[]any{map[string]any{"name":"test","run":in.Command}}};p,problems:=setup.Validate(args,setup.InitContext{Root:"/fixture",Tracked:[]string{"README.md"},Contents:map[string]string{}});if problems==nil{problems=[]string{}};sort.Strings(problems);if e:=json.NewEncoder(os.Stdout).Encode(map[string]any{"problems":problems,"zero":reflect.DeepEqual(p,setup.InitProposal{})});e!=nil{panic(e)}}
`);
      this.setupMaskResult = JSON.parse(execFileSync('go',['run','./'+path.basename(dir)],{input:JSON.stringify({Role:role,Command:command}),encoding:'utf8',timeout:170000}));
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  });
  Then('k-setup-setup-masks-failure: problems are {string} and zero proposal is {word}', function(problems,zero) {
    observe(this.setupMaskResult,{problems:JSON.parse(problems).sort(),zero:zero === 'true'});
  });
}
