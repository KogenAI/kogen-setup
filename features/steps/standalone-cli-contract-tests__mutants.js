const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {When, Then, After} = require('@cucumber/cucumber');

const PKG = './cmd/kogen-setup';
const MAIN = 'cmd/kogen-setup/main.go';

// Each mutation is a plausible wrong command: [text in main.go, replacement].
const MUTATIONS = {
  'usage on stdout': ['fmt.Fprintln(os.Stderr, "usage: kogen-setup <checkout>")', 'fmt.Fprintln(os.Stdout, "usage: kogen-setup <checkout>")'],
  'configuration content altered': ['Content: string(content)}', 'Content: string(content) + "# extra\\n"}'],
  'human output on stdout': ['s.Stdout, s.Stderr = os.Stderr, os.Stderr', 's.Stdout, s.Stderr = os.Stdout, os.Stderr'],
  'diagnostic on stdout': ['fmt.Fprint(os.Stderr, se.Render())', 'fmt.Fprint(os.Stdout, se.Render())'],
  'error dropped': ['r.Error = &message', '_ = message'],
};

function copyTree(src, dst) {
  fs.cpSync(src, dst, {recursive: true, filter: (p) => !['.git', 'node_modules'].includes(path.basename(p))});
}

function goTest(world, dir) {
  const run = cp.spawnSync('go', ['test', '-count=1', '-v', PKG], {cwd: dir, env: process.env, encoding: 'utf8', timeout: 100000});
  if (run.error) throw run.error;
  world.goTestRun = run;
  world.goTestOutput = `go test -count=1 -v ${PKG} (exit ${run.status}):\n${run.stdout}${run.stderr}`;
}

When('standalone-cli-contract-tests: the cmd\\/kogen-setup tests run against the unchanged command', function() {
  this.scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-cli-'));
  const dir = path.join(this.scratch, 'tree');
  copyTree(process.cwd(), dir);
  goTest(this, dir);
});

When(/^standalone-cli-contract-tests: the cmd\/kogen-setup tests run against a command with (.+)$/, function(name) {
  const mutation = MUTATIONS[name];
  assert.ok(mutation, `unknown mutation ${name}`);
  this.scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-cli-'));
  const dir = path.join(this.scratch, 'tree');
  copyTree(process.cwd(), dir);
  const file = path.join(dir, MAIN);
  const original = fs.readFileSync(file, 'utf8');
  assert.ok(original.includes(mutation[0]), `${MAIN} no longer contains ${mutation[0]}`);
  fs.writeFileSync(file, original.replace(mutation[0], mutation[1]));
  goTest(this, dir);
});

Then('standalone-cli-contract-tests: the tests pass and at least 3 of them ran', function() {
  assert.equal(this.goTestRun.status, 0, this.goTestOutput);
  const passed = (this.goTestRun.stdout.match(/^--- PASS: /gm) || []).length;
  assert.ok(passed >= 3, `${passed} tests passed, want at least 3\n${this.goTestOutput}`);
  const diff = cp.spawnSync('git', ['diff', '--quiet', 'HEAD', '--', MAIN], {cwd: process.cwd()});
  assert.equal(diff.status, 0, `${MAIN} differs from HEAD: production behavior is out of scope`);
});

Then('standalone-cli-contract-tests: a test fails', function() {
  assert.notEqual(this.goTestRun.status, 0, `the tests accepted the wrong command\n${this.goTestOutput}`);
  assert.match(this.goTestRun.stdout, /^--- FAIL: /m, `exit was nonzero without a failing test (build or setup problem?)\n${this.goTestOutput}`);
});

After(function() { if (this.scratch) fs.rmSync(this.scratch, {recursive: true, force: true}); });
