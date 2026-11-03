const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
function observe(r, e) {
  assert.equal(r.exit, 0);
  assert.deepEqual(r.out.split('\n').filter(x => x.startsWith('Replaced: ')), e.lines);
  const lines = r.out.split('\n');
  for (const line of e.lines) {
    assert.ok(lines.indexOf(line) > lines.findIndex(x => x.startsWith('Checks: ')));
    assert.ok(lines.indexOf(line) < lines.findIndex(x => x.startsWith('Acceptance: ')));
  }
  for (const [name, run] of Object.entries(e.kept)) assert.equal(r.checks.find(c => c.Name === name)?.Run, run);
  assert.deepEqual(r.synthetic, [{Name:'test',Run:'go test ./cmd/app'}]);
}
const driver = `package setup
import (
 "encoding/json"
 "os"
 "testing"
 "github.com/KogenAI/kogen-coordinator/project"
)
func TestReplacementIntentCapture(t *testing.T) {
 var args map[string]any
 if err := json.Unmarshal([]byte(os.Getenv("REPLACEMENT_ARGS")), &args); err != nil { t.Fatal(err) }
 f := initNewFx(t, true, initSubmit(args))
 f.program("go", "echo 'ok    fixture 0.001s'\\nexit 0")
 f.program("gofmt", "exit 0")
 f.write("go.mod", "module fixture\\n\\ngo 1.27.2\\n")
 f.write("main.go", "package main\\n\\nfunc main() {}\\n")
 f.commitAll("fixture")
 exit, out, _, err := f.run("")
 if err != nil { t.Fatal(err) }
 synthetic := Merge(project.Detected{Checks: []project.Check{{Name:"test", Run:"go test ./..."}}}, InitProposal{Checks: []project.Check{{Name:"test", Run:"go test ./cmd/app"}}})
 data, err := json.Marshal(map[string]any{"exit":exit,"out":out,"checks":f.config().Checks,"synthetic":synthetic.Checks})
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("REPLACEMENT_RESULT"), data, 0600); err != nil { t.Fatal(err) }
}
`;
if (process.argv[2] === '--control') {
 const e = {lines:['Replaced: test (go test ./...) with (go test ./cmd/app)'], kept:{test:'go test ./cmd/app'}};
 const r = {exit:0,out:'Checks: test\n'+e.lines[0]+'\nAcceptance: bridge\n',checks:[{Name:'test',Run:'go test ./cmd/app'}],synthetic:[{Name:'test',Run:'go test ./cmd/app'}]};
 if (process.argv[3] === 'bad') r.checks[0].Run = 'go test ./...';
 try { observe(r,e); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode=1; }
} else {
 const {When, Then, setDefaultTimeout} = require('@cucumber/cucumber');
 setDefaultTimeout(300000);
 When('k-setup-replaced-detected-check-reported: Init receives this proposal:', function(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'replacement-'));
  try {
   fs.cpSync(process.cwd(), dir, {recursive:true, filter:p => !p.split(path.sep).some(x => x === '.git' || x === 'node_modules')});
   fs.writeFileSync(path.join(dir,'setup/replacement_intent_test.go'),driver);
   const result = path.join(dir,'result.json');
   const r = cp.spawnSync('go',['test','./setup','-count=1'],{cwd:dir,env:{...process.env,REPLACEMENT_ARGS:text,REPLACEMENT_RESULT:result},encoding:'utf8',timeout:240000});
   assert.equal(r.status,0,`go test ./setup -count=1 capture failed: ${r.stdout}\n${r.stderr}`);
   this.replacement = JSON.parse(fs.readFileSync(result,'utf8'));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
 });
 Then('k-setup-replaced-detected-check-reported: the summary and saved checks are:', function(text) { observe(this.replacement,JSON.parse(text)); });
}
