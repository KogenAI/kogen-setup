const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');

const SUBJECT = 'Add Kogen configuration';
const KOGEN_FILES = ['.gitignore', '.kogen/models.yaml', '.kogen/project.yaml'];

function expectedOutput(actual, text) {
  return text.split('<root>').join(actual.root).split('<commit>').join(actual.after.head.slice(0, 8)) + '\n';
}

function succeeded(actual) {
  assert.equal(actual.status, 0, `kogen-setup process exit ${actual.status}\nstdout: ${actual.stdout}\nstderr: ${actual.stderr}`);
  assert.deepStrictEqual({exit: actual.result.exit, error: actual.result.error}, {exit: 0, error: null}, `kogen-setup JSON result: ${actual.stdout}`);
  assert.deepStrictEqual(actual.result.configuration, {path: '.kogen/project.yaml', content: actual.written}, 'reported configuration differs from the configuration the fixture wrote');
}

// observeUnchanged judges one kogen-setup run on the already-initialized path.
function observeUnchanged(actual, text) {
  succeeded(actual);
  assert.equal(actual.stderr, expectedOutput(actual, text), 'human-readable output of kogen-setup');
  assert.deepStrictEqual(actual.after, actual.before, 'HEAD, refs, Git status or working tree changed');
}

// observeLeftover judges one kogen-setup run that commits an uncommitted configuration.
function observeLeftover(actual, text) {
  succeeded(actual);
  assert.equal(actual.stderr, expectedOutput(actual, text), 'human-readable output of kogen-setup');
  assert.equal(actual.after.parent, actual.before.head, `HEAD ${actual.after.head} is not one new commit on top of ${actual.before.head}`);
  assert.equal(actual.after.subject, SUBJECT, 'subject of the new commit');
  assert.deepStrictEqual(actual.after.committed, KOGEN_FILES, 'files of the new commit');
  assert.equal(actual.after.status, '', 'Git status after the run');
  assert.equal(actual.after.files['.kogen/project.yaml'], actual.before.files['.kogen/project.yaml'], 'the configuration file changed');
  const others = files => Object.fromEntries(Object.entries(files).filter(([name]) => !KOGEN_FILES.includes(name)));
  assert.deepStrictEqual(others(actual.after.files), others(actual.before.files), 'files other than the configuration files changed');
}

const noteLines = text => text.split('\n').filter(line => line.startsWith('Note: '));

function observeSameNotes(first, second) {
  const a = noteLines(first.stderr), b = noteLines(second.stderr);
  assert.ok(a.length > 0, `the first run printed no Note lines:\n${first.stderr}`);
  assert.deepStrictEqual(b, a, 'Note lines of the second run differ from the first run');
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
    parent: git(repo, env, 'log', '-1', '--format=%P').trim(),
    subject: git(repo, env, 'log', '-1', '--format=%s').trim(),
    committed: git(repo, env, 'diff-tree', '--no-commit-id', '--name-only', '-r', '--root', 'HEAD').split('\n').filter(Boolean).sort(),
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omitted-checks-bin-'));
  cleanup.push(dir);
  const out = path.join(dir, 'kogen-setup');
  const r = cp.spawnSync('go', ['build', '-o', out, './cmd/kogen-setup'], {cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 280000});
  assert.equal(r.status, 0, `go build -o ${out} ./cmd/kogen-setup failed: ${r.error || ''}${r.stdout}${r.stderr}`);
  built = out;
  return built;
}

function prepare(files) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omitted-checks-')));
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
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, name)), {recursive: true});
    fs.writeFileSync(path.join(repo, name), text);
  }
  git(repo, env, 'add', '-A');
  git(repo, env, 'commit', '-qm', 'Seed project');
  return {repo, env};
}

function configure(fixture, config, commit) {
  const written = yamlConfig(config);
  fs.mkdirSync(path.join(fixture.repo, '.kogen'), {recursive: true});
  fs.writeFileSync(path.join(fixture.repo, '.kogen/project.yaml'), written);
  if (commit) {
    git(fixture.repo, fixture.env, 'add', '.kogen/project.yaml');
    git(fixture.repo, fixture.env, 'commit', '-qm', 'Configure Kogen');
  }
  fixture.written = written;
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

function parseFiles(text) {
  const files = JSON.parse(text);
  assert.ok(files && typeof files === 'object' && !Array.isArray(files) && Object.values(files).every(v => typeof v === 'string'),
    `committed files must be a JSON object of path to text: ${text}`);
  return files;
}

function parseConfig(text) {
  const config = JSON.parse(text);
  const strings = v => Array.isArray(v) && v.every(c => typeof c === 'string');
  assert.ok(config && strings(config.setup) && Array.isArray(config.checks) &&
    config.checks.every(c => c && typeof c.name === 'string' && typeof c.run === 'string'),
  `configuration must be {"setup": [strings], "checks": [{"name", "run"}]}: ${text}`);
  return config;
}

function selfTest(mode) {
  const written = yamlConfig({setup: [], checks: [{name: 'vet', run: 'go vet ./...'}]});
  const root = '/tmp/x/repo';
  const notes = [
    'Note: detected check go-format (test -z "$(gofmt -l .)") is not in the configured checks',
    'Note: detected check go-test (go test ./...) is not in the configured checks',
    'Note: detected check go-build (go build -o /dev/null ./...) is not in the configured checks',
  ];
  const next = 'Next: set commands.acceptance in .kogen/project.yaml';
  const tree = (head, parent, subject, committed, files) => ({head, parent, subject, committed, refs: `refs/heads/main ${head}\n`, status: '', files});
  const seedFiles = {'README.md': '1', 'go.mod': '2'};
  const initialized = tree('a'.repeat(40), 'b'.repeat(40), 'Configure Kogen', ['.kogen/project.yaml'], {...seedFiles, '.kogen/project.yaml': '3'});
  const unchangedText = ['Kogen is already initialized in <root>', ...notes, next].join('\n');
  const unchanged = {
    status: 0, stdout: '', result: {exit: 0, configuration: {path: '.kogen/project.yaml', content: written}, error: null},
    root, written, before: initialized, after: JSON.parse(JSON.stringify(initialized)),
    stderr: unchangedText.split('<root>').join(root) + '\n',
  };
  const seeded = tree('c'.repeat(40), '', 'Seed project', ['README.md', 'go.mod'], {...seedFiles, '.kogen/project.yaml': '3'});
  seeded.status = '?? .kogen/project.yaml\n';
  const committed = tree('d'.repeat(40), 'c'.repeat(40), SUBJECT, KOGEN_FILES, {...seedFiles, '.gitignore': '4', '.kogen/models.yaml': '5', '.kogen/project.yaml': '3'});
  const leftoverText = ['Initialized Kogen in <root>', `Commit: <commit> ${SUBJECT}`, ...notes, next].join('\n');
  const leftover = {
    status: 0, stdout: '', result: {exit: 0, configuration: {path: '.kogen/project.yaml', content: written}, error: null},
    root, written, before: seeded, after: committed,
    stderr: ['Initialized Kogen in ' + root, `Commit: ${'d'.repeat(8)} ${SUBJECT}`, ...notes, next].join('\n') + '\n',
  };
  const swap = (r, i, j) => { const l = r.stderr.split('\n'); [l[i], l[j]] = [l[j], l[i]]; r.stderr = l.join('\n'); };
  const drop = (r, i) => { const l = r.stderr.split('\n'); l.splice(i, 1); r.stderr = l.join('\n'); };
  const insert = (r, i, line) => { const l = r.stderr.split('\n'); l.splice(i, 0, line); r.stderr = l.join('\n'); };
  const cases = [
    [r => observeUnchanged(r, unchangedText), unchanged, [
      r => drop(r, 2),
      r => swap(r, 1, 2),
      r => swap(r, 3, 4),
      r => { r.stderr = r.stderr.replace('check go-test (', 'check test ('); },
      r => insert(r, 2, 'Note: detected check go-vet (go vet ./...) is not in the configured checks'),
      r => { r.stderr = r.stderr.replace('go build -o /dev/null ./...', 'go build ./...'); },
      r => { r.stderr = r.stderr.slice(0, -1); },
      r => { r.after.head = 'e'.repeat(40); },
      r => { r.after.status = ' M .kogen/project.yaml\n'; },
      r => { r.after.files['.kogen/project.yaml'] = '9'; },
      r => { r.after.files['go-test-ran'] = '9'; },
      r => { r.status = 1; },
      r => { r.result.exit = 3; },
      r => { r.result.error = 'boom'; },
      r => { r.result.configuration.content = 'version: 1\n'; },
    ]],
    [r => observeLeftover(r, leftoverText), leftover, [
      r => drop(r, 3),
      r => swap(r, 1, 2),
      r => swap(r, 4, 5),
      r => { r.stderr = r.stderr.replace('Commit: dddddddd', 'Commit: cccccccc'); },
      r => { r.after.parent = 'f'.repeat(40); },
      r => { r.after.subject = 'Initial commit'; },
      r => { r.after.committed = ['.gitignore', '.kogen/models.yaml']; },
      r => { r.after.status = '?? other\n'; },
      r => { r.after.files['.kogen/project.yaml'] = '9'; },
      r => { r.after.files['go.mod'] = '9'; },
      r => { r.after.files['go-test-ran'] = '9'; },
      r => { r.status = 1; },
      r => { r.result.configuration = null; },
    ]],
    [r => observeSameNotes(leftover, r), unchanged, [
      r => drop(r, 1),
      r => swap(r, 1, 2),
      r => { r.stderr = r.stderr.replace('(go test ./...)', '(go  test ./...)'); },
      r => insert(r, 1, 'Note: check smoke (true) cannot fail: runs nothing'),
    ]],
  ];
  if (mode === 'good') {
    for (const [observe, good] of cases) observe(JSON.parse(JSON.stringify(good)));
    let rejected = false;
    try { observeSameNotes({stderr: 'x\n'}, {stderr: 'x\n'}); } catch (_) { rejected = true; }
    if (!rejected) throw new Error('observer accepted runs without Note lines');
    console.log('accepted');
    return;
  }
  for (const [observe, good, mutations] of cases) {
    for (const mutate of mutations) {
      const bad = JSON.parse(JSON.stringify(good));
      mutate(bad);
      let rejected = false;
      try { observe(bad); } catch (_) { rejected = true; }
      if (!rejected) throw new Error(`observer accepted bad control ${mutate}`);
    }
  }
  console.log('rejected');
  process.exitCode = 1;
}

if (require.main === module) {
  selfTest(process.argv[2]);
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const P = 'committed-checks-omit-regression-suite: ';
  Given(P + 'a repository with these committed files:', function (text) {
    this.omittedFixture = prepare(parseFiles(text));
    this.omittedRuns = [];
  });
  Given(P + 'its configuration is committed:', function (text) {
    assert.ok(this.omittedFixture, 'no fixture repository was prepared');
    configure(this.omittedFixture, parseConfig(text), true);
  });
  Given(P + 'its configuration is written but not committed:', function (text) {
    assert.ok(this.omittedFixture, 'no fixture repository was prepared');
    configure(this.omittedFixture, parseConfig(text), false);
  });
  When(P + 'kogen-setup runs on that repository', {timeout: 300000}, function () {
    assert.ok(this.omittedFixture && this.omittedFixture.written, 'no configured fixture repository was prepared');
    this.omittedRuns.push(run(this.omittedFixture));
  });
  Then(P + 'the run succeeds without changing the working tree or HEAD, and its output is:', function (text) {
    assert.ok(this.omittedRuns && this.omittedRuns.length > 0, 'kogen-setup did not run');
    observeUnchanged(this.omittedRuns[this.omittedRuns.length - 1], text);
  });
  Then(P + 'the run commits the configuration unchanged in one new commit, leaves Git status clean, and its output is:', function (text) {
    assert.ok(this.omittedRuns && this.omittedRuns.length > 0, 'kogen-setup did not run');
    observeLeftover(this.omittedRuns[this.omittedRuns.length - 1], text);
  });
  Then(P + 'the last two runs print byte-identical Note lines', function () {
    assert.ok(this.omittedRuns && this.omittedRuns.length >= 2, `kogen-setup ran ${this.omittedRuns ? this.omittedRuns.length : 0} time(s), not twice`);
    const runs = this.omittedRuns;
    observeSameNotes(runs[runs.length - 2], runs[runs.length - 1]);
  });
}
