const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

Then('k-consumes-setup: go test succeeds for {string}', { timeout: 240000 }, function (pkg) {
  const r = spawnSync('go', ['test', '-count=1', pkg], { encoding: 'utf8', timeout: 230000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, `go test -count=1 ${pkg}: ${r.error || ''}\n${r.stdout || ''}${r.stderr || ''}`);
});

Then('k-consumes-setup: the consumption audit exists at {string}', function (file) {
  assert.ok(fs.readFileSync(file, 'utf8').trim().length > 0, `${file} must document the complete production source-to-assertion audit required by the Intent`);
});

Then('k-consumes-setup: the original file digest is {string}', function (expected) {
  const paths = [
    'cmd/kogen-setup/main.go',
    'features/steps/testdata/init_harness.go',
    'go.mod',
    'go.sum',
    'setup/conversation.go',
    'setup/init.go',
    'setup/init_route.go',
    'setup/overlap.go',
    'setup/policy.go',
  ];
  const h = crypto.createHash('sha256');
  for (const p of paths) {
    h.update(p); h.update('\0'); h.update(fs.readFileSync(p)); h.update('\0');
  }
  assert.equal(h.digest('hex'), expected, 'Production and pinned module bytes must remain unchanged; this check reads only the working tree');
});
