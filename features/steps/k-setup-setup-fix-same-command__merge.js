const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
function observe(actual, expected) {
  assert.deepStrictEqual(actual.merged, expected.merged);
  assert.deepStrictEqual(actual.saved, expected.saved);
  assert.deepStrictEqual(actual.out.split('\n').filter(x => x.startsWith('Dropped: fix: ')), expected.drops);
}
const driver = `package setup
import (
 "encoding/json"
 "os"
 "testing"
 "github.com/KogenAI/kogen-coordinator/project"
)
func TestSameCommandIntentCapture(t *testing.T) {
 var input struct { Detected project.Detected; Proposed InitProposal }
 if err := json.Unmarshal([]byte(os.Getenv("SAME_COMMAND_INPUT")), &input); err != nil { t.Fatal(err) }
 merged := Merge(input.Detected, input.Proposed)
 args := map[string]any{"setup":input.Proposed.Setup,"fix":input.Proposed.Fix,"checks":[]any{}}
 checks := []any{}
 for _, c := range input.Proposed.Checks { checks = append(checks,map[string]any{"name":c.Name,"run":c.Run}) }
 args["checks"] = checks
 f := initNewFx(t,true,initSubmit(args))
 f.program("npm", "exit 0")
 f.program("make", "exit 0")
 f.write("README.md", "Synthetic command fixture.\\n")
 f.write("Makefile", "lint:\\n\\t@echo lint\\n")
 f.commitAll("fixture")
 exit, out, stderr, err := f.run("")
 if err != nil || exit != 0 { t.Fatalf("Init exit=%d err=%v stdout=%s stderr=%s",exit,err,out,stderr) }
 cfg := f.config()
 list := func(x []string) []string { if x == nil { return []string{} }; return x }
 checkList := func(x []project.Check) []project.Check { if x == nil { return []project.Check{} }; return x }
 projectResult := func(s,f []string,c []project.Check) map[string]any { return map[string]any{"setup":list(s),"fix":list(f),"checks":checkList(c)} }
 data, err := json.Marshal(map[string]any{"merged":projectResult(merged.Setup,merged.Fix,merged.Checks),"saved":projectResult(cfg.Setup,cfg.Fix,cfg.Checks),"out":out})
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("SAME_COMMAND_RESULT"),data,0600); err != nil { t.Fatal(err) }
}
`;
if (require.main === module) {
  const expected = {merged:{setup:['npm ci'],fix:[],checks:[{Name:'lint',Run:'make lint'}]},saved:{setup:['npm ci'],fix:[],checks:[{Name:'lint',Run:'make lint'}]},drops:['Dropped: fix: npm ci (already in setup)']};
  const good = {merged:expected.merged,saved:expected.saved,out:expected.drops[0]+'\n'};
  if (process.argv[2] === 'good') { observe(good, expected); console.log('accepted'); }
  else {
    for (const mutate of [r=>r.merged.fix.push('npm ci'),r=>r.saved.fix.push('npm ci'),r=>r.saved.setup.pop(),r=>r.saved.checks.pop(),r=>r.out='',r=>r.out+=r.out]) {
      const bad = JSON.parse(JSON.stringify(good)); mutate(bad);
      let rejected = false; try { observe(bad,expected); } catch (_) { rejected = true; }
      if (!rejected) throw new Error('observer accepted bad control');
    }
    console.log('rejected'); process.exitCode = 1;
  }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('k-setup-setup-fix-same-command: Merge and Init receive:', {timeout:300000}, function(text) {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'same-command-'));
    try {
      for (const name of ['go.mod','go.sum','setup']) fs.cpSync(path.join(process.cwd(),name),path.join(dir,name),{recursive:true});
      fs.writeFileSync(path.join(dir,'setup/same_command_intent_test.go'),driver);
      const result=path.join(dir,'result.json');
      const run=cp.spawnSync('go',['test','./setup','-run','^TestSameCommandIntentCapture$','-count=1'],{cwd:dir,env:{...process.env,SAME_COMMAND_INPUT:text,SAME_COMMAND_RESULT:result},encoding:'utf8',timeout:270000});
      assert.equal(run.status,0,`TestSameCommandIntentCapture: go test ./setup -run ^TestSameCommandIntentCapture$ -count=1 outcome ${run.status}: ${run.stdout}\n${run.stderr}`);
      assert.ok(fs.existsSync(result),'TestSameCommandIntentCapture absent/skipped/zero observations: go test ./setup -run ^TestSameCommandIntentCapture$ -count=1');
      this.sameCommand=JSON.parse(fs.readFileSync(result,'utf8'));
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  });
  Then('k-setup-setup-fix-same-command: the results are:', function(text) { observe(this.sameCommand,JSON.parse(text)); });
}
