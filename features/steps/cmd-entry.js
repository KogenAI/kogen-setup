const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

function observe(run, expectedExit, content) {
  assert.equal(run.status, expectedExit);
  const value = JSON.parse(run.stdout);
  assert.equal(value.exit, expectedExit);
  if (content === null) {
    assert.equal(value.configuration, null);
    assert.equal(typeof value.error, 'string');
    assert.match(value.error, /identity|user.name|user.email/i);
  } else {
    assert.deepEqual(value.configuration, { path: '.kogen/project.yaml', content });
    assert.equal(value.error, null);
    assert.ok(content.length > 0);
  }
}

if (require.main === module) {
  const good = process.argv[2] === 'good';
  try {
    observe({status: 0, stdout: JSON.stringify({exit: 0, configuration: {path: '.kogen/project.yaml', content: 'template\n'}, error: null})}, 0, 'template\n');
    observe({status: 3, stdout: JSON.stringify({exit: 3, configuration: null, error: 'git identity missing'})}, 3, null);
    observe({status: 0, stdout: JSON.stringify({exit: 0, configuration: {path: '.kogen/project.yaml', content: good ? 'actual\n' : 'stale\n'}, error: null})}, 0, 'actual\n');
    console.log('accepted');
  } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {Given, When, Then, After} = require('@cucumber/cucumber');
  function exec(world, cmd, args, cwd) {
    const result = cp.spawnSync(cmd, args, {cwd, env: world.cmdEnv, encoding: 'utf8'});
    if (result.error) throw result.error;
    return result;
  }
  function git(world, ...args) {
    const r = exec(world, 'git', args, world.cmdRepo);
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  }
  Given(/^a standalone setup checkout (with local|without) Git identity$/, function(identity) {
    this.cmdBase = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-entry-'));
    this.cmdRepo = path.join(this.cmdBase, 'repo');
    const home = path.join(this.cmdBase, 'home');
    const hooks = path.join(this.cmdBase, 'hooks');
    for (const dir of [this.cmdRepo, home, hooks]) fs.mkdirSync(dir);
    this.cmdEnv = {...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null'};
    for (const key of Object.keys(this.cmdEnv)) {
      if (/^GIT_(AUTHOR|COMMITTER|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|DIR$|WORK_TREE$)/.test(key)) delete this.cmdEnv[key];
    }
    git(this, 'init', '-q');
    git(this, 'config', 'commit.gpgsign', 'false');
    git(this, 'config', 'core.hooksPath', hooks);
    if (identity === 'with local') {
      git(this, 'config', 'user.name', 'Fixture');
      git(this, 'config', 'user.email', 'fixture@example.invalid');
    }
    this.cmdBinary = path.join(this.cmdBase, 'kogen-setup');
  });
  When('I run the standalone setup command', function() {
    if (!fs.existsSync(this.cmdBinary)) {
      const build = exec(this, 'go', ['build', '-o', this.cmdBinary, './cmd/kogen-setup'], process.cwd());
      assert.equal(build.status, 0, `standalone build: ${build.stdout}${build.stderr}`);
    }
    this.cmdRun = exec(this, this.cmdBinary, [this.cmdRepo], this.cmdBase);
  });
  Then(/^the standalone result has exit (\d+) and (a written|no) configuration$/, function(code, mode) {
    const file = path.join(this.cmdRepo, '.kogen/project.yaml');
    const content = mode === 'no' ? null : fs.readFileSync(file, 'utf8');
    if (mode === 'no') assert.equal(fs.existsSync(file), false);
    observe(this.cmdRun, Number(code), content);
    if (this.cmdPreviousContent !== undefined && content !== null) assert.equal(content, this.cmdPreviousContent);
    this.cmdPreviousContent = content;
  });
  Then(/^the standalone checkout has (\d+) commits?$/, function(count) {
    const heads = git(this, 'for-each-ref', '--format=%(objectname)', 'refs/heads');
    const actual = heads ? Number(git(this, 'rev-list', '--count', 'HEAD')) : 0;
    assert.equal(actual, Number(count));
    if (actual) {
      assert.equal(git(this, 'status', '--porcelain'), '');
      assert.equal(git(this, 'log', '-1', '--format=%s'), 'Initial commit');
      assert.equal(git(this, 'show', 'HEAD:.kogen/project.yaml'), fs.readFileSync(path.join(this.cmdRepo, '.kogen/project.yaml'), 'utf8').trim());
    }
  });
  After(function() { if (this.cmdBase) fs.rmSync(this.cmdBase, {recursive: true, force: true}); });
}
