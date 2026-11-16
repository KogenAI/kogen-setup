const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

const prefix = 'setup-init-invalid-refusal-names-problems: ';
const detail = 'the model did not return a valid configuration; nothing was written';

// The driver is a Go test the step adds to a copy of the setup package: the Intent's own
// tests are written by the Build, so acceptance brings its own scripted init runs.
const driver = `package setup

import (
	"encoding/json"
	"fmt"
	"strconv"
	"testing"
)

func acceptInvalidRefusalRun(t *testing.T, label string, script ...initSSE) {
	t.Helper()
	f := initNewFx(t, true, script...)
	f.write("notes.txt", "x\\n")
	f.commitAll("a")
	head := f.head()
	e := f.wantError("provider", "init_invalid", 4)
	if e.Detail != ${JSON.stringify(detail)} || f.exists(".kogen") || f.head() != head || f.dirtyPaths() != "" {
		t.Fatalf("%v %q", e, f.dirtyPaths())
	}
	if len(f.requests()) != 2 {
		t.Fatalf("%d requests", len(f.requests()))
	}
	b, _ := json.Marshal(e.Lines)
	fmt.Printf("ACCEPT-LINES %s %s\\n", label, b)
}

func acceptInvalidRefusalInvalid(field string) initSSE {
	args := map[string]any{"setup": []any{}, "fix": []any{}, "checks": []any{}, "protect": []any{}}
	args[field] = "no"
	return initSubmit(args)
}

func TestAcceptInvalidRefusalSameTwice(t *testing.T) {
	bad := acceptInvalidRefusalInvalid("setup")
	acceptInvalidRefusalRun(t, "same-twice", bad, bad)
}

func TestAcceptInvalidRefusalOtherSecond(t *testing.T) {
	acceptInvalidRefusalRun(t, "other-second", acceptInvalidRefusalInvalid("setup"), acceptInvalidRefusalInvalid("fix"))
}

func TestAcceptInvalidRefusalNoCallSecond(t *testing.T) {
	acceptInvalidRefusalRun(t, "no-call-second", acceptInvalidRefusalInvalid("setup"), initAnswerText("I think the project is fine."))
}

func acceptInvalidRefusalBound(t *testing.T, label string, n int) {
	var problems []string
	for i := 1; i <= n; i++ {
		problems = append(problems, "problem "+strconv.Itoa(i))
	}
	e := initInvalidError(problems)
	if e.Class != "provider" || e.Reason != "init_invalid" || e.Exit != 4 || e.Detail != ${JSON.stringify(detail)} {
		t.Fatalf("%v", e)
	}
	b, _ := json.Marshal(e.Lines)
	fmt.Printf("ACCEPT-LINES %s %s\\n", label, b)
}

func TestAcceptInvalidRefusalBoundSeven(t *testing.T) { acceptInvalidRefusalBound(t, "seven", 7) }

func TestAcceptInvalidRefusalBoundSix(t *testing.T) { acceptInvalidRefusalBound(t, "six", 6) }
`;

// Until the Build adds initInvalidError the driver gets this stand-in with the old behavior (the
// refusal without lines), so the driver tests compile and run and the lines step fails.
const shim = `package setup

import "github.com/KogenAI/kogen-loop/sys"

func initInvalidError(problems []string) *sys.Error {
	return sys.Fail("provider", "init_invalid", ${JSON.stringify(detail)}, 4)
}
`;

const runs = {
  'the same invalid answer twice': {test: 'TestAcceptInvalidRefusalSameTwice', label: 'same-twice'},
  'an invalid answer, then an invalid answer with a different reason': {test: 'TestAcceptInvalidRefusalOtherSecond', label: 'other-second'},
  'an invalid answer, then an answer without the call': {test: 'TestAcceptInvalidRefusalNoCallSecond', label: 'no-call-second'},
  '7': {test: 'TestAcceptInvalidRefusalBoundSeven', label: 'seven'},
  '6': {test: 'TestAcceptInvalidRefusalBoundSix', label: 'six'},
};

// Runs the driver test on a copy of the project's setup package; the root is the tree under check.
function runDriver(root, spec) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'invalid-refusal-'));
  try {
    for (const name of ['go.mod', 'go.sum', 'setup']) fs.cpSync(path.join(root, name), path.join(tmp, name), {recursive: true});
    fs.writeFileSync(path.join(tmp, 'setup', 'zz_accept_invalid_refusal_test.go'), driver);
    const sources = fs.readdirSync(path.join(tmp, 'setup')).filter(n => n.endsWith('.go') && !n.endsWith('_test.go')).map(n => fs.readFileSync(path.join(tmp, 'setup', n), 'utf8')).join('\n');
    if (!/func initInvalidError\(/.test(sources)) fs.writeFileSync(path.join(tmp, 'setup', 'zz_accept_invalid_refusal_shim.go'), shim);
    const args = ['test', './setup', '-count=1', '-v', '-run', `^${spec.test}$`];
    const run = cp.spawnSync('go', args, {cwd: tmp, encoding: 'utf8', timeout: 110000});
    return {command: `go ${args.join(' ')}`, status: run.status, output: `${run.error || ''}${run.stdout || ''}${run.stderr || ''}`, spec};
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}

When(prefix + 'init is refused after the scripted answers {string}', {timeout: 115000}, function (answers) {
  assert.ok(runs[answers], `unknown scripted answers ${answers}`);
  this.invalidRefusal = runDriver(process.cwd(), runs[answers]);
});

When(prefix + 'the refusal is built from {int} problems', {timeout: 115000}, function (count) {
  assert.ok(runs[String(count)], `unknown problem count ${count}`);
  this.invalidRefusal = runDriver(process.cwd(), runs[String(count)]);
});

Then(prefix + 'the refusal lines are exactly', function (table) {
  const r = this.invalidRefusal;
  assert.ok(r, 'no driver run');
  assert.equal(r.status, 0, `${r.command} must pass (class provider, reason init_invalid, exit 4, detail ${JSON.stringify(detail)}, nothing written, two requests), exit ${r.status}:\n${r.output}`);
  assert.ok(r.output.includes(`--- PASS: ${r.spec.test} `), `${r.command}: ${r.spec.test} did not run and pass:\n${r.output}`);
  const found = r.output.split('\n').find(l => l.startsWith(`ACCEPT-LINES ${r.spec.label} `));
  assert.ok(found, `${r.command}: the driver printed no lines for ${r.spec.label}:\n${r.output}`);
  const lines = JSON.parse(found.slice(`ACCEPT-LINES ${r.spec.label} `.length)) || [];
  assert.deepEqual(lines, table.raw().map(row => row[0]), `refusal lines of ${r.spec.label}; ${r.command} printed:\n${r.output}`);
});
