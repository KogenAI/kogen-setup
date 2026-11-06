'use strict';
// Runs this repository's consumer test of kogen-coordinator, TestRepositoryAndConfig
// (consumes/kogen-coordinator), against the kogen-coordinator that go.mod pins, or against a given
// kogen-coordinator version through a temporary go.mod (`go test -modfile=<tmp>/go.mod`), so the
// checkout's go.mod and go.sum are never changed. It also checks the pin lines, that no Go file trims
// the models template from a rendered configuration, and the two READMEs.
//
// Run directly (`node <this file> <kogen-coordinator version>`) it runs TestRepositoryAndConfig
// against that version, prints one result line (and, on failure, the test's first failure line) and
// exits 0 only when the test passed: the observer controls of the Intent's Feasibility.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const P = 's-consumes-c-models-only-in-models-yaml: ';
const MODULE = 'github.com/KogenAI/kogen-coordinator';
const TEST = 'TestRepositoryAndConfig';
const PKG = './consumes/kogen-coordinator/';
const TEST_ARGS = ['-count=1', '-v', '-run', '^' + TEST + '$', PKG];
// The go.sum lines of the kogen-coordinator versions the temporary go.mod can require.
const SUMS = {
  'v0.0.0-20261104081556-2a74649374bb': ['h1:jLKlxflW5ARAW/H0Lz/x4DMjJbzRml7cGiap5JzWnZA=', 'h1:MMc15p3YwlY71dMxfCdX6QlR2jXJbSxL6YA9Y7971c8='],
  'v0.0.0-20261106110407-d74daae36f56': ['h1:8VmqsU9EArCYwqOTw8e9uuS54nRSlUHSUaDl8W+lYqs=', 'h1:MMc15p3YwlY71dMxfCdX6QlR2jXJbSxL6YA9Y7971c8='],
};

// env is the caller's environment without Go flags, a Go workspace or the acceptance report
// variables; every run names its -mod mode itself.
function env() {
  const e = {...process.env, GOWORK: 'off'};
  for (const k of ['GOFLAGS', 'KOGEN_ACCEPTANCE_REPORT', 'KOGEN_ACCEPTANCE_FEATURES']) delete e[k];
  return e;
}
function goTest(flags, label) {
  const args = ['test', ...flags, ...TEST_ARGS];
  const r = cp.spawnSync('go', args, {cwd: ROOT, env: env(), encoding: 'utf8', timeout: 540000, maxBuffer: 64 * 1024 * 1024});
  const output = (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '');
  const passed = r.status === 0 && new RegExp('^--- PASS: ' + TEST + ' \\(', 'm').test(output) &&
    new RegExp('^ok\\s+github\\.com/KogenAI/kogen-setup/consumes/kogen-coordinator\\s', 'm').test(output);
  const failed = r.status !== 0 && new RegExp('^--- FAIL: ' + TEST + ' \\(', 'm').test(output);
  return {label, command: 'go ' + args.join(' '), status: r.status, signal: r.signal, passed, failed, output};
}
// runPinned runs the test against the checkout's go.mod and go.sum, which it must not change.
function runPinned() { return goTest(['-mod=readonly'], 'the kogen-coordinator that go.mod pins'); }
// runVersion runs the test with a temporary go.mod that requires kogen-coordinator at version.
function runVersion(version) {
  assert.ok(SUMS[version], `no go.sum lines known for ${MODULE} ${version}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-consumes-coordinator-'));
  try {
    const mod = fs.readFileSync(path.join(ROOT, 'go.mod'), 'utf8');
    const re = new RegExp('^(\\s*)' + MODULE.replace(/[./]/g, '\\$&') + ' v\\S+$', 'm');
    assert.match(mod, re, `go.mod does not require ${MODULE}`);
    fs.writeFileSync(path.join(tmp, 'go.mod'), mod.replace(re, `$1${MODULE} ${version}`));
    const sum = fs.readFileSync(path.join(ROOT, 'go.sum'), 'utf8').split('\n').filter((l) => l && !l.startsWith(MODULE + ' '));
    sum.push(`${MODULE} ${version} ${SUMS[version][0]}`, `${MODULE} ${version}/go.mod ${SUMS[version][1]}`);
    fs.writeFileSync(path.join(tmp, 'go.sum'), sum.join('\n') + '\n');
    return goTest(['-mod=mod', '-modfile=' + path.join(tmp, 'go.mod')], `${MODULE} ${version}`);
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
function failureLine(output) {
  const m = output.match(/^\s*(coordinator_test\.go:\d+: .*)$/m);
  return m ? m[1] : '';
}
function describe(r) {
  return `${TEST} against ${r.label}: ${r.command} exited ${r.status}${r.signal ? ' (' + r.signal + ')' : ''}; output:\n${r.output}`;
}
function goFiles(dir, out) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git', '.kogen', 'node_modules'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) goFiles(p, out);
    else if (e.isFile() && e.name.endsWith('.go')) out.push(p);
  }
  return out;
}

if (require.main === module) {
  const version = process.argv[2];
  const r = runVersion(version);
  const outcome = r.passed ? 'passed' : r.failed ? 'failed' : 'did not run';
  process.stdout.write(`${TEST} against ${MODULE} ${version}: ${outcome}\n`);
  if (!r.passed) {
    const line = failureLine(r.output);
    process.stdout.write((line || r.output.trim()) + '\n');
  }
  process.exit(r.passed ? 0 : 1);
} else {
  const {When, Then} = require('@cucumber/cucumber');

  When(P + 'TestRepositoryAndConfig runs against the kogen-coordinator that go.mod pins', {timeout: 600000}, function () {
    this.scmRun = runPinned();
  });
  When(P + 'TestRepositoryAndConfig runs against kogen-coordinator {string}', {timeout: 600000}, function (version) {
    this.scmRun = runVersion(version);
  });
  Then(P + 'TestRepositoryAndConfig passed', function () {
    assert.ok(this.scmRun.passed, `${TEST} did not pass (expected --- PASS: ${TEST} and ok for ${PKG}). ${describe(this.scmRun)}`);
  });
  Then(P + 'TestRepositoryAndConfig failed with {string}', function (message) {
    const r = this.scmRun;
    assert.ok(r.failed, `${TEST} did not fail (expected --- FAIL: ${TEST}). ${describe(r)}`);
    assert.ok(r.output.includes(message), `${TEST} failed without the message ${JSON.stringify(message)}. ${describe(r)}`);
  });
  Then(P + 'go.mod requires {string}', function (line) {
    const mod = fs.readFileSync(path.join(ROOT, 'go.mod'), 'utf8');
    assert.ok(mod.split('\n').some((l) => l.trim() === line), `go.mod has no require line ${JSON.stringify(line)}:\n${mod}`);
  });
  Then(P + 'go.sum lists exactly these kogen-coordinator lines:', function (text) {
    const lines = fs.readFileSync(path.join(ROOT, 'go.sum'), 'utf8').split('\n').filter((l) => l.startsWith(MODULE + ' '));
    assert.deepEqual(lines, text.split('\n').map((l) => l.trim()).filter(Boolean), `go.sum ${MODULE} lines`);
  });
  Then(P + 'no Go file trims the models template from a rendered configuration', function () {
    const found = [];
    for (const file of goFiles(ROOT, [])) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((l, i) => {
        if (l.includes('TrimSuffix(') && l.includes('ModelsTemplate()')) found.push(`${path.relative(ROOT, file)}:${i + 1}: ${l.trim()}`);
      });
    }
    assert.deepEqual(found, [], `Go lines that trim project.ModelsTemplate() from a rendered configuration:\n${found.join('\n')}`);
  });
  Then(P + '{string} contains {string}', function (file, text) {
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(body.includes(text), `${file} does not contain ${JSON.stringify(text)}`);
  });
  Then(P + '{string} does not contain {string}', function (file, text) {
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const at = body.split('\n').findIndex((l) => l.includes(text));
    assert.equal(at, -1, `${file}:${at + 1} still contains ${JSON.stringify(text)}`);
  });
}
