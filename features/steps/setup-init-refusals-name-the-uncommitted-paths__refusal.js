const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const {Given, When, Then} = require('@cucumber/cucumber');
const P = 'setup-init-refusals-name-the-uncommitted-paths: ';
const TEST = 'TestInitRefusalProbeDriver';
const COMMAND = `go test ./setup -run ^${TEST}$ -count=1`;
// The driver is written into a scratch copy of the project, so acceptance observes the
// refusal text itself and does not depend on any test the implementation adds.
const driver = `package setup

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func ${TEST}(t *testing.T) {
	var in struct {
		Commit    bool
		Committed [][2]string
		Writes    [][2]string
	}
	if err := json.Unmarshal([]byte(os.Getenv("REFUSAL_PROBE_INPUT")), &in); err != nil {
		t.Fatal(err)
	}
	var f *initFx
	if in.Commit {
		f = initNewFx(t, true, initNothing())
	} else {
		f = initNewFx(t, false)
	}
	for _, w := range in.Committed {
		f.write(w[0], w[1])
	}
	if len(in.Committed) > 0 {
		f.commitAll("fixture")
	}
	for _, w := range in.Writes {
		f.write(w[0], w[1])
	}
	exit, _, _, err := f.run("")
	res := map[string]any{"exit": exit, "wroteKogen": f.exists(".kogen"), "requests": len(f.requests())}
	if e, ok := sys.AsError(err); ok {
		res["class"], res["reason"], res["detail"] = e.Class, e.Reason, e.Detail
	}
	data, err := json.Marshal(res)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("REFUSAL_PROBE_RESULT"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;

Given(P + 'a repository whose only commit contains the file {string}', function (name) {
  this.spec = {commit: true, committed: [[name, 'x']], writes: []};
});
Given(P + 'a repository without commits', function () {
  this.spec = {commit: false, committed: [], writes: []};
});
Given(P + 'the files {string} are written with the content {string}', function (names, content) {
  for (const n of names.split(', ')) this.spec.writes.push([n, content]);
});
When(P + 'kogen init is run', {timeout: 300000}, function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-refusal-'));
  try {
    for (const name of ['go.mod', 'go.sum', 'setup']) fs.cpSync(path.join(process.cwd(), name), path.join(dir, name), {recursive: true});
    fs.writeFileSync(path.join(dir, 'setup/zz_refusal_probe_driver_test.go'), driver);
    const result = path.join(dir, 'result.json');
    const run = cp.spawnSync('go', ['test', './setup', '-run', `^${TEST}$`, '-count=1'], {cwd: dir, env: {...process.env, REFUSAL_PROBE_INPUT: JSON.stringify(this.spec), REFUSAL_PROBE_RESULT: result}, encoding: 'utf8', timeout: 270000});
    assert.equal(run.status, 0, `${TEST}: ${COMMAND} outcome ${run.status}: ${run.stdout}\n${run.stderr}`);
    assert.ok(fs.existsSync(result), `${TEST} absent/skipped/ran zero times: ${COMMAND} wrote no result: ${run.stdout}`);
    this.refusal = JSON.parse(fs.readFileSync(result, 'utf8'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
Then(P + 'init is refused as {string} with reason {string} and exit code {int}', function (cls, reason, exit) {
  const r = this.refusal;
  assert.deepStrictEqual({class: r.class, reason: r.reason, exit: r.exit}, {class: cls, reason, exit}, `refusal: ${JSON.stringify(r)}`);
  assert.equal(r.wroteKogen, false, 'a refused init wrote .kogen');
  assert.equal(r.requests, 0, 'a refused init made a model request');
});
Then(P + 'the refusal detail is:', function (text) {
  assert.equal(this.refusal.detail, text);
});
