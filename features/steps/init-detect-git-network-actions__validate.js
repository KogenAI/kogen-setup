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
    observe(process.argv[3], process.argv[4]);
    console.log('accepted');
  } catch (err) {
    if (err.code !== 'ERR_ASSERTION') throw err;
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const gitEnv = {...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
  let binary;
  let root;
  Given('init-detect-git-network-actions: the driver and local Git fixture are ready', {timeout: 110000}, function () {
    if (binary) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-detect-git-network-actions-'));
    process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
    root = path.join(dir, 'repository');
    const git = (...args) => execFileSync('git', args, {env: gitEnv, timeout: 2000});
    git('init', '-q', root);
    git('init', '-q', '--bare', path.join(root, 'origin'));
    git('init', '-q', '--bare', path.join(root, 'repo.git'));
    git('-C', root, 'remote', 'add', 'origin', 'https://example.invalid/repo.git');
    const target = path.join(dir, 'validate');
    execFileSync('go', ['build', '-o', target, 'features/steps/init-detect-git-network-actions__driver/main.go'], {
      encoding: 'utf8', timeout: 100000,
    });
    binary = target;
  });
  When('init-detect-git-network-actions: Validate check {string}', {timeout: 15000}, function (command) {
    this.gitNetworkProblems = execFileSync(binary, [root], {
      input: JSON.stringify({checks: [{name: 'probe', run: command}]}),
      env: gitEnv, encoding: 'utf8', timeout: 10000,
    });
  });
  Then('init-detect-git-network-actions: validation problems equal:', function (expected) {
    observe(this.gitNetworkProblems, expected);
  });
}
