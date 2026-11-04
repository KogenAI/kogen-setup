const {Then} = require('@cucumber/cucumber');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
Then('k-setup-setup-fix-same-command: existing init tests pass', {timeout:300000}, function() {
  const r = cp.spawnSync('go',['test','./setup','-count=1'],{encoding:'utf8',timeout:270000});
  assert.equal(r.status,0,`go test ./setup -count=1 failed: ${r.stdout}\n${r.stderr}`);
});
