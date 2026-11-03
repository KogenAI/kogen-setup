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
func TestMutationObservation(t *testing.T) {
 var checks []any
 if err := json.Unmarshal([]byte(os.Getenv("MUTATION_CHECKS")), &checks); err != nil { t.Fatal(err) }
 f := newInitFx(t, true, submit(map[string]any{"setup": []any{}, "fix": []any{}, "checks": checks, "protect": []any{}}))
 f.write("README.md", "# Fixture\n")
 f.write("a.txt", "x\n")
 f.write(".gitignore", "out/\n")
 for _, p := range []string{"b.txt", "c.txt", "d.txt", "e.txt", "f.txt"} { f.write(p, "x\n") }
 f.commitAll("seed")
 out, _ := f.mustRun()
 cfg, err := project.LoadConfig(f.repo)
 if err != nil { t.Fatal(err) }
 names := []string{}
 for _, c := range cfg.Checks { names = append(names, c.Name) }
 lines := []string{}
 for _, line := range strings.Split(out, "\n") {
  if strings.HasPrefix(line, "Checks: ") || strings.HasPrefix(line, "Left out: ") { lines = append(lines, line) }
 }
 b, err := json.Marshal(map[string]any{"lines": lines, "checks": names, "a": f.read("a.txt")})
 if err != nil { t.Fatal(err) }
 fmt.Println("MUTATION_OBSERVATION=" + string(b))
}
`;
function compare(actual, expected) { assert.deepStrictEqual(actual, expected); }
const good = {lines:['Checks: ok, build, ok2, scratch','Left out: fmt (echo y > a.txt) changed a.txt'], checks:['ok','build','ok2','scratch'], a:'x\n'};
if (require.main === module) {
  const actual = process.argv[2] === 'good' ? good : {...good, checks:['fmt','ok','build','scratch']};
  try { compare(actual, good); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const { Given, When, Then, setDefaultTimeout } = require('@cucumber/cucumber');
  setDefaultTimeout(240000);
  Given('these proposed mutation checks:', function(table) { this.mutationChecks = table.hashes(); });
  When('init verifies the mutation fixture', function() {
    const root = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-mutation-'));
    try {
      for (const name of ['go.mod','go.sum','setup','contract']) fs.cpSync(path.join(root,name),path.join(tmp,name),{recursive:true});
      fs.writeFileSync(path.join(tmp,'contract/mutation_observation_test.go'),driver);
      const run = cp.spawnSync('go',['test','./contract','-run','^TestMutationObservation$','-count=1','-v'], {cwd:tmp,env:{...process.env,MUTATION_CHECKS:JSON.stringify(this.mutationChecks)},encoding:'utf8',timeout:210000});
      const output = (run.stdout || '') + (run.stderr || '');
      assert.equal(run.status,0,`go test ./contract -run ^TestMutationObservation$ failed: ${output}`);
      const matches = [...output.matchAll(/^MUTATION_OBSERVATION=(.*)$/gm)];
      assert.equal(matches.length,1,`TestMutationObservation must emit exactly one observation: ${output}`);
      this.mutationObservation = JSON.parse(matches[0][1]);
    } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
  });
  Then('the mutation observation is:', function(text) { compare(this.mutationObservation,JSON.parse(text)); });
}
