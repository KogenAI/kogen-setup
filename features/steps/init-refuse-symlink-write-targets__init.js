const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Given, When, Then, After, AfterAll, setDefaultTimeout} = require('@cucumber/cucumber');

setDefaultTimeout(110000);

const P = 'init-refuse-symlink-write-targets: ';
let built;

function exec(world, cmd, args, cwd, env = world.env) {
  const r = cp.spawnSync(cmd, args, {cwd, env, encoding: 'utf8'});
  if (r.error) throw r.error;
  return r;
}
function git(world, ...args) {
  const r = exec(world, 'git', args, world.repo);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function state(world) {
  const hasHead = exec(world, 'git', ['rev-parse', '--verify', '-q', 'HEAD'], world.repo).status === 0;
  return {
    head: hasHead ? git(world, 'rev-parse', 'HEAD') : null,
    status: git(world, 'status', '--porcelain', '--untracked-files=all'),
  };
}
function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
function fresh(world) {
  world.base = fs.mkdtempSync(path.join(os.tmpdir(), 'init-symlink-'));
  world.repo = path.join(world.base, 'repo');
  world.outside = path.join(world.base, 'outside', 'target.txt');
  const home = path.join(world.base, 'home');
  const hooks = path.join(world.base, 'hooks');
  for (const dir of [world.repo, path.dirname(world.outside), home, hooks]) fs.mkdirSync(dir, {recursive: true});
  world.env = {...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null'};
  for (const key of Object.keys(world.env)) {
    if (/^GIT_(AUTHOR|COMMITTER|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|DIR$|WORK_TREE$)/.test(key)) delete world.env[key];
  }
  git(world, 'init', '-q');
  git(world, 'config', 'commit.gpgsign', 'false');
  git(world, 'config', 'core.hooksPath', hooks);
  git(world, 'config', 'user.name', 'Fixture');
  git(world, 'config', 'user.email', 'fixture@example.invalid');
}
function link(world, name, withTarget, content) {
  if (withTarget) fs.writeFileSync(world.outside, content);
  world.linkName = name;
  world.outsideBefore = withTarget ? content : null;
  fs.mkdirSync(path.dirname(path.join(world.repo, name)), {recursive: true});
  fs.symlinkSync(world.outside, path.join(world.repo, name));
  world.linkBefore = fs.readlinkSync(path.join(world.repo, name));
}

Given(P + 'a repository without commits and an untracked symlink {string} to an outside file containing {string}', function(name, content) {
  fresh(this);
  link(this, name, true, content);
});
Given(P + 'a repository whose only commit tracks the symlink {string} to an outside file containing {string}', function(name, content) {
  fresh(this);
  fs.writeFileSync(path.join(this.repo, 'README.md'), 'notes\n');
  link(this, name, true, content);
  git(this, 'add', '-A');
  git(this, 'commit', '-q', '-m', 'Add notes and a symlink');
});
Given(P + 'a repository whose only commit tracks the symlink {string} to a missing outside file', function(name) {
  fresh(this);
  fs.writeFileSync(path.join(this.repo, 'README.md'), 'notes\n');
  link(this, name, false);
  git(this, 'add', '-A');
  git(this, 'commit', '-q', '-m', 'Add notes and a symlink');
});
Given(P + 'a repository without commits and a regular file {string} containing {string}', function(name, content) {
  fresh(this);
  fs.writeFileSync(path.join(this.repo, name), content);
});

When(P + 'init is run', function() {
  if (!built) {
    built = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'init-symlink-bin-')), 'kogen-setup');
    const b = exec(this, 'go', ['build', '-o', built, './cmd/kogen-setup'], process.cwd(), process.env);
    assert.equal(b.status, 0, `build of ./cmd/kogen-setup: ${b.stdout}${b.stderr}`);
  }
  this.before = state(this);
  this.run = exec(this, built, [this.repo], this.base);
  this.output = this.run.stdout + this.run.stderr;
});

Then(P + 'init is refused and the error names {string}', function(name) {
  assert.notEqual(this.run.status, 0, `init exit ${this.run.status}: ${this.output}`);
  const result = JSON.parse(this.run.stdout);
  assert.notEqual(result.exit, 0, this.output);
  assert.equal(typeof result.error, 'string', this.output);
  assert.ok(result.error.includes(name) || this.run.stderr.includes(name), `error does not name ${name}: ${this.output}`);
});
Then(P + 'the outside file and the symlink are unchanged', function() {
  assert.equal(read(this.outside), this.outsideBefore, 'the file outside the checkout changed');
  assert.equal(fs.lstatSync(path.join(this.repo, this.linkName)).isSymbolicLink(), true, `${this.linkName} is no longer a symlink`);
  assert.equal(fs.readlinkSync(path.join(this.repo, this.linkName)), this.linkBefore);
});
Then(P + 'the repository state is unchanged', function() {
  assert.deepEqual(state(this), this.before);
});
Then(P + 'no setup file was written', function() {
  const entries = fs.readdirSync(this.repo).filter((n) => n !== '.git').sort();
  assert.ok(!entries.includes('.kogen'), `init left .kogen behind: ${entries}`);
  assert.equal(git(this, 'rev-list', '--all', '--count'), '0');
});
Then(P + 'init succeeds with one commit that contains {string}, {string} and {string}', function(a, b, c) {
  assert.equal(this.run.status, 0, `init exit ${this.run.status}: ${this.output}`);
  assert.equal(git(this, 'rev-list', '--count', 'HEAD'), '1');
  const tree = git(this, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n');
  for (const name of [a, b, c]) assert.ok(tree.includes(name), `${name} is not committed: ${tree}`);
  assert.equal(git(this, 'status', '--porcelain'), '');
});
Then(P + 'the committed {string} still has the line {string}', function(name, line) {
  assert.ok(git(this, 'show', `HEAD:${name}`).split('\n').includes(line), `${name} lost ${line}`);
});

After(function() { if (this.base) fs.rmSync(this.base, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}); });
AfterAll(function() { if (built) fs.rmSync(path.dirname(built), {recursive: true, force: true}); });
