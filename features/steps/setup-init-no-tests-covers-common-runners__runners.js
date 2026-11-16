const { When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PREFIX = 'setup-init-no-tests-covers-common-runners: ';
const DRIVER = 'features/steps/setup-init-no-tests-covers-common-runners__driver/driver_test.go.txt';

// Runs one driver test in a scratch copy of the checkout, so the unexported classifier and the init fixtures are reachable.
function drive(testName, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-tests-runners-'));
  try {
    fs.cpSync(process.cwd(), dir, { recursive: true, filter: (p) => !p.includes('/.git') && !p.includes('/node_modules') });
    fs.copyFileSync(path.join(process.cwd(), DRIVER), path.join(dir, 'setup/zz_runners_driver_test.go'));
    const result = path.join(dir, 'runners-result.json');
    const run = cp.spawnSync('go', ['test', './setup', '-run', `^${testName}$`, '-count=1'], {
      cwd: dir, env: { ...process.env, ...env, RUNNERS_RESULT: result }, encoding: 'utf8', timeout: 110000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(run.status, 0, `go test ./setup -run ${testName} failed:\n${run.stdout}\n${run.stderr}`);
    return JSON.parse(fs.readFileSync(result, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The label of an init output line: its text up to the first colon.
function label(line) {
  const at = line.indexOf(':');
  return at === -1 ? '(no label)' : line.slice(0, at + 1);
}

When(PREFIX + 'initRanNoTests classifies these outputs:', function (table) {
  const rows = table.hashes();
  const answers = drive('TestRunnersDriverClassify', { RUNNERS_OUTPUTS: JSON.stringify(rows.map((r) => r.output)) });
  this.rows = rows.map((r, i) => ({ output: r.output, want: r['no tests'], got: String(answers[i]) }));
});

Then(PREFIX + 'every output is classified as expected', function () {
  const bad = this.rows.filter((r) => r.want !== r.got);
  assert.deepEqual(bad, [], `initRanNoTests answered differently from the expected "no tests" column:\n${JSON.stringify(bad, null, 1)}`);
});

When(PREFIX + 'kogen init verifies the check "minitest" running:', function (command) {
  this.init = drive('TestRunnersDriverInit', { RUNNERS_COMMAND: command.trim() });
});

Then(PREFIX + 'init left the check out with these output lines:', function (text) {
  assert.equal(this.init.exit, 0, `init exit ${this.init.exit}`);
  const lines = this.init.stdout.split('\n');
  for (const want of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    assert.ok(lines.includes(want), `init stdout lacks the expected ${label(want)} line; its line labels are ${JSON.stringify(lines.map(label))}`);
  }
  assert.equal(this.init.checks, 0, `the written configuration kept ${this.init.checks} check(s)`);
});
