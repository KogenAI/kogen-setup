const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const driver = String.raw`package setup
import (
 "encoding/json"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "testing"
 "github.com/KogenAI/kogen-coordinator/project"
)
func TestCoverageOverlapObservation(t *testing.T) {
 mode := os.Getenv("OVERLAP_CASE")
 node, err := exec.LookPath("node"); if err != nil { t.Fatal(err) }
 npm, err := exec.LookPath("npm"); if err != nil { t.Fatal(err) }
 proposal := map[string]any{"setup": []any{"npm run setup"}, "fix": []any{}, "checks": initCheckList("a", "npm run test-a", "b", "npm run test-b"), "protect": []any{}}
 f := initNewFx(t, true, initSubmit(proposal))
 trace := filepath.Join(f.home, "effects")
 f.env = append(f.env, "OVERLAP_TRACE="+trace, "OVERLAP_PATHS=test/a.test.cjs test/b.test.cjs")
 f.program("node", "if [ -n \"$KOGEN_ACCEPTANCE_REPORT\" ]; then echo '{}' > \"$KOGEN_ACCEPTANCE_REPORT\"; exit 0; fi\nexec '"+node+"' \"$@\"")
 f.program("npm", "exec '"+npm+"' \"$@\"")
 full := "node --test test/a.test.cjs test/b.test.cjs"
 if mode == "filtered" { full = "node --test test/a.test.cjs" }
 if mode == "unknown" { full = "node --test $OVERLAP_PATHS" }
 scripts := map[string]string{"preinstall":"node prep.cjs", "setup":"npm ci --no-audit --no-fund && node other.cjs", "test":full, "test-a":"node --test test/a.test.cjs", "test-b":"node --test test/b.test.cjs"}
 manifest := map[string]any{"name":"overlap-fixture", "version":"1.0.0", "scripts":scripts}
 b, _ := json.Marshal(manifest); f.write("package.json", string(b))
 f.write("package-lock.json", "{\"name\":\"overlap-fixture\",\"version\":\"1.0.0\",\"lockfileVersion\":3,\"requires\":true,\"packages\":{\"\":{\"name\":\"overlap-fixture\",\"version\":\"1.0.0\",\"hasInstallScript\":true}}}")
 for _, name := range []string{"prep", "other"} { f.write(name+".cjs", "require('node:fs').appendFileSync(process.env.OVERLAP_TRACE, '"+name+"\\n');\n") }
 for _, name := range []string{"a", "b"} { f.write("test/"+name+".test.cjs", "require('node:test')('"+name+"', () => { require('node:fs').appendFileSync(process.env.OVERLAP_TRACE, '"+name+"\\n'); });\n") }
 f.write("README.md", "# Synthetic overlap project\nSetup: npm run setup. Tests: npm test, npm run test-a, npm run test-b. The package scripts define the discovery paths; the unknown variant obtains its paths from the environment.\n")
 f.commitAll("fixture")
 // Qualify the configured full command and explicit paths before Init. These
 // are real Node tests, not simulated runner output.
 run := func(command string) { cmd := exec.Command("sh", "-c", command); cmd.Dir=f.repo; cmd.Env=f.env; out, err := cmd.CombinedOutput(); if err != nil { t.Fatalf("command %s: %v\n%s", command, err, out) } }
 read := func() map[string]int { data, err := os.ReadFile(trace); if err != nil { t.Fatal(err) }; counts:=map[string]int{}; for _, line := range strings.Fields(string(data)) { counts[line]++ }; return counts }
 clear := func() { if err := os.WriteFile(trace, nil, 0600); err != nil { t.Fatal(err) } }
 clear(); run("npm test"); fullEffects := read()
 clear(); run("npm run test-a && npm run test-b"); explicitEffects := read()
 f.mustRun()
 cfg := f.config()
 setup := cfg.Setup; checks := cfg.Checks
 control := os.Getenv("OVERLAP_CONTROL")
 if control != "" {
  setup=[]string{"npm run setup"}
  checks=[]project.Check{{Name:"test", Run:"npm test"}}
  if mode=="filtered" { checks=append(checks,project.Check{Name:"b",Run:"npm run test-b"}) }
  if mode=="unknown" { checks=append(checks,project.Check{Name:"a",Run:"npm run test-a"},project.Check{Name:"b",Run:"npm run test-b"}) }
  if control=="bad" { setup=append([]string{"npm ci --no-audit --no-fund"},setup...); checks=append(checks,project.Check{Name:"duplicate",Run:"npm run test-a"}) }
 }
 clear(); for _, command := range setup { run(command) }; setupEffects:=read()
 clear(); for _, check := range checks { run(check.Run) }; checkEffects:=read()
 result := map[string]any{"full":fullEffects,"explicit":explicitEffects,"setup":setupEffects,"checks":checkEffects,"checkCount":len(checks)}
 out, _ := json.Marshal(result); fmt.Println("OVERLAP_RESULT="+string(out))
}
`;
function observe(mode, control = '') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-overlap-'));
  try {
    for (const name of ['go.mod', 'go.sum', 'setup']) fs.cpSync(path.join(process.cwd(), name), path.join(tmp, name), {recursive:true});
    fs.writeFileSync(path.join(tmp, 'setup/coverage_overlap_observation_test.go'), driver);
    const command = 'go test ./setup -run ^TestCoverageOverlapObservation$ -count=1 -v';
    const r = cp.spawnSync('go', ['test','./setup','-run','^TestCoverageOverlapObservation$','-count=1','-v'], {cwd:tmp, env:{...process.env,OVERLAP_CASE:mode,OVERLAP_CONTROL:control}, encoding:'utf8', timeout:210000});
    const output = (r.stdout || '') + (r.stderr || '');
    assert.equal(r.status, 0, `TestCoverageOverlapObservation: ${command}; outcome ${r.status}: ${output}`);
    const rows = [...output.matchAll(/^OVERLAP_RESULT=(.*)$/gm)];
    assert.equal(rows.length, 1, `TestCoverageOverlapObservation absent/skipped/zero observations: ${command}; outcome ${r.status}: ${output}`);
    return JSON.parse(rows[0][1]);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
}
function compare(actual, expected) { assert.deepStrictEqual(actual, expected); }
const expected = mode => ({full:mode==='filtered'?{a:1}:{a:1,b:1}, explicit:{a:1,b:1}, setup:{prep:1,other:1}, checks:mode==='unknown'?{a:2,b:2}:{a:1,b:1}, checkCount:mode==='full'?1:mode==='filtered'?2:3});
if (require.main === module) {
  const control = process.argv[2];
  try {
    // Run all fixtures before comparison so a first failure cannot mask a broken
    // later fixture in these independent observer controls.
    const modes=['full','filtered','unknown'];
    const actual=modes.map(mode=>observe(mode,control));
    compare(actual,modes.map(expected));
    console.log('accepted');
  } catch (error) {
    if (error.code !== 'ERR_ASSERTION' || !error.actual || !Array.isArray(error.actual)) { console.error(error.message); process.exitCode=2; }
    else { console.log('rejected'); process.exitCode=1; }
  }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('k-setup-coverage-backed-overlap: initialization selects commands for {string}', {timeout:240000}, function(mode) { this.overlapResult=observe(mode); });
  Then('k-setup-coverage-backed-overlap: the observed work is:', function(text) { compare(this.overlapResult,JSON.parse(text)); });
}
