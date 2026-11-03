// Steps for k-setup-fix-command-unverified: `kogen init` (setup.Init) on a synthetic repository
// whose only file is README.md, with a loopback model proposing fix commands and checks. The Go
// program features/steps/testdata/init_harness.go runs Init and reports what it did as JSON.
const { Given, When, Then, AfterAll } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
let harness = null;
let harnessDir = null;

function buildHarness() {
  if (harness) return harness;
  harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-init-harness-bin-'));
  const out = path.join(harnessDir, 'init_harness');
  try {
    execFileSync('go', ['build', '-o', out, './features/steps/testdata/init_harness.go'], { cwd: root, stdio: 'pipe' });
  } catch (e) {
    throw new Error(`go build ./features/steps/testdata/init_harness.go failed (status ${e.status}):\n${e.stdout}${e.stderr}`);
  }
  harness = out;
  return harness;
}

AfterAll(function () {
  if (harnessDir) fs.rmSync(harnessDir, { recursive: true, force: true });
});

function lines(text) {
  return text.split('\n').filter((l) => l !== '');
}

Given('the model proposes the fix commands:', function (table) {
  this.fix = table.raw().map((row) => row[0]);
});

Given('the model proposes no fix command', function () {
  this.fix = [];
});

Given('the model proposes the check {string} running {string}', function (name, run) {
  this.checks = (this.checks || []).concat([{ name, run }]);
});

When('kogen init runs on a repository whose only file is README.md', { timeout: 300000 }, function () {
  const spec = JSON.stringify({ fix: this.fix || [], checks: this.checks || [] });
  let out;
  try {
    out = execFileSync(buildHarness(), [spec], { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 240000 });
  } catch (e) {
    throw new Error(`init_harness ${spec} failed (status ${e.status}):\n${e.stdout}${e.stderr}`);
  }
  this.result = JSON.parse(out);
});

Then('init exits with status {int}', function (status) {
  assert.equal(this.result.exit, status, `exit ${this.result.exit}, error ${JSON.stringify(this.result.error)}\nstdout:\n${this.result.stdout}\nstderr:\n${this.result.stderr}`);
  assert.equal(this.result.error, '');
});

Then('stdout is:', function (text) {
  assert.equal(this.result.stdout, text + '\n');
});

Then('the {string} line contains {string}', function (prefix, part) {
  const found = lines(this.result.stdout).filter((l) => l.startsWith(prefix + ' '));
  assert.equal(found.length, 1, `stdout has ${found.length} "${prefix}" lines:\n${this.result.stdout}`);
  assert.ok(found[0].includes(part), `"${found[0]}" does not contain "${part}"`);
});

Then('the {string} line does not contain {string}', function (prefix, part) {
  for (const l of lines(this.result.stdout).filter((x) => x.startsWith(prefix + ' '))) {
    assert.ok(!l.includes(part), `"${l}" contains "${part}"`);
  }
});

Then('stdout has no {string} line', function (prefix) {
  const found = lines(this.result.stdout).filter((l) => l.startsWith(prefix + ' '));
  assert.deepEqual(found, [], `stdout:\n${this.result.stdout}`);
});

Then('project.yaml lists the fix commands:', function (table) {
  assert.deepEqual(this.result.fix, table.raw().map((row) => row[0]), `project.yaml:\n${this.result.config}`);
});

Then('project.yaml lists no fix command', function () {
  assert.deepEqual(this.result.fix, [], `project.yaml:\n${this.result.config}`);
});

Then('project.yaml lists the checks:', function (table) {
  assert.deepEqual(this.result.checks, table.raw().map((row) => row[0]), `project.yaml:\n${this.result.config}`);
});

Then('project.yaml contains the line {string}', function (line) {
  assert.ok(this.result.config.split('\n').includes(line), `project.yaml lacks ${JSON.stringify(line)}:\n${this.result.config}`);
});

Then('stderr contains the line {string}', function (line) {
  assert.ok(this.result.stderr.split('\n').includes(line), `stderr lacks ${JSON.stringify(line)}:\n${this.result.stderr}`);
});

Then('stderr has the line {string} before the line {string}', function (first, second) {
  const all = this.result.stderr.split('\n');
  const i = all.indexOf(first);
  const j = all.indexOf(second);
  assert.ok(i >= 0 && j >= 0 && i < j, `want ${JSON.stringify(first)} before ${JSON.stringify(second)} in stderr:\n${this.result.stderr}`);
});

Then('stderr has no line starting with {string}', function (prefix) {
  const found = this.result.stderr.split('\n').filter((l) => l.startsWith(prefix));
  assert.deepEqual(found, [], `stderr:\n${this.result.stderr}`);
});

Then('the fix commands wrote to the fix log, in order:', function (table) {
  assert.notEqual(this.result.fixLog, null, `no fix command wrote to $FIX_LOG; stderr:\n${this.result.stderr}`);
  assert.deepEqual(lines(this.result.fixLog), table.raw().map((row) => row[0]));
});

Then('the repository still has README.md {string} and a clean working tree', function (readme) {
  assert.equal(this.result.readme, readme + '\n');
  assert.equal(this.result.status, '', `git status --porcelain --untracked-files=all:\n${this.result.status}`);
});
