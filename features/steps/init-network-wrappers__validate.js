const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

function observe(actual, expected) {
  assert.deepEqual(actual, expected, 'Validate problems differ');
}

if (process.argv[2] === '--observer') {
  const expected = ['check probe (curl https://example.invalid/x) contacts a remote host; checks must not depend on the network'];
  const actual = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  try {
    observe(actual, expected);
    console.log('accepted');
  } catch (err) {
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  let binary;
  Given('init-network-wrappers: the Validate driver is built', {timeout: 110000}, function () {
    if (binary) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-network-wrappers-'));
    process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
    const target = path.join(dir, 'validate');
    const result = cp.spawnSync('go', ['build', '-o', target, 'features/steps/init-network-wrappers__driver/main.go'], {encoding: 'utf8', timeout: 100000});
    assert.equal(result.status, 0, `build Validate driver: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    binary = target;
  });
  When('init-network-wrappers: Validate {string} as {word}', {timeout: 15000}, function (command, role) {
    assert.ok(role === 'check' || role === 'fix', `unknown role ${role}`);
    const args = role === 'check' ? {checks: [{name: 'probe', run: command}]} : {fix: [command]};
    const result = cp.spawnSync(binary, [], {input: JSON.stringify(args), encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, `Validate ${role} ${command}: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    this.initNetworkProblems = JSON.parse(result.stdout);
  });
  Then('init-network-wrappers: problems equal:', function (text) {
    observe(this.initNetworkProblems, JSON.parse(text));
  });
}
