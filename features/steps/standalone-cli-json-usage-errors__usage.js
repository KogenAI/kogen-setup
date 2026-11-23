const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const USAGE = 'usage: kogen-setup <checkout>';

// Stdout must be exactly one JSON object with the three documented fields.
function parseOne(stdout) {
  const value = JSON.parse(stdout);
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'stdout is not a JSON object');
  assert.deepEqual(Object.keys(value).sort(), ['configuration', 'error', 'exit']);
  return value;
}

function checkUsageJson(run) {
  const value = parseOne(run.stdout);
  assert.equal(value.exit, 2);
  assert.equal(value.configuration, null);
  assert.equal(value.error, USAGE);
}

function checkUsageStderr(run) {
  assert.equal(run.stderr, USAGE + '\n');
}

function checkExit(run, code) {
  assert.equal(run.status, code);
}

// readContent returns the configuration file's bytes; it is called only after
// the result's exit and error have been checked.
function checkInitJson(run, readContent) {
  const value = parseOne(run.stdout);
  assert.equal(value.exit, 0);
  assert.equal(value.error, null);
  const fileContent = readContent();
  assert.ok(fileContent.length > 0);
  assert.deepEqual(value.configuration, { path: '.kogen/project.yaml', content: fileContent });
}

function checkNoUsage(run) {
  assert.ok(!run.stderr.includes(USAGE), 'stderr holds the usage message for a valid invocation');
  assert.ok(!run.stdout.includes(USAGE), 'stdout holds the usage message for a valid invocation');
}

if (require.main === module) {
  const goodUsage = { status: 2, stdout: JSON.stringify({ exit: 2, configuration: null, error: USAGE }) + '\n', stderr: USAGE + '\n' };
  const goodInit = { status: 0, stdout: JSON.stringify({ exit: 0, configuration: { path: '.kogen/project.yaml', content: 'a: b\n' }, error: null }) + '\n', stderr: 'init output\n' };
  const goodChecks = [
    () => checkUsageJson(goodUsage),
    () => checkUsageStderr(goodUsage),
    () => checkExit(goodUsage, 2),
    () => checkInitJson(goodInit, () => 'a: b\n'),
    () => checkNoUsage(goodInit),
    () => checkExit(goodInit, 0),
  ];
  const badChecks = [
    () => checkUsageJson({ ...goodUsage, stdout: USAGE + '\n' }),
    () => checkUsageJson({ ...goodUsage, stdout: goodUsage.stdout + goodUsage.stdout }),
    () => checkUsageJson({ ...goodUsage, stdout: JSON.stringify({ exit: 2, configuration: null, error: 'other' }) }),
    () => checkUsageStderr({ ...goodUsage, stderr: '' }),
    () => checkExit({ ...goodUsage, status: 1 }, 2),
    () => checkInitJson({ ...goodInit, stdout: JSON.stringify({ exit: 2, configuration: null, error: USAGE }) }, () => { throw new Error('read before exit check'); }),
    () => checkInitJson(goodInit, () => 'stale\n'),
    () => checkNoUsage({ ...goodInit, stderr: USAGE + '\n' }),
  ];
  const accepts = (check) => { try { check(); return true; } catch (_) { return false; } };
  if (process.argv[2] === 'good') {
    const ok = goodChecks.every(accepts);
    console.log(ok ? 'accepted' : 'rejected');
    process.exitCode = ok ? 0 : 1;
  } else {
    const allRejected = badChecks.every((check) => !accepts(check));
    console.log(allRejected ? 'rejected' : 'accepted');
    process.exitCode = allRejected ? 1 : 0;
  }
} else {
  const { Given, When, Then } = require('@cucumber/cucumber');
  const PREFIX = 'standalone-cli-json-usage-errors: ';
  let toolDir = null;
  let binary = null;

  process.on('exit', () => {
    if (toolDir) fs.rmSync(toolDir, { recursive: true, force: true });
  });

  function baseEnv(world) {
    const env = { ...process.env, HOME: world.usageHome, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CEILING_DIRECTORIES: path.dirname(world.usageBase) };
    for (const key of Object.keys(env)) {
      if (/^GIT_(AUTHOR|COMMITTER|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|DIR$|WORK_TREE$)/.test(key)) delete env[key];
    }
    return env;
  }
  function exec(world, cmd, args, cwd) {
    const result = cp.spawnSync(cmd, args, { cwd, env: baseEnv(world), encoding: 'utf8' });
    if (result.error) throw result.error;
    return result;
  }
  function git(world, ...args) {
    const r = exec(world, 'git', args, world.usageRepo);
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  }

  Given(PREFIX + 'the standalone setup command is built', function () {
    this.usageBase = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-errors-'));
    this.usageHome = path.join(this.usageBase, 'home');
    fs.mkdirSync(this.usageHome);
    this.usageRepo = null;
    if (!binary) {
      toolDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-errors-bin-'));
      const out = path.join(toolDir, 'kogen-setup');
      const build = exec(this, 'go', ['build', '-o', out, './cmd/kogen-setup'], process.cwd());
      assert.equal(build.status, 0, `standalone build: ${build.stdout}${build.stderr}`);
      binary = out;
    }
  });
  Given(PREFIX + 'an empty Git checkout with local identity', function () {
    this.usageRepo = path.join(this.usageBase, 'repo');
    const hooks = path.join(this.usageBase, 'hooks');
    fs.mkdirSync(this.usageRepo);
    fs.mkdirSync(hooks);
    git(this, 'init', '-q');
    git(this, 'config', 'commit.gpgsign', 'false');
    git(this, 'config', 'core.hooksPath', hooks);
    git(this, 'config', 'user.name', 'Fixture');
    git(this, 'config', 'user.email', 'fixture@example.invalid');
  });
  When(PREFIX + 'I run the command with no arguments', function () {
    this.usageRun = exec(this, binary, [], this.usageBase);
  });
  When(PREFIX + 'I run the command with two checkout arguments', function () {
    const first = path.join(this.usageBase, 'first');
    const second = path.join(this.usageBase, 'second');
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    this.usageRun = exec(this, binary, [first, second], this.usageBase);
  });
  When(PREFIX + 'I run the command with the checkout as its only argument', function () {
    this.usageRun = exec(this, binary, [this.usageRepo], this.usageBase);
  });
  Then(PREFIX + 'stdout is one JSON object with exit 2, null configuration and the usage message as error', function () {
    checkUsageJson(this.usageRun);
  });
  Then(PREFIX + 'stderr is exactly the usage message line', function () {
    checkUsageStderr(this.usageRun);
  });
  Then(PREFIX + 'the process exit code is 2', function () {
    checkExit(this.usageRun, 2);
  });
  Then(PREFIX + 'stdout is one JSON object with exit 0, the written configuration and null error', function () {
    checkInitJson(this.usageRun, () => fs.readFileSync(path.join(this.usageRepo, '.kogen/project.yaml'), 'utf8'));
  });
  Then(PREFIX + 'neither stream holds the usage message', function () {
    checkNoUsage(this.usageRun);
  });
  Then(PREFIX + 'the process exit code is 0', function () {
    checkExit(this.usageRun, 0);
  });
}
