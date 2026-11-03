const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
function compare(actual, expected) { assert.deepStrictEqual(actual, expected); }
if (require.main === module) {
  const expected = {checks:[{Name:'test',Run:'go test ./...'}],setup:['npm ci']};
  const actual = process.argv[2] === 'good' ? JSON.parse(JSON.stringify(expected)) : {...expected,setup:['npm ci','npm  ci ']};
  try { compare(actual, expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode=1; }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('command equivalence is observed for:', {timeout:240000}, function(text) {
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'equivalent-commands-'));
    try {
      for (const name of ['go.mod','go.sum','setup']) fs.cpSync(path.join(process.cwd(),name),path.join(tmp,name),{recursive:true});
      fs.writeFileSync(path.join(tmp,'setup/equivalence_observation_test.go'),`package setup
import (
 "encoding/json"
 "fmt"
 "os"
 "testing"
 "github.com/KogenAI/kogen-coordinator/project"
)
func TestEquivalenceObservation(t *testing.T) {
 var input struct { Detected project.Detected; Proposed InitProposal; A, B []string }
 if err := json.Unmarshal([]byte(os.Getenv("EQUIVALENCE_INPUT")), &input); err != nil { t.Fatal(err) }
 merged := Merge(input.Detected, input.Proposed)
 result := struct { Merged InitProposal; Union []string }{merged, initUnion(input.A,input.B)}
 b, err := json.Marshal(result); if err != nil { t.Fatal(err) }
 fmt.Println("EQUIVALENCE_RESULT="+string(b))
}
`);
      const run=cp.spawnSync('go',['test','./setup','-run','^TestEquivalenceObservation$','-count=1','-v'],{cwd:tmp,env:{...process.env,EQUIVALENCE_INPUT:text},encoding:'utf8',timeout:210000});
      const output=(run.stdout||'')+(run.stderr||'');
      assert.equal(run.status,0,`TestEquivalenceObservation: go test ./setup -run ^TestEquivalenceObservation$ outcome ${run.status}: ${output}`);
      const matches=[...output.matchAll(/^EQUIVALENCE_RESULT=(.*)$/gm)];
      assert.equal(matches.length,1,`TestEquivalenceObservation absent/skipped/zero observations: go test ./setup -run ^TestEquivalenceObservation$ outcome ${run.status}: ${output}`);
      this.equivalence=JSON.parse(matches[0][1]);
    } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
  });
  Then('the command equivalence result is:', function(text) { compare(this.equivalence,JSON.parse(text)); });
}
