const { Then } = require('@cucumber/cucumber');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

Then('k-setup-loop-module-path: command succeeds', { timeout: 240000 }, function (command) {
  const result = spawnSync('/bin/sh', ['-c', command], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 230000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${command}\n${result.error || ''}\n${result.stdout || ''}${result.stderr || ''}`);
});
