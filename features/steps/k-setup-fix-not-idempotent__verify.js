// Steps for k-setup-fix-not-idempotent: setup.Init on a synthetic committed repository with a
// scripted model reply proposing only fix commands. The steps copy the current tree, add a Go
// test driver to package setup that runs Init through the existing init fixture, build that test
// binary once, and run it per scenario; the driver reports the saved fix list, the Fix:/Left out:
// summary lines and the fixer progress lines as JSON.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
const testName = 'TestFixNotIdempotentIntentCapture';
const driver = `package setup
import (
 "encoding/json"
 "os"
 "strings"
 "testing"
 "time"
)
func TestFixNotIdempotentIntentCapture(t *testing.T) {
 var spec struct {
  Files     map[string]string
  Fix       []string
  TimeoutMs int
 }
 if err := json.Unmarshal([]byte(os.Getenv("FIXNI_SPEC")), &spec); err != nil { t.Fatal(err) }
 f := initNewFx(t, true, initSubmit(map[string]any{"setup": []string{}, "fix": spec.Fix, "checks": []any{}, "protect": []string{}}))
 for p, c := range spec.Files { f.write(p, c) }
 f.commitAll("fixture")
 if spec.TimeoutMs > 0 {
  old := initExecTimeout
  initExecTimeout = time.Duration(spec.TimeoutMs) * time.Millisecond
  defer func() { initExecTimeout = old }()
 }
 exit, out, progress, err := f.run("")
 res := map[string]any{"exit": exit, "error": "", "fix": []string{}}
 if err != nil { res["error"] = err.Error() } else { res["fix"] = append([]string{}, f.config().Fix...) }
 lines := []string{}
 for _, l := range strings.Split(out, "\\n") { if strings.HasPrefix(l, "Fix: ") || strings.HasPrefix(l, "Left out: ") { lines = append(lines, l) } }
 res["lines"] = lines
 prog := []string{}
 for _, l := range strings.Split(progress, "\\n") { if strings.HasPrefix(l, "kogen: running fix-") { prog = append(prog, l) } }
 res["progress"] = prog
 b, err := json.Marshal(res)
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("FIXNI_RESULT"), b, 0o600); err != nil { t.Fatal(err) }
}
`;
if (process.argv[2] === '--control') {
 const expected = {exit:0,error:'',fix:[],lines:['Fix: none','Left out: fix-1 (printf x >> f.txt) is not repeatable: its second run changed f.txt'],progress:['kogen: running fix-1: printf x >> f.txt','kogen: running fix-1 again: printf x >> f.txt']};
 const actual = JSON.parse(JSON.stringify(expected));
 if (process.argv[3] === 'bad') { actual.fix.push('printf x >> f.txt'); actual.lines = ['Fix: printf x >> f.txt']; actual.progress = ['kogen: running fix-1: printf x >> f.txt']; }
 try { observe(actual, expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
 const {When, Then, AfterAll, setDefaultTimeout} = require('@cucumber/cucumber');
 setDefaultTimeout(300000);
 let work = null, binary = null;
 function build() {
  if (binary) return binary;
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-not-idempotent-'));
  const tree = path.join(work, 'tree');
  fs.cpSync(process.cwd(), tree, {recursive: true, filter: p => !p.split(path.sep).some(x => x === '.git' || x === 'node_modules')});
  fs.writeFileSync(path.join(tree, 'setup', 'fix_not_idempotent_intent_test.go'), driver);
  const out = path.join(work, 'setup.test');
  const r = cp.spawnSync('go', ['test', '-c', '-o', out, './setup'], {cwd: tree, encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `${testName}: go test -c -o ${out} ./setup failed with status ${r.status}${r.error ? ' (' + r.error.message + ')' : ''}:\n${r.stdout}\n${r.stderr}`);
  binary = out;
  return binary;
 }
 AfterAll(function () { if (work) fs.rmSync(work, {recursive: true, force: true}); });
 When('k-setup-fix-not-idempotent: Init verifies the proposed fix commands on this committed fixture:', function (text) {
  const bin = build();
  const result = path.join(work, 'result.json');
  fs.rmSync(result, {force: true});
  const args = ['-test.run', `^${testName}$`, '-test.count=1', '-test.v'];
  const r = cp.spawnSync(bin, args, {cwd: path.join(work, 'tree', 'setup'), env: {...process.env, FIXNI_SPEC: text, FIXNI_RESULT: result}, encoding: 'utf8', timeout: 240000});
  const ran = `${testName}: ${bin} ${args.join(' ')} with FIXNI_SPEC=${text}`;
  assert.equal(r.status, 0, `${ran} failed with status ${r.status}${r.error ? ' (' + r.error.message + ')' : ''}:\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes(`--- PASS: ${testName}`), `${ran} did not report a passing run of ${testName} (absent, skipped or ran zero times):\n${r.stdout}\n${r.stderr}`);
  assert.ok(fs.existsSync(result), `${ran} passed but wrote no result file ${result}`);
  this.fixNotIdempotent = JSON.parse(fs.readFileSync(result, 'utf8'));
 });
 Then('k-setup-fix-not-idempotent: the saved fix commands, summary lines and fix progress are:', function (text) {
  observe(this.fixNotIdempotent, JSON.parse(text));
 });
}
