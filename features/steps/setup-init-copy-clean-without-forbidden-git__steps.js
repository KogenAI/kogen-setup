'use strict';
const { Given, Then, setDefaultTimeout } = require('@cucumber/cucumber');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

setDefaultTimeout(115000);

const root = process.cwd();
const shipped = '20261118001611';

function pinned() {
  const mod = fs.readFileSync(path.join(root, 'go.mod'), 'utf8');
  const m = mod.match(/github\.com\/KogenAI\/kogen-coordinator v0\.0\.0-(\d{14})-([0-9a-f]{12})/);
  assert.ok(m, 'go.mod has no kogen-coordinator pseudo-version');
  return m;
}

Given('setup-init-copy-clean-without-forbidden-git: the kogen-setup checkout', function () {
  assert.ok(fs.existsSync(path.join(root, 'go.mod')), 'go.mod missing in ' + root);
});

Then('setup-init-copy-clean-without-forbidden-git: go.mod pins kogen-coordinator at e643661cb646 or newer', function () {
  const m = pinned();
  assert.ok(m[1] >= shipped, 'kogen-coordinator pinned at ' + m[1] + '-' + m[2] + ', older than e643661cb646 (' + shipped + ')');
});

Then('setup-init-copy-clean-without-forbidden-git: no setup source sends a forbidden command to the guarded runner', function () {
  const dir = path.join(root, 'setup');
  const re = /\.(Run|RunEnv|OK|OKEnv)\([^)]*"(clean|restore|reset|checkout|symbolic-ref|worktree|remote)"/;
  const bad = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.go') || name.endsWith('_test.go')) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    if (re.test(text) || /"clean", "-ffdx"/.test(text)) bad.push(name);
  }
  assert.deepStrictEqual(bad, [], 'forbidden Git command sent to the guarded runner in: ' + bad.join(', '));
});

Then('setup-init-copy-clean-without-forbidden-git: the module resolves the shipped coordinator and the existing init cleanup tests pass', function () {
  const list = spawnSync('go', ['list', '-m', 'github.com/KogenAI/kogen-coordinator'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  const resolved = (list.stdout || '').match(/-(\d{14})-[0-9a-f]{12}/);
  assert.ok(resolved && resolved[1] >= shipped, 'go list -m resolved kogen-coordinator to ' + (list.stdout || list.stderr).trim() + ', older than e643661cb646');
  const filter = 'TestInitCheckCleanupOnRejectionAndSuccess|TestInitCheckCleanupUsesBaselineIgnoreRules';
  const r = spawnSync('go', ['test', './setup', '-run', filter, '-count=1', '-v'], { cwd: root, encoding: 'utf8', timeout: 110000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.strictEqual(r.status, 0, 'go test ./setup -run ' + filter + ' exited ' + r.status + ':\n' + out.slice(-3000));
  for (const name of filter.split('|')) {
    assert.ok(out.includes('--- PASS: ' + name), name + ' did not pass in go test ./setup -run ' + filter + ':\n' + out.slice(-3000));
  }
});
