const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
const driver = `package setup
import (
 "encoding/json"
 "os"
 "strings"
 "testing"
 "time"
)
func TestRepeatabilityIntentCapture(t *testing.T) {
 var args map[string]any
 if err := json.Unmarshal([]byte(os.Getenv("REPEAT_ARGS")), &args); err != nil { t.Fatal(err) }
 f := initNewFx(t, true, initSubmit(args))
 f.write("README.md", "fixture\\n")
 f.commitAll("fixture")
 old := initExecTimeout
 initExecTimeout = 500 * time.Millisecond
 defer func(){initExecTimeout = old}()
 exit, out, progress, err := f.run("")
 if err != nil { t.Fatal(err) }
 lines := []string{}
 for _, line := range strings.Split(out,"\\n") { if strings.HasPrefix(line,"Left out: ") || strings.HasPrefix(line,"Checks: ") { lines = append(lines,line) } }
 checks := []string{}
 for _, c := range f.config().Checks { checks = append(checks,c.Name) }
 again := []string{}
 for _, line := range strings.Split(progress,"\\n") { if strings.Contains(line," again: ") { again = append(again,line) } }
 b, err := json.Marshal(map[string]any{"exit":exit,"lines":lines,"checks":checks,"again":again})
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("REPEAT_RESULT"),b,0600); err != nil {t.Fatal(err)}
}
`;
if (process.argv[2] === '--control') {
 const expected = {exit:0,lines:['Checks: stable','Left out: once (test ! -e .ran && touch .ran) is not repeatable: its second run failed with status 1'],checks:['stable'],again:['kogen: running once again: test ! -e .ran && touch .ran','kogen: running stable again: test -f README.md']};
 const actual = JSON.parse(JSON.stringify(expected));
 if (process.argv[3] === 'bad') actual.checks.push('once');
 try { observe(actual,expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode=1; }
} else {
 const {When,Then,setDefaultTimeout} = require('@cucumber/cucumber');
 setDefaultTimeout(300000);
 When('k-setup-check-not-repeatable: Init verifies this proposal on a committed README fixture:', function(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'repeatability-'));
  try {
   fs.cpSync(process.cwd(),dir,{recursive:true,filter:p => !p.split(path.sep).some(x => x === '.git' || x === 'node_modules')});
   fs.writeFileSync(path.join(dir,'setup/repeatability_intent_test.go'),driver);
   const result = path.join(dir,'repeat-result.json');
   const r = cp.spawnSync('go',['test','./setup','-run','^TestRepeatabilityIntentCapture$','-count=1'],{cwd:dir,env:{...process.env,REPEAT_ARGS:text,REPEAT_RESULT:result},encoding:'utf8',timeout:240000});
   assert.equal(r.status,0,`TestRepeatabilityIntentCapture: go test ./setup -run ^TestRepeatabilityIntentCapture$ -count=1 failed or absent: ${r.stdout}\n${r.stderr}`);
   assert.ok(fs.existsSync(result),'TestRepeatabilityIntentCapture: go test ./setup capture absent (skipped or zero executions)');
   this.repeatability = JSON.parse(fs.readFileSync(result,'utf8'));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
 });
 Then('k-setup-check-not-repeatable: the saved check names, summary and repeat progress are:', function(text) { observe(this.repeatability,JSON.parse(text)); });
}
