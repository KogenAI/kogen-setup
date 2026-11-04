const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');

// observe judges one kogen-setup run on an already-initialized fixture repository.
function observe(actual, expectedText) {
  assert.equal(actual.status, 0, `kogen-setup process exit ${actual.status}\nstdout: ${actual.stdout}\nstderr: ${actual.stderr}`);
  assert.deepStrictEqual({exit: actual.result.exit, error: actual.result.error}, {exit: 0, error: null}, `kogen-setup JSON result: ${actual.stdout}`);
  assert.deepStrictEqual(actual.result.configuration, {path: '.kogen/project.yaml', content: actual.written}, 'reported configuration differs from the committed configuration');
  const expected = expectedText.split('<root>').join(actual.root) + '\n';
  assert.equal(actual.stderr, expected, 'human-readable output of kogen-setup');
  assert.deepStrictEqual(actual.after, actual.before, 'HEAD, refs, Git status or working tree changed');
}

const cleanup = [];
process.on('exit', () => { for (const dir of cleanup) fs.rmSync(dir, {recursive: true, force: true}); });

function gitEnv(home) {
  const env = {...process.env, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
  return env;
}

function git(repo, env, ...args) {
  const r = cp.spawnSync('git', args, {cwd: repo, env, encoding: 'utf8'});
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.error || ''}${r.stdout}${r.stderr}`);
  return r.stdout;
}

function snapshot(repo, env) {
  const files = {};
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const full = path.join(dir, entry.name), rel = path.relative(repo, full);
      if (rel === '.git') continue;
      if (entry.isDirectory()) walk(full);
      else files[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(repo);
  return {
    head: git(repo, env, 'rev-parse', 'HEAD').trim(),
    refs: git(repo, env, 'for-each-ref', '--format=%(refname) %(objectname)'),
    status: git(repo, env, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored'),
    files,
  };
}

const quote = s => `'${s.split("'").join("''")}'`;

function yamlConfig(config) {
  let text = 'version: 1\ncommands:\n';
  text += config.setup.length === 0 ? '  setup: []\n' : '  setup:\n' + config.setup.map(c => `    - ${quote(c)}\n`).join('');
  text += '  fix: []\n';
  text += config.checks.length === 0 ? '  checks: []\n' : '  checks:\n' + config.checks.map(c => `    - name: ${c.name}\n      run: ${quote(c.run)}\n`).join('');
  return text;
}

let built;
function binary() {
  if (built) return built;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vacuous-note-bin-'));
  cleanup.push(dir);
  const out = path.join(dir, 'kogen-setup');
  const r = cp.spawnSync('go', ['build', '-o', out, './cmd/kogen-setup'], {cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 280000});
  assert.equal(r.status, 0, `go build -o ${out} ./cmd/kogen-setup failed: ${r.error || ''}${r.stdout}${r.stderr}`);
  built = out;
  return built;
}

function prepare(config) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vacuous-note-')));
  cleanup.push(base);
  const repo = path.join(base, 'repo'), home = path.join(base, 'home');
  fs.mkdirSync(repo);
  fs.mkdirSync(home);
  const env = gitEnv(home);
  git(repo, env, 'init', '-q');
  git(repo, env, 'config', 'user.name', 'Fixture');
  git(repo, env, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, env, 'config', 'commit.gpgsign', 'false');
  git(repo, env, 'config', 'core.hooksPath', '/dev/null');
  const written = yamlConfig(config);
  fs.mkdirSync(path.join(repo, '.kogen'));
  fs.writeFileSync(path.join(repo, '.kogen/project.yaml'), written);
  fs.writeFileSync(path.join(repo, 'README.md'), 'Synthetic fixture.\n');
  git(repo, env, 'add', '-A');
  git(repo, env, 'commit', '-qm', 'Configure Kogen');
  return {repo, env, written};
}

function run(fixture) {
  const program = binary();
  const before = snapshot(fixture.repo, fixture.env);
  const r = cp.spawnSync(program, [fixture.repo], {cwd: fixture.repo, env: fixture.env, encoding: 'utf8', timeout: 120000});
  const after = snapshot(fixture.repo, fixture.env);
  let result;
  try { result = JSON.parse(r.stdout); } catch (_) { assert.fail(`kogen-setup stdout is not one JSON object (exit ${r.status}, ${r.error || ''}): ${r.stdout}\nstderr: ${r.stderr}`); }
  return {status: r.status, stdout: r.stdout, stderr: r.stderr, result, before, after, root: fixture.repo, written: fixture.written};
}

function parseConfig(text) {
  const config = JSON.parse(text);
  const strings = v => Array.isArray(v) && v.every(c => typeof c === 'string');
  assert.ok(config && strings(config.setup) && Array.isArray(config.checks) &&
    config.checks.every(c => c && typeof c.name === 'string' && typeof c.run === 'string'),
  `configuration must be {"setup": [strings], "checks": [{"name", "run"}]}: ${text}`);
  return config;
}

if (require.main === module) {
  const tree = {head: 'a'.repeat(40), refs: 'refs/heads/main ' + 'a'.repeat(40) + '\n', status: '', files: {'.kogen/project.yaml': '1', 'README.md': '2'}};
  const written = yamlConfig({setup: [], checks: [{name: 'lint', run: 'touch check-ran || true'}, {name: 'unit', run: 'go test ./...'}, {name: 'smoke', run: 'echo ok'}]});
  const expected = [
    'Kogen is already initialized in <root>',
    'Note: check lint (touch check-ran || true) cannot fail: masks its failure',
    'Note: check smoke (echo ok) cannot fail: runs nothing',
    'Next: set commands.acceptance in .kogen/project.yaml',
  ];
  const good = {
    status: 0, stdout: '', result: {exit: 0, configuration: {path: '.kogen/project.yaml', content: written}, error: null},
    root: '/tmp/x/repo', written, before: tree, after: JSON.parse(JSON.stringify(tree)),
    stderr: expected.join('\n').split('<root>').join('/tmp/x/repo') + '\n',
  };
  if (process.argv[2] === 'good') {
    observe(good, expected.join('\n'));
    console.log('accepted');
  } else {
    const lines = good.stderr.split('\n');
    const mutations = [
      r => { r.stderr = [lines[0], lines[3], ''].join('\n'); },
      r => { r.stderr = [lines[0], lines[2], lines[1], lines[3], ''].join('\n'); },
      r => { r.stderr = [lines[0], lines[1], lines[3], ''].join('\n'); },
      r => { r.stderr = [lines[0], lines[1], lines[1], lines[2], lines[3], ''].join('\n'); },
      r => { r.stderr = [lines[0], lines[3], lines[1], lines[2], ''].join('\n'); },
      r => { r.stderr = [lines[0], lines[1], 'Note: check unit (go test ./...) cannot fail: runs nothing', lines[2], lines[3], ''].join('\n'); },
      r => { r.stderr = [lines[0], 'Note: check lint (touch check-ran || true) cannot fail: runs nothing', lines[2], lines[3], ''].join('\n'); },
      r => { r.after.head = 'b'.repeat(40); },
      r => { r.after.status = '?? check-ran\n'; },
      r => { r.after.files['check-ran'] = '3'; },
      r => { r.after.files['.kogen/project.yaml'] = '3'; },
      r => { r.status = 1; },
      r => { r.result.exit = 5; },
      r => { r.result.configuration.content = 'version: 1\n'; },
    ];
    for (const mutate of mutations) {
      const bad = JSON.parse(JSON.stringify(good));
      mutate(bad);
      let rejected = false;
      try { observe(bad, expected.join('\n')); } catch (_) { rejected = true; }
      if (!rejected) throw new Error('observer accepted bad control');
    }
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  Given('k-setup-initialized-reports-vacuous-checks: a repository whose committed configuration is:', function (text) {
    this.vacuousFixture = prepare(parseConfig(text));
  });
  When('k-setup-initialized-reports-vacuous-checks: kogen-setup runs on that repository', {timeout: 300000}, function () {
    assert.ok(this.vacuousFixture, 'no fixture repository was prepared');
    this.vacuousRun = run(this.vacuousFixture);
  });
  Then('k-setup-initialized-reports-vacuous-checks: the run succeeds without changing the working tree or HEAD, and its output is:', function (text) {
    assert.ok(this.vacuousRun, 'kogen-setup did not run');
    observe(this.vacuousRun, text);
  });
}
