'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process'), assert = require('node:assert/strict');
const P = 'setup-typed-init-route-contract';
const TEST = 'TestInitCompatibleKeyDoesNotSupplyRoute';
const CMD = `go test ./setup -run '^${TEST}$' -count=1 -v`;
const SENTENCE = 'OpenAI-compatible requires a host/base URL and model; a saved key alone is not a route. Sign in with a supported provider using kogen provider login.';
const ERROR = 'provider/login: ' + SENTENCE;
const CALL = 'sys.Fail("provider", "login", "' + SENTENCE + '", 4)';
const REWORDED = 'A saved OpenAI-compatible key alone cannot select a route.';
// Each mutation changes exactly one property of the compatible-key refusal in setup/init_route.go.
const MUTATIONS = {
  'class "environment"': s => s.replace(CALL, CALL.replace('"provider"', '"environment"')),
  'reason "route"': s => s.replace(CALL, CALL.replace('"login"', '"route"')),
  'exit 3': s => s.replace(CALL, CALL.replace(', 4)', ', 3)')),
  'reworded sentence': s => s.replace(CALL, CALL.replace(SENTENCE, REWORDED)),
};

function sync(cmd, args, cwd, env) {
  const r = cp.spawnSync(cmd, args, {cwd, env, encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `${P}: ${cmd} ${args.join(' ')}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}
function put(p, text, mode = 0o644) { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, text, {mode}); }
function run(cmd, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(cmd, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${P}: ${cmd} exceeded 120 seconds: ${out}${err}`)); }, 120000);
    p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b);
    p.on('error', reject); p.on('close', code => { clearTimeout(timer); resolve({code, out, err}); });
  });
}

// Runs the focused test in a copy of the working tree whose compatible-key refusal is mutated.
function focusedRun(name) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'typed-route-')));
  try {
    fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !['.git', '.kogen'].includes(path.basename(src))});
    if (name) {
      const file = path.join(dir, 'setup', 'init_route.go');
      const before = fs.readFileSync(file, 'utf8');
      const after = MUTATIONS[name](before);
      assert.notEqual(after, before, `${P}: mutation ${name} did not change setup/init_route.go`);
      fs.writeFileSync(file, after);
    }
    const r = cp.spawnSync('go', ['test', './setup', '-run', `^${TEST}$`, '-count=1', '-v'], {cwd: dir, encoding: 'utf8', timeout: 240000});
    return {name: name || 'unchanged tree', code: r.status, out: r.stdout + r.stderr};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
// 'pass' or 'fail' from a real go test -v run of the named test; anything else did not run the test.
function outcome(r) {
  const ctx = `${r.name}: \`${CMD}\` exit ${r.code}\n${r.out}`;
  if (r.code !== 0 && new RegExp(`^--- FAIL: ${TEST} `, 'm').test(r.out)) return 'fail';
  if (r.code === 0 && new RegExp(`^--- PASS: ${TEST} `, 'm').test(r.out) && /^ok\s/m.test(r.out)) return 'pass';
  throw new Error(`${P}: ${TEST} neither passed nor failed (absent, skipped, ran zero times or did not compile) in ${ctx}`);
}
function observePasses(r) { assert.equal(outcome(r), 'pass', `${P}: ${TEST} failed but was expected to pass in ${r.name}:\n${r.out}`); }
function observeRejects(rs) {
  assert.ok(rs.length > 0, `${P}: no mutated copy ran`);
  for (const r of rs) assert.equal(outcome(r), 'fail', `${P}: ${TEST} passed on the copy with ${r.name}, so it does not reject it:\n${r.out}`);
}
function observeSource(text) { assert.ok(text.includes(CALL), `${P}: setup/init_route.go lacks ${CALL}`); }

const SECRET = 'fixture-compatible-key-3f9a1c';
// Builds ./cmd/kogen-setup and runs it on a committed repository whose home saves only an OpenAI-compatible key.
async function cliRun() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'typed-route-cli-')));
  const repo = path.join(base, 'repo'), home = path.join(base, 'home'), hooks = path.join(base, 'hooks');
  for (const d of [repo, home, hooks]) fs.mkdirSync(d);
  let requests = 0;
  const server = http.createServer((req, res) => { req.on('data', () => {}); req.on('end', () => { requests++; res.writeHead(500); res.end(); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const env = {...process.env, HOME: home, KOGEN_PROVIDER_URL: `http://127.0.0.1:${server.address().port}`, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
    for (const k of Object.keys(env)) if (/^(GIT_(AUTHOR|COMMITTER|DIR|WORK_TREE|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)|ANTHROPIC_|OPENAI_|CLAUDE_CODE_OAUTH|KOGEN_QUINT)/.test(k)) delete env[k];
    put(path.join(home, '.kogen/credentials/openai-compatible.json'), JSON.stringify({provider: 'openai-compatible', api_key: SECRET}), 0o600);
    const git = (...a) => sync('git', a, repo, env);
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', hooks);
    put(path.join(repo, 'README.md'), 'fixture\n');
    git('add', '-A'); git('commit', '-qm', 'fixture');
    const head = git('rev-parse', 'HEAD');
    const exe = path.join(base, 'kogen-setup');
    sync('go', ['build', '-o', exe, './cmd/kogen-setup'], process.cwd(), process.env);
    const child = await run(exe, [repo], base, env);
    let value;
    try { value = JSON.parse(child.out); } catch (e) { throw new Error(`${P}: kogen-setup stdout is not one JSON object (exit ${child.code}): ${child.out}\n${child.err}`); }
    return {code: child.code, exit: value.exit, error: value.error, configured: value.configuration !== null, stdout: child.out, stderr: child.err,
      requests, status: git('status', '--porcelain'), headUnchanged: git('rev-parse', 'HEAD') === head};
  } finally { await new Promise(r => server.close(r)); fs.rmSync(base, {recursive: true, force: true}); }
}
function observeCli(r) {
  const d = `kogen-setup exit ${r.code}, JSON exit ${r.exit}, error ${JSON.stringify(r.error)}, configured ${r.configured}, ${r.requests} provider request(s), status ${JSON.stringify(r.status)}, HEAD unchanged ${r.headUnchanged}\nstderr:\n${r.stderr}`;
  assert.equal(r.code, 4, `process exit: ${d}`);
  assert.equal(r.exit, 4, `JSON exit: ${d}`);
  assert.equal(r.error, ERROR, `JSON error: ${d}`);
  assert.equal(r.configured, false, `configuration: ${d}`);
  assert.ok(('\n' + r.stderr).includes('\n' + ERROR + '\n'), `stderr lacks the refusal line: ${d}`);
  assert.equal(r.requests, 0, `provider requests: ${d}`);
  assert.equal(r.status, '', `git status: ${d}`);
  assert.equal(r.headUnchanged, true, `HEAD: ${d}`);
  assert.ok(!r.stdout.includes(SECRET) && !r.stderr.includes(SECRET), `output contains the saved key: ${d}`);
}

if (require.main === module) {
  // Controls for the observers above. The runner outputs are real `go test -v` outputs of the focused test.
  const PASS = `=== RUN   ${TEST}\n--- PASS: ${TEST} (0.06s)\nPASS\nok  \tgithub.com/KogenAI/kogen-setup/setup\t0.076s\n`;
  const FAIL = `=== RUN   ${TEST}\n    init_route_test.go:91: exit 3 error ${ERROR}\n--- FAIL: ${TEST} (0.04s)\nFAIL\nFAIL\tgithub.com/KogenAI/kogen-setup/setup\t0.054s\nFAIL\n`;
  const BUILD_FAILED = 'setup/init_route.go:41:3: syntax error\nFAIL\tgithub.com/KogenAI/kogen-setup/setup [build failed]\nFAIL\n';
  const NO_TESTS = 'testing: warning: no tests to run\nPASS\nok  \tgithub.com/KogenAI/kogen-setup/setup\t0.01s [no tests to run]\n';
  const cli = {code: 4, exit: 4, error: ERROR, configured: false, stdout: JSON.stringify({exit: 4, configuration: null, error: ERROR}) + '\n', stderr: ERROR + '\n', requests: 0, status: '', headUnchanged: true};
  const copy = o => JSON.parse(JSON.stringify(o));
  const bads = [];
  const bad = f => bads.push(f);
  bad(() => observePasses({name: 'x', code: 1, out: FAIL}));
  bad(() => observePasses({name: 'x', code: 1, out: BUILD_FAILED}));
  bad(() => observePasses({name: 'x', code: 0, out: NO_TESTS}));
  bad(() => observeRejects([{name: 'x', code: 0, out: PASS}]));
  bad(() => observeRejects([{name: 'x', code: 1, out: FAIL}, {name: 'y', code: 0, out: PASS}]));
  bad(() => observeRejects([{name: 'x', code: 1, out: BUILD_FAILED}]));
  bad(() => observeRejects([]));
  bad(() => observeSource('sys.Fail("provider", "login", "' + SENTENCE + '", 3)'));
  const badCli = f => { const r = copy(cli); f(r); bad(() => observeCli(r)); };
  badCli(r => { r.code = 1; });
  badCli(r => { r.exit = 3; });
  badCli(r => { r.error = 'provider/login: ' + REWORDED; });
  badCli(r => { r.error = SENTENCE; });
  badCli(r => { r.configured = true; });
  badCli(r => { r.stderr = REWORDED + '\n'; });
  badCli(r => { r.requests = 1; });
  badCli(r => { r.status = '?? .kogen/\n'; });
  badCli(r => { r.headUnchanged = false; });
  badCli(r => { r.stderr += SECRET + '\n'; });
  if (process.argv[2] === 'good') {
    observePasses({name: 'x', code: 0, out: PASS});
    observeRejects([{name: 'x', code: 1, out: FAIL}]);
    observeSource('\t\t\t\treturn initRoute{}, ' + CALL + '\n');
    observeCli(cli);
    observeCli({...cli, stderr: 'kogen: selected nothing\n' + ERROR + '\n'});
    console.log('accepted');
  } else {
    bads.forEach((b, i) => {
      let rejected = false; try { b(); } catch (_) { rejected = true; }
      if (!rejected) throw new Error(`observer accepted bad control ${i}`);
    });
    console.log('rejected'); process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  Given(`${P}: the compatible-key refusal in setup\\/init_route.go is provider\\/login with exit 4`, function() {
    observeSource(fs.readFileSync(path.join(process.cwd(), 'setup', 'init_route.go'), 'utf8'));
  });
  When(`${P}: the focused route test runs on copies of Setup whose refusal has class "environment", reason "route" or exit 3`, {timeout: 300000}, function() {
    this.wrongRuns = ['class "environment"', 'reason "route"', 'exit 3'].map(focusedRun);
  });
  When(`${P}: the focused route test runs on a copy of Setup whose refusal sentence is reworded`, {timeout: 300000}, function() {
    this.reworded = focusedRun('reworded sentence');
  });
  Then(`${P}: the focused route test fails on every copy`, function() { observeRejects(this.wrongRuns); });
  Then(`${P}: the focused route test passes on the reworded copy`, function() { observePasses(this.reworded); });
  Then(`${P}: the standalone kogen-setup still reports exit 4 and the original sentence for a saved compatible key with no write and no provider request`, {timeout: 300000}, async function() {
    observeCli(await cliRun());
  });
}
