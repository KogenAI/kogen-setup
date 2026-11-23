const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Given, When, Then, After, AfterAll, setDefaultTimeout} = require('@cucumber/cucumber');

setDefaultTimeout(110000);

const P = 'init-refuse-symlink-parent-writes: ';
let built;

function exec(cmd, args, cwd, env) {
  const r = cp.spawnSync(cmd, args, {cwd, env, encoding: 'utf8'});
  if (r.error) throw r.error;
  return r;
}
function git(world, ...args) {
  const r = exec('git', args, world.repo, world.env);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function state(world) {
  const hasHead = exec('git', ['rev-parse', '--verify', '-q', 'HEAD'], world.repo, world.env).status === 0;
  return {
    head: hasHead ? git(world, 'rev-parse', 'HEAD') : null,
    status: git(world, 'status', '--porcelain', '--untracked-files=all'),
  };
}
function listing(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { out[path.relative(dir, full) + '/'] = null; walk(full); }
      else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}
function fresh(world) {
  world.base = fs.mkdtempSync(path.join(os.tmpdir(), 'init-parent-symlink-'));
  world.repo = path.join(world.base, 'repo');
  world.outsideDir = path.join(world.base, 'outside');
  const home = path.join(world.base, 'home');
  const hooks = path.join(world.base, 'hooks');
  for (const dir of [world.repo, world.outsideDir, home, hooks]) fs.mkdirSync(dir, {recursive: true});
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
function commit(world) {
  git(world, 'add', '-A');
  git(world, 'commit', '-q', '-m', 'Add notes and a symlink');
}
function link(world, name, target) {
  world.linkName = name;
  fs.symlinkSync(target, path.join(world.repo, name));
  world.linkBefore = fs.readlinkSync(path.join(world.repo, name));
  world.outsideBefore = listing(world.outsideDir);
}

Given(P + 'a repository with a commit and an untracked symlink {string} to an empty outside directory', function(name) {
  fresh(this);
  fs.writeFileSync(path.join(this.repo, 'README.md'), 'notes\n');
  commit(this);
  link(this, name, this.outsideDir);
});
Given(P + 'a repository whose only commit tracks the symlink {string} to an outside directory containing the file {string}', function(name, file) {
  fresh(this);
  fs.writeFileSync(path.join(this.repo, 'README.md'), 'notes\n');
  fs.writeFileSync(path.join(this.outsideDir, file), 'keep\n');
  link(this, name, this.outsideDir);
  commit(this);
});
Given(P + 'a repository with a commit and an untracked symlink {string} to a file in an outside directory', function(name) {
  fresh(this);
  fs.writeFileSync(path.join(this.repo, 'README.md'), 'notes\n');
  commit(this);
  fs.writeFileSync(path.join(this.outsideDir, 'target.txt'), 'outside\n');
  link(this, name, path.join(this.outsideDir, 'target.txt'));
});
Given(P + 'a repository without commits, a regular file {string} containing {string} and an empty regular directory {string}', function(name, content, dir) {
  fresh(this);
  fs.writeFileSync(path.join(this.repo, name), content);
  fs.mkdirSync(path.join(this.repo, dir));
});

When(P + 'init is run', function() {
  if (!built) {
    built = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'init-parent-symlink-bin-')), 'kogen-setup');
    const b = exec('go', ['build', '-o', built, './cmd/kogen-setup'], process.cwd(), process.env);
    assert.equal(b.status, 0, `build of ./cmd/kogen-setup: ${b.stdout}${b.stderr}`);
  }
  this.before = state(this);
  this.run = exec(built, [this.repo], this.base, this.env);
  this.output = this.run.stdout + this.run.stderr;
});

Then(P + 'init is refused and the error names {string} as a symbolic link', function(name) {
  assert.notEqual(this.run.status, 0, `init exit ${this.run.status}: ${this.output}`);
  const result = JSON.parse(this.run.stdout);
  assert.notEqual(result.exit, 0, this.output);
  assert.equal(typeof result.error, 'string', this.output);
  const text = result.error + '\n' + this.run.stderr;
  assert.ok(text.includes(name), `error does not name ${name}: ${this.output}`);
  assert.match(text, /symbolic link|symlink/i, `error does not say symbolic link: ${this.output}`);
});
Then(P + 'the outside directory contents and the symlink are unchanged', function() {
  assert.deepEqual(listing(this.outsideDir), this.outsideBefore, 'the outside directory changed');
  assert.equal(fs.lstatSync(path.join(this.repo, this.linkName)).isSymbolicLink(), true, `${this.linkName} is no longer a symlink`);
  assert.equal(fs.readlinkSync(path.join(this.repo, this.linkName)), this.linkBefore);
});
Then(P + 'the repository state is unchanged', function() {
  assert.deepEqual(state(this), this.before);
});
Then(P + 'init succeeds with one commit that contains {string}, {string} and {string}', function(a, b, c) {
  assert.equal(this.run.status, 0, `init exit ${this.run.status}: ${this.output}`);
  assert.equal(git(this, 'rev-list', '--count', 'HEAD'), '1');
  const files = git(this, 'show', '--name-only', '--format=', 'HEAD').split('\n');
  for (const name of [a, b, c]) assert.ok(files.includes(name), `${name} is not in the commit: ${files}`);
});
Then(P + 'the committed {string} still has the line {string}', function(name, line) {
  assert.ok(git(this, 'show', `HEAD:${name}`).split('\n').includes(line), `${name} lost ${line}`);
});

After(function() { if (this.base) fs.rmSync(this.base, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}); });
AfterAll(function() { if (built) fs.rmSync(path.dirname(built), {recursive: true, force: true}); });
