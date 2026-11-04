const {Then} = require('@cucumber/cucumber');
const {execFileSync} = require('node:child_process');
Then('k-setup-written-config-matches-verified: existing init tests stay green', {timeout:180000}, function () {
  execFileSync('go', ['test', './setup', '-count=1'], {cwd:process.cwd(), timeout:170000, stdio:'pipe'});
});
