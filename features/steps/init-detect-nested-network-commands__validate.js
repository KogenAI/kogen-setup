const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function observe(actual, expected) {
  assert.deepStrictEqual(JSON.parse(actual), JSON.parse(expected), 'Validate problems differ');
}

if (process.argv[2] === '--observe') {
  try {
    observe(fs.readFileSync(process.argv[3], 'utf8'), process.argv[4]);
    console.log('accepted');
  } catch (err) {
    if (err.code !== 'ERR_ASSERTION') throw err;
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  let binary;
  Given('init-detect-nested-network-commands: the Validate driver is built', {timeout: 110000}, function () {
    if (binary) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-detect-nested-network-commands-'));
    process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
    const target = path.join(dir, 'validate');
    execFileSync('go', ['build', '-o', target, 'features/steps/init-detect-nested-network-commands__driver/main.go'],
      {encoding: 'utf8', timeout: 100000});
    binary = target;
  });
  When('init-detect-nested-network-commands: Validate receives:', {timeout: 15000}, function (json) {
    this.nestedNetworkProblems = execFileSync(binary, [], {input: json, encoding: 'utf8', timeout: 10000});
  });
  Then('init-detect-nested-network-commands: the problems are:', function (expected) {
    observe(this.nestedNetworkProblems, expected);
  });
}
