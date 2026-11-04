// Steps for k-setup-fix-changes-protected-path: setup.Init on a synthetic committed repository
// with a scripted model reply proposing fix commands, checks and protected paths. The steps copy
// the current tree, add a Go test driver to package setup that runs Init through the existing
// init fixture, build that test binary once, and run it per scenario; the driver reports the
// saved fix and protect lists, the Fix:/Checks:/Protect:/Left out: summary lines, the fixer
// progress lines, the fixture files' content in the real repository and its git status as JSON.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
const testName = 'TestFixChangesProtectedIntentCapture';
const driver = `package setup
import (
 "encoding/json"
 "os"
 "strings"
 "testing"
)
func TestFixChangesProtectedIntentCapture(t *testing.T) {
 var spec struct {
  Files   map[string]string
  Fix     []string
  Checks  []map[string]string
  Protect []string
 }
 if err := json.Unmarshal([]byte(os.Getenv("FIXCP_SPEC")), &spec); err != nil { t.Fatal(err) }
 checks := []any{}
 for _, c := range spec.Checks { checks = append(checks, c) }
 protect := append([]string{}, spec.Protect...)
 f := initNewFx(t, true, initSubmit(map[string]any{"setup": []string{}, "fix": spec.Fix, "checks": checks, "protect": protect}))
 for p, c := range spec.Files { f.write(p, c) }
 f.commitAll("fixture")
 exit, out, progress, err := f.run("")
 res := map[string]any{"exit": exit, "error": "", "fix": []string{}, "protect": []string{}}
 if err != nil {
  res["error"] = err.Error()
 } else {
  cfg := f.config()
  res["fix"] = append([]string{}, cfg.Fix...)
  res["protect"] = append([]string{}, cfg.Protect...)
 }
 lines := []string{}
 for _, l := range strings.Split(out, "\\n") {
  for _, prefix := range []string{"Fix: ", "Checks: ", "Protect: ", "Left out: "} {
   if strings.HasPrefix(l, prefix) { lines = append(lines, l); break }
  }
 }
 res["lines"] = lines
 prog := []string{}
 for _, l := range strings.Split(progress, "\\n") { if strings.HasPrefix(l, "kogen: running fix-") { prog = append(prog, l) } }
 res["progress"] = prog
 files := map[string]string{}
 for p := range spec.Files { files[p] = f.read(p) }
 res["files"] = files
 res["status"] = f.git("status", "--porcelain", "--untracked-files=all")
 b, err := json.Marshal(res)
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("FIXCP_RESULT"), b, 0o600); err != nil { t.Fatal(err) }
}
`;
if (process.argv[2] === '--control') {
 const expected = {exit:0,error:'',fix:['test "$(cat lint.cfg)" = lint'],protect:['lint.cfg'],lines:['Fix: test "$(cat lint.cfg)" = lint','Checks: lint','Protect: lint.cfg','Left out: fix-1 (printf x >> lint.cfg) changed protected lint.cfg'],progress:['kogen: running fix-1: printf x >> lint.cfg','kogen: running fix-2: test "$(cat lint.cfg)" = lint','kogen: running fix-2 again: test "$(cat lint.cfg)" = lint'],files:{'a.txt':'a\n','lint.cfg':'lint\n'},status:''};
 const actual = JSON.parse(JSON.stringify(expected));
 if (process.argv[3] === 'bad') { actual.lines[3] = 'Left out: fix-1 (printf x >> lint.cfg) is not repeatable: its second run changed lint.cfg'; actual.progress.splice(1, 0, 'kogen: running fix-1 again: printf x >> lint.cfg'); }
 try { observe(actual, expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
 const {When, Then, AfterAll, setDefaultTimeout} = require('@cucumber/cucumber');
 setDefaultTimeout(300000);
 let work = null, binary = null;
 function build() {
  if (binary) return binary;
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-changes-protected-'));
  const tree = path.join(work, 'tree');
  fs.cpSync(process.cwd(), tree, {recursive: true, filter: p => !p.split(path.sep).some(x => x === '.git' || x === 'node_modules')});
  fs.writeFileSync(path.join(tree, 'setup', 'fix_changes_protected_intent_test.go'), driver);
  const out = path.join(work, 'setup.test');
  const r = cp.spawnSync('go', ['test', '-c', '-o', out, './setup'], {cwd: tree, encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `${testName}: go test -c -o ${out} ./setup failed with status ${r.status}${r.error ? ' (' + r.error.message + ')' : ''}:\n${r.stdout}\n${r.stderr}`);
  binary = out;
  return binary;
 }
 AfterAll(function () { if (work) fs.rmSync(work, {recursive: true, force: true}); });
 When('k-setup-fix-changes-protected-path: Init verifies the proposed commands and protected paths on this committed fixture:', function (text) {
  const bin = build();
  const result = path.join(work, 'result.json');
  fs.rmSync(result, {force: true});
  const args = ['-test.run', `^${testName}$`, '-test.count=1', '-test.v'];
  const r = cp.spawnSync(bin, args, {cwd: path.join(work, 'tree', 'setup'), env: {...process.env, FIXCP_SPEC: text, FIXCP_RESULT: result}, encoding: 'utf8', timeout: 240000});
  const ran = `${testName}: ${bin} ${args.join(' ')} with FIXCP_SPEC=${text}`;
  assert.equal(r.status, 0, `${ran} failed with status ${r.status}${r.error ? ' (' + r.error.message + ')' : ''}:\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes(`--- PASS: ${testName}`), `${ran} did not report a passing run of ${testName} (absent, skipped or ran zero times):\n${r.stdout}\n${r.stderr}`);
  assert.ok(fs.existsSync(result), `${ran} passed but wrote no result file ${result}`);
  this.fixChangesProtected = JSON.parse(fs.readFileSync(result, 'utf8'));
 });
 Then('k-setup-fix-changes-protected-path: the saved lists, summary lines, fix progress and real project files are:', function (text) {
  observe(this.fixChangesProtected, JSON.parse(text));
 });
}
