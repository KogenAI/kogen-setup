const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
const driver = `package setup
import ("encoding/json"; "os"; "strings"; "testing")
func TestIsolationIntentCapture(t *testing.T) {
 var args map[string]any
 if err := json.Unmarshal([]byte(os.Getenv("ISOLATION_ARGS")), &args); err != nil { t.Fatal(err) }
 f := initNewFx(t, true, initSubmit(args))
 f.write("README.md", "fixture\\n")
 f.write(".gitignore", "node_modules/\\n")
 f.commitAll("seed")
 exit, out, _, err := f.run("")
 if err != nil { t.Fatal(err) }
 lines := []string{}
 for _, line := range strings.Split(out,"\\n") { if strings.HasPrefix(line,"Checks: ") || strings.HasPrefix(line,"Left out: ") { lines = append(lines,line) } }
 names := []string{}
 for _, c := range f.config().Checks { names = append(names,c.Name) }
 b, err := json.Marshal(map[string]any{"exit":exit,"checks":names,"lines":lines})
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("ISOLATION_RESULT"),b,0600); err != nil { t.Fatal(err) }
}
`;
if (process.argv[2] === '--control') {
 const expected = {exit:0,checks:['gen','plain'],lines:['Checks: gen, plain','Left out: use (test -f out/gen.txt) failed with status 1']};
 const actual = JSON.parse(JSON.stringify(expected));
 if (process.argv[3] === 'bad') actual.checks.splice(1,0,'use');
 try { observe(actual,expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode=1; }
} else {
 const {When,Then,setDefaultTimeout} = require('@cucumber/cucumber');
 setDefaultTimeout(300000);
 When('k-setup-check-needs-earlier-check-output: Init verifies this proposal:', function(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'isolation-'));
  try {
   fs.cpSync(process.cwd(),dir,{recursive:true,filter:p => !p.split(path.sep).some(x => x === '.git' || x === 'node_modules')});
   fs.writeFileSync(path.join(dir,'setup/isolation_intent_test.go'),driver);
   const result = path.join(dir,'isolation-result.json');
   const r = cp.spawnSync('go',['test','./setup','-run','^TestIsolationIntentCapture$','-count=1'],{cwd:dir,env:{...process.env,ISOLATION_ARGS:text,ISOLATION_RESULT:result},encoding:'utf8',timeout:240000});
   assert.equal(r.status,0,`TestIsolationIntentCapture: go test ./setup -run ^TestIsolationIntentCapture$ -count=1 failed: ${r.stdout}\n${r.stderr}`);
   assert.ok(fs.existsSync(result),'TestIsolationIntentCapture: go test ./setup -run ^TestIsolationIntentCapture$ -count=1 absent, skipped or zero executions');
   this.isolation = JSON.parse(fs.readFileSync(result,'utf8'));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
 });
 Then('k-setup-check-needs-earlier-check-output: the saved checks and summary are:', function(text) { observe(this.isolation,JSON.parse(text)); });
}
