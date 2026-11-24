const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

function observe(actual, expected) {
  assert.deepEqual(actual, expected, 'Validate problems differ');
}

if (process.argv[2] === '--observer') {
  try {
    observe(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')),
      JSON.parse(fs.readFileSync(process.argv[4], 'utf8')));
    console.log('accepted');
  } catch (err) {
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  let binary;
  Given('init-detect-equals-url-option: the Validate driver is built', {timeout: 110000}, function () {
    if (binary) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-detect-equals-url-option-'));
    process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
    const target = path.join(dir, 'validate');
    const result = cp.spawnSync('go', ['build', '-o', target,
      'features/steps/init-detect-equals-url-option__driver/main.go'],
    {encoding: 'utf8', timeout: 100000});
    assert.equal(result.status, 0, `build Validate driver: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    binary = target;
  });
  function validate(command) {
    const result = cp.spawnSync(binary, [], {
      input: JSON.stringify({checks: [{name: 'probe', run: command}]}),
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, `Validate ${command}: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    this.equalsURLCommand = command;
    this.equalsURLProblems = JSON.parse(result.stdout);
  }
  When('init-detect-equals-url-option: Validate check {string}', {timeout: 15000}, validate);
  When('init-detect-equals-url-option: Validate {word} with an equals-form URL option containing {string}',
    {timeout: 15000}, function (command, value) {
      // Synthetic option spelling: only lexical option=value handling is under test.
      validate.call(this, `${command} --url=${value}`);
    });
  Then('init-detect-equals-url-option: problems equal:', function (text) {
    observe(this.equalsURLProblems, JSON.parse(text.replaceAll('<command>', this.equalsURLCommand)));
  });
}
