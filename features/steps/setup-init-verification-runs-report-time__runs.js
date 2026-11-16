const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const P = 'setup-init-verification-runs-report-time: ';
const INIT_TEST = 'TestRunEndInitDriver';
const initDriver = `package setup
import (
 "encoding/json"
 "os"
 "path/filepath"
 "testing"
 "time"
)
func ${INIT_TEST}(t *testing.T) {
 var in struct { Setup []string; Fix []string; Checks [][2]string; Budget bool }
 if err := json.Unmarshal([]byte(os.Getenv("RUN_END_INPUT")), &in); err != nil { t.Fatal(err) }
 if in.Budget {
  oldBudget, oldTimeout := initVerifyLimit, initExecTimeout
  initVerifyLimit, initExecTimeout = 3*time.Second, 10*time.Second
  defer func() { initVerifyLimit, initExecTimeout = oldBudget, oldTimeout }()
 }
 var pairs []string
 for _, c := range in.Checks { pairs = append(pairs, c[0], c[1]) }
 setup := []any{}
 for _, c := range in.Setup { setup = append(setup, c) }
 fix := []any{}
 for _, c := range in.Fix { fix = append(fix, c) }
 f := initNewFx(t, true, initSubmit(map[string]any{"setup": setup, "fix": fix, "checks": initCheckList(pairs...), "protect": []any{}}), initNothing())
 f.write("tracked", "original\\n")
 if len(in.Setup) > 0 { f.write("mix.exs", "defmodule App.MixProject do\\n  def project, do: [app: :app, deps: deps()]\\n  defp deps, do: [{:ecto, \\"~> 3.0\\"}]\\nend\\n") }
 f.commitAll("fixture")
 stdout, stderr := f.mustRun()
 data, err := json.Marshal(map[string]any{"stdout": stdout, "stderr": stderr})
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(filepath.Join(os.Getenv("RUN_END_RESULT")), data, 0o600); err != nil { t.Fatal(err) }
}
`;
const shim = `package setup
import "time"
// ProbeBudgetLine calls initBudgetLine for the scratch probe program.
func ProbeBudgetLine(labels []string, seconds []int, budget string) string {
 var runs []initRunTime
 for i, l := range labels { runs = append(runs, initRunTime{label: l, elapsed: time.Duration(seconds[i]) * time.Second}) }
 return initBudgetLine(runs, budget)
}
`;
const probeMain = `package main
import (
 "encoding/json"
 "fmt"
 "os"
 "github.com/KogenAI/kogen-setup/setup"
)
func main() {
 var in struct { Runs []struct { Label string; Seconds int }; Budget string }
 if err := json.Unmarshal([]byte(os.Args[1]), &in); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(2) }
 var labels []string
 var seconds []int
 for _, r := range in.Runs { labels = append(labels, r.Label); seconds = append(seconds, r.Seconds) }
 out, _ := json.Marshal(map[string]string{"line": setup.ProbeBudgetLine(labels, seconds, in.Budget)})
 fmt.Println(string(out))
}
`;
// The budget line is observed by a scratch program that calls the function, not by a named test.
function lineProbe(input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-end-line-'));
  try {
    for (const n of ['go.mod', 'go.sum', 'setup']) fs.cpSync(path.join(process.cwd(), n), path.join(dir, n), {recursive: true});
    fs.writeFileSync(path.join(dir, 'setup/zz_probe_shim.go'), shim);
    fs.mkdirSync(path.join(dir, 'runendprobe'));
    fs.writeFileSync(path.join(dir, 'runendprobe/main.go'), probeMain);
    const run = cp.spawnSync('go', ['run', './runendprobe', input], {cwd: dir, encoding: 'utf8', timeout: 270000});
    if (run.status !== 0) return {failed: `go run ./runendprobe outcome ${run.status}: ${run.stdout}\n${run.stderr}`};
    return JSON.parse(run.stdout);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function goDriver(name, source, input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-end-'));
  try {
    for (const n of ['go.mod', 'go.sum', 'setup']) fs.cpSync(path.join(process.cwd(), n), path.join(dir, n), {recursive: true});
    fs.writeFileSync(path.join(dir, 'setup/run_end_driver_test.go'), source);
    const result = path.join(dir, 'result.json');
    const run = cp.spawnSync('go', ['test', './setup', '-run', `^${name}$`, '-count=1'], {cwd: dir, env: {...process.env, RUN_END_INPUT: input, RUN_END_RESULT: result}, encoding: 'utf8', timeout: 270000});
    if (run.status !== 0 || !fs.existsSync(result)) return {failed: `${name}: go test ./setup -run ^${name}$ outcome ${run.status}: ${run.stdout}\n${run.stderr}`};
    return JSON.parse(fs.readFileSync(result, 'utf8'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function lines(w) { assert.ok(!w.run.failed, w.run.failed); return w.run.stderr.split('\n'); }
const {When, Then} = require('@cucumber/cucumber');
When(P + 'init runs with the proposal:', {timeout: 300000}, function (text) { this.run = goDriver(INIT_TEST, initDriver, text); });
When(P + 'the budget line is built for:', {timeout: 300000}, function (text) { this.run = lineProbe(text); });
Then(P + 'the progress lines appear in this order:', function (text) {
  const got = lines(this); let at = -1;
  for (const want of text.trim().split('\n')) {
    const i = got.indexOf(want, at + 1);
    assert.ok(i > at, `missing or out of order ${JSON.stringify(want)} after line ${at} in:\n${got.join('\n')}`);
    at = i;
  }
});
Then(P + 'no progress line starts with {string}', function (prefix) {
  const hit = lines(this).filter(l => l.startsWith(prefix));
  assert.deepEqual(hit, [], `unexpected lines in:\n${this.run.stderr}`);
});
Then(P + 'a progress line matches {string}', function (re) {
  assert.ok(lines(this).some(l => new RegExp(re).test(l)), `no line matches ${re} in:\n${this.run.stderr}`);
});
Then(P + 'exactly one progress line starts with {string} and it follows a line starting with {string}', function (prefix, before) {
  const got = lines(this);
  const hits = got.map((l, i) => l.startsWith(prefix) ? i : -1).filter(i => i >= 0);
  assert.equal(hits.length, 1, `lines starting with ${prefix}: ${hits.length} in:\n${this.run.stderr}`);
  const b = got.findIndex(l => l.startsWith(before));
  assert.ok(b >= 0 && b < hits[0], `${JSON.stringify(before)} must come before the budget line in:\n${this.run.stderr}`);
});
Then(P + 'the budget line is {string}', function (want) {
  assert.ok(!this.run.failed, this.run.failed);
  assert.equal(this.run.line, want);
});
