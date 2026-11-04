const { Then } = require('@cucumber/cucumber');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

Then('k-setup-models-file: this command succeeds', { timeout: 240000 }, function (command) {
  const run = spawnSync('/bin/sh', ['-c', command], {
    cwd: process.cwd(), env: process.env, encoding: 'utf8',
    timeout: 230000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `${command}\n${run.error || ''}\n${run.stdout || ''}${run.stderr || ''}`);
});
