const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const driver = String.raw`package contract
import (
 "encoding/json"
 "fmt"
 "os"
 "strings"
 "testing"
 "github.com/KogenAI/kogen-coordinator/project"
)
func TestSetupTrackedObservation(t *testing.T) {
 var proposal map[string]any
 if err := json.Unmarshal([]byte(os.Getenv("SETUP_TRACKED_PROPOSAL")), &proposal); err != nil { t.Fatal(err) }
 f := newInitFx(t, true, submit(proposal))
 f.write("README.md", "# Fixture\n")
 f.write(".gitignore", "deps/\n")
 for _, p := range []string{"a.txt","b.txt","c.txt","d.txt","e.txt","f.txt"} { f.write(p,"x\n") }
 f.commitAll("seed")
 out, _ := f.mustRun()
 cfg, err := project.LoadConfig(f.repo)
 if err != nil { t.Fatal(err) }
 kept := []string{}
 for _, cmd := range cfg.Setup { kept = append(kept, cmd) }
 checks := []string{}
 for _, c := range cfg.Checks { checks = append(checks,c.Name) }
 lines := []string{}
 for _, line := range strings.Split(out,"\n") {
  if strings.HasPrefix(line,"Setup: ") || strings.HasPrefix(line,"Checks: ") || strings.HasPrefix(line,"Left out: ") { lines = append(lines,line) }
 }
 b, err := json.Marshal(map[string]any{"setup":kept,"checks":checks,"lines":lines,"a":f.read("a.txt")})
 if err != nil { t.Fatal(err) }
 fmt.Println("SETUP_TRACKED_OBSERVATION="+string(b))
}
`;
function compare(actual, expected) { assert.deepStrictEqual(actual, expected); }
const control = {setup:['true'],checks:['ok'],lines:['Setup: true','Checks: ok'],a:'x\n'};
if (require.main === module) {
 const actual = process.argv[2] === 'good' ? structuredClone(control) : {...control, setup:['echo y >> a.txt']};
 try { compare(actual,control); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode=1; }
} else {
 const {Given,When,Then,setDefaultTimeout} = require('@cucumber/cucumber');
 setDefaultTimeout(240000);
 Given('the tracked setup proposal:', function(text) { this.trackedSetupProposal=JSON.parse(text); });
 When('init verifies the tracked setup fixture', function() {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'setup-tracked-'));
  try {
   for (const name of ['go.mod','go.sum','setup','contract']) fs.cpSync(path.join(process.cwd(),name),path.join(tmp,name),{recursive:true});
   fs.writeFileSync(path.join(tmp,'contract/setup_tracked_observation_test.go'),driver);
   const run=cp.spawnSync('go',['test','./contract','-run','^TestSetupTrackedObservation$','-count=1','-v'],{cwd:tmp,env:{...process.env,SETUP_TRACKED_PROPOSAL:JSON.stringify(this.trackedSetupProposal)},encoding:'utf8',timeout:210000});
   const output=(run.stdout||'')+(run.stderr||'');
   assert.equal(run.status,0,`TestSetupTrackedObservation: go test ./contract -run ^TestSetupTrackedObservation$ outcome ${run.status}: ${output}`);
   const matches=[...output.matchAll(/^SETUP_TRACKED_OBSERVATION=(.*)$/gm)];
   assert.equal(matches.length,1,`TestSetupTrackedObservation absent, skipped or zero observations: go test ./contract -run ^TestSetupTrackedObservation$ outcome ${run.status}: ${output}`);
   this.trackedSetupObservation=JSON.parse(matches[0][1]);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
 });
 Then('the tracked setup observation is:', function(text) { compare(this.trackedSetupObservation,JSON.parse(text)); });
}
