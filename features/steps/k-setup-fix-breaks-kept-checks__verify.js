// Steps for k-setup-fix-breaks-kept-checks: setup.Init on a synthetic committed repository
// with a scripted model reply proposing checks and fix commands (no real model call). The steps
// copy the current tree, add a Go test driver to package setup that runs Init through the
// existing init fixture, build that test binary once, and run it per scenario; the driver reports
// the saved fix and checks lists, the Fix:/Checks:/Left out: summary lines, the verification
// progress lines, the fixture files' content in the real repository and its git status as JSON.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
const testName = 'TestFixBreaksKeptChecksIntentCapture';
const driver = `package setup
import (
 "encoding/json"
 "os"
 "strings"
 "testing"
 "time"
)
func TestFixBreaksKeptChecksIntentCapture(t *testing.T) {
 var spec struct {
  Files     map[string]string
  Fix       []string
  Checks    []map[string]string
  TimeoutMs int
 }
 if err := json.Unmarshal([]byte(os.Getenv("FIXBKC_SPEC")), &spec); err != nil { t.Fatal(err) }
 if spec.TimeoutMs > 0 {
  old := initExecTimeout
  initExecTimeout = time.Duration(spec.TimeoutMs) * time.Millisecond
  defer func() { initExecTimeout = old }()
 }
 checks := []any{}
 for _, c := range spec.Checks { checks = append(checks, c) }
 fix := append([]string{}, spec.Fix...)
 f := initNewFx(t, true, initSubmit(map[string]any{"setup": []string{}, "fix": fix, "checks": checks, "protect": []string{}}))
 for p, c := range spec.Files { f.write(p, c) }
 f.commitAll("fixture")
 exit, out, progress, err := f.run("")
 res := map[string]any{"exit": exit, "error": "", "fix": []string{}, "checks": []map[string]string{}}
 if err != nil {
  res["error"] = err.Error()
 } else {
  cfg := f.config()
  res["fix"] = append([]string{}, cfg.Fix...)
  kept := []map[string]string{}
  for _, c := range cfg.Checks { kept = append(kept, map[string]string{"name": c.Name, "run": c.Run}) }
  res["checks"] = kept
 }
 lines := []string{}
 for _, l := range strings.Split(out, "\\n") {
  for _, prefix := range []string{"Fix: ", "Checks: ", "Left out: "} {
   if strings.HasPrefix(l, prefix) { lines = append(lines, l); break }
  }
 }
 res["lines"] = lines
 prog := []string{}
 for _, l := range strings.Split(progress, "\\n") {
  if strings.HasPrefix(l, "kogen: checking ") || strings.HasPrefix(l, "kogen: running ") { prog = append(prog, l) }
 }
 res["progress"] = prog
 files := map[string]string{}
 for p := range spec.Files { files[p] = f.read(p) }
 res["files"] = files
 res["status"] = f.git("status", "--porcelain", "--untracked-files=all")
 b, err := json.Marshal(res)
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("FIXBKC_RESULT"), b, 0o600); err != nil { t.Fatal(err) }
}
`;
if (process.argv[2] === '--control') {
 const t = 'test "$(cat state.txt)" = ok';
 const expected = {exit:0,error:'',fix:[],checks:[{name:'t',run:t}],lines:['Fix: none','Checks: t','Left out: fix-1 (printf bad > state.txt) breaks check t (' + t + '): failed with status 1'],progress:['kogen: checking the acceptance runner','kogen: checking t: ' + t,'kogen: running t again: ' + t,'kogen: running fix-1: printf bad > state.txt','kogen: running fix-1 again: printf bad > state.txt','kogen: checking t after fix-1: ' + t],files:{'state.txt':'ok\n'},status:''};
 const actual = JSON.parse(JSON.stringify(expected));
 if (process.argv[3] === 'bad') { actual.fix = ['printf bad > state.txt']; actual.lines = ['Fix: printf bad > state.txt','Checks: t']; actual.progress.pop(); }
 try { observe(actual, expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
 const {When, Then, AfterAll, setDefaultTimeout} = require('@cucumber/cucumber');
 setDefaultTimeout(300000);
 let work = null, binary = null;
 function build() {
  if (binary) return binary;
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-breaks-kept-checks-'));
  const tree = path.join(work, 'tree');
  fs.cpSync(process.cwd(), tree, {recursive: true, filter: p => !p.split(path.sep).some(x => x === '.git' || x === 'node_modules')});
  fs.writeFileSync(path.join(tree, 'setup', 'fix_breaks_kept_checks_intent_test.go'), driver);
  const out = path.join(work, 'setup.test');
  const r = cp.spawnSync('go', ['test', '-c', '-o', out, './setup'], {cwd: tree, encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `${testName}: go test -c -o ${out} ./setup failed with status ${r.status}${r.error ? ' (' + r.error.message + ')' : ''}:\n${r.stdout}\n${r.stderr}`);
  binary = out;
  return binary;
 }
 AfterAll(function () { if (work) fs.rmSync(work, {recursive: true, force: true}); });
 When('k-setup-fix-breaks-kept-checks: Init verifies the proposed checks and fix commands on this committed fixture:', function (text) {
  const bin = build();
  const result = path.join(work, 'result.json');
  fs.rmSync(result, {force: true});
  const args = ['-test.run', `^${testName}$`, '-test.count=1', '-test.v'];
  const r = cp.spawnSync(bin, args, {cwd: path.join(work, 'tree', 'setup'), env: {...process.env, FIXBKC_SPEC: text, FIXBKC_RESULT: result}, encoding: 'utf8', timeout: 240000});
  const ran = `${testName}: ${bin} ${args.join(' ')} with FIXBKC_SPEC=${text}`;
  assert.equal(r.status, 0, `${ran} failed with status ${r.status}${r.error ? ' (' + r.error.message + ')' : ''}:\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes(`--- PASS: ${testName}`), `${ran} did not report a passing run of ${testName} (absent, skipped or ran zero times):\n${r.stdout}\n${r.stderr}`);
  assert.ok(fs.existsSync(result), `${ran} passed but wrote no result file ${result}`);
  this.fixBreaksKeptChecks = JSON.parse(fs.readFileSync(result, 'utf8'));
 });
 Then('k-setup-fix-breaks-kept-checks: the saved lists, summary lines, verification progress and real project files are:', function (text) {
  observe(this.fixBreaksKeptChecks, JSON.parse(text));
 });
}
