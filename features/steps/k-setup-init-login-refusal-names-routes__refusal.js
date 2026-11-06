'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process'), assert = require('node:assert/strict');
const P = 'k-setup-init-login-refusal-names-routes';
// Fixture values that must never reach Init's output: ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN,
// and the saved ChatGPT login's access and refresh tokens.
const SECRETS = ['sk-ant-api03-fixtureEnvValue7f3a9c', 'sk-ant-oat01-fixtureEnvValue2b8d41', 'fixture-access-9d1e6a', 'fixture-refresh-4c7b52'];
const SECRET_NAMES = ['ANTHROPIC_API_KEY value', 'CLAUDE_CODE_OAUTH_TOKEN value', 'saved ChatGPT access token', 'saved ChatGPT refresh token'];

function sync(cmd, args, cwd, env) {
  const r = cp.spawnSync(cmd, args, {cwd, env, encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `${P}: ${cmd} ${args.join(' ')}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}
function run(cmd, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(cmd, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${P}: kogen-setup exceeded 120 seconds: ${out}${err}`)); }, 120000);
    p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b);
    p.on('error', reject); p.on('close', code => { clearTimeout(timer); resolve({code, out, err}); });
  });
}
function put(p, text, mode = 0o644) { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, text, {mode}); }
// One submit_configuration call that proposes nothing, in the Responses stream shape the setup tests serve.
function reply() {
  const args = JSON.stringify({setup: [], fix: [], checks: [], protect: []});
  const item = {type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'submit_configuration', arguments: args, status: 'completed'};
  const usage = {input_tokens: 100, input_tokens_details: {cached_tokens: 0}, output_tokens: 20, output_tokens_details: {reasoning_tokens: 5}};
  return `data: ${JSON.stringify({type: 'response.output_item.done', output_index: 0, item})}\n\n` +
    `data: ${JSON.stringify({type: 'response.completed', response: {usage}})}\n\n`;
}
// Builds ./cmd/kogen-setup and runs it on a repository with a Git identity and one commit
// (README.md). The home holds no login, or a saved ChatGPT login served by a local scripted provider.
async function fixture(login) {
  assert.ok(login === 'no login' || login === 'a ChatGPT login', `${P}: unknown home fixture ${JSON.stringify(login)}`);
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'init-login-refusal-')));
  const repo = path.join(base, 'repo'), home = path.join(base, 'home'), bin = path.join(base, 'bin'), cucumber = path.join(base, 'cucumber'), hooks = path.join(base, 'hooks');
  for (const d of [repo, home, bin, cucumber, hooks]) fs.mkdirSync(d);
  let requests = 0;
  const server = http.createServer((req, res) => {
    req.on('data', () => {}); req.on('end', () => { requests++; res.writeHead(200, {'Content-Type': 'text/event-stream'}); res.end(reply()); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const node = path.join(bin, 'node');
    put(node, '#!/bin/sh\n[ -n "$KOGEN_ACCEPTANCE_REPORT" ] && echo \'{}\' > "$KOGEN_ACCEPTANCE_REPORT"\nexit 0\n', 0o755);
    const env = {...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, KOGEN_PROVIDER_URL: `http://127.0.0.1:${server.address().port}`,
      KOGEN_NODE: node, KOGEN_CUCUMBER: cucumber, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
    for (const k of Object.keys(env)) if (/^(GIT_(AUTHOR|COMMITTER|DIR|WORK_TREE|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)|ANTHROPIC_|OPENAI_|CLAUDE_CODE_OAUTH|KOGEN_QUINT)/.test(k)) delete env[k];
    env.ANTHROPIC_API_KEY = SECRETS[0];
    env.CLAUDE_CODE_OAUTH_TOKEN = SECRETS[1];
    if (login === 'a ChatGPT login') {
      put(path.join(home, '.kogen/credentials/chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: SECRETS[2], refresh_token: SECRETS[3], expires_at: Math.floor(Date.now() / 1000) + 3600}), 0o600);
    }
    const git = (...a) => sync('git', a, repo, env);
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', hooks);
    put(path.join(repo, 'README.md'), '# notes\n');
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
function describe(r) {
  return `kogen-setup exit ${r.code}, JSON exit ${r.exit}, error ${JSON.stringify(r.error)}, configured ${r.configured}, ${r.requests} provider request(s), status ${JSON.stringify(r.status)}, HEAD unchanged ${r.headUnchanged}\nstderr:\n${r.stderr}`;
}
function observeRefusal(r, error) {
  assert.equal(r.code, 4, `process exit: ${describe(r)}`);
  assert.equal(r.exit, 4, `JSON exit: ${describe(r)}`);
  assert.equal(r.error, error, `JSON error: ${describe(r)}`);
  assert.equal(r.configured, false, `configuration: ${describe(r)}`);
  assert.equal(r.requests, 0, `provider requests: ${describe(r)}`);
  assert.equal(r.status, '', `git status: ${describe(r)}`);
  assert.equal(r.headUnchanged, true, `HEAD: ${describe(r)}`);
}
function observeLines(r, block) {
  assert.ok(('\n' + r.stderr).includes('\n' + block + '\n'), `stderr lacks these consecutive lines:\n${block}\n${describe(r)}`);
}
function observeProceeds(r, requests) {
  assert.equal(r.code, 0, `process exit: ${describe(r)}`);
  assert.equal(r.exit, 0, `JSON exit: ${describe(r)}`);
  assert.equal(r.error, null, `JSON error: ${describe(r)}`);
  assert.equal(r.configured, true, `configuration: ${describe(r)}`);
  assert.equal(r.requests, requests, `provider requests: ${describe(r)}`);
  assert.ok(r.stderr.includes('Initialized Kogen in '), `no Initialized Kogen line: ${describe(r)}`);
  assert.equal(r.status, '', `git status: ${describe(r)}`);
  assert.equal(r.headUnchanged, false, `no new commit: ${describe(r)}`);
}
function observeAbsent(r, text) {
  assert.ok(!r.stdout.includes(text) && !r.stderr.includes(text), `output contains ${JSON.stringify(text)}: ${describe(r)}\nstdout: ${r.stdout}`);
}
function observeNoSecret(r) {
  SECRETS.forEach((s, i) => assert.ok(!r.stdout.includes(s) && !r.stderr.includes(s), `output contains the fixture ${SECRET_NAMES[i]}`));
}

if (require.main === module) {
  // Controls for the observers above; FIRST and BLOCK are the feature's expected texts.
  const FIRST = 'provider/login: not signed in; run kogen provider login for a supported provider';
  const LINES = [
    'browser sign-in: kogen provider login chatgpt',
    'no browser, Anthropic API key on standard input: printf \'%s\' "$ANTHROPIC_API_KEY" | kogen provider login anthropic',
    'no browser, Claude Code token on standard input: printf \'%s\' "$CLAUDE_CODE_OAUTH_TOKEN" | kogen provider login claude-code',
    'kogen provider --help lists every route',
    'with anthropic or claude-code, init then needs the configuration-first files described in docs/getting-started.md ("Without ChatGPT")',
  ];
  const BLOCK = [FIRST, ...LINES.map(l => '  ' + l)].join('\n');
  const refusal = {code: 4, exit: 4, error: FIRST, configured: false, stdout: JSON.stringify({exit: 4, configuration: null, error: FIRST}) + '\n', stderr: BLOCK + '\n', requests: 0, status: '', headUnchanged: true};
  const proceeds = {code: 0, exit: 0, error: null, configured: true, stdout: '{"exit":0,"configuration":{"path":".kogen/project.yaml","content":"version: 1\\n"},"error":null}\n',
    stderr: 'kogen: selected chatgpt for discovery and shape, build and review\nInitialized Kogen in /tmp/repo\nCommit: 0123abcd Add Kogen configuration\n', requests: 1, status: '', headUnchanged: false};
  const checkRefusal = r => { observeRefusal(r, FIRST); observeLines(r, BLOCK); observeNoSecret(r); };
  const checkProceeds = r => { observeProceeds(r, 1); for (const t of ['not signed in', 'kogen provider login', 'kogen provider --help']) observeAbsent(r, t); observeNoSecret(r); };
  const copy = o => JSON.parse(JSON.stringify(o));
  const bads = [];
  const badRefusal = f => { const r = copy(refusal); f(r); bads.push(() => checkRefusal(r)); };
  const badProceeds = f => { const r = copy(proceeds); f(r); bads.push(() => checkProceeds(r)); };
  badRefusal(r => { r.stderr = FIRST + '\n'; });
  badRefusal(r => { r.stderr = [FIRST, ...LINES.slice(0, 4).map(l => '  ' + l)].join('\n') + '\n'; });
  badRefusal(r => { r.stderr = [FIRST, ...[LINES[1], LINES[0], ...LINES.slice(2)].map(l => '  ' + l)].join('\n') + '\n'; });
  badRefusal(r => { r.stderr = 'kogen: ' + BLOCK + '\n'; });
  badRefusal(r => { r.error = BLOCK; });
  badRefusal(r => { r.error = 'provider/not_signed_in: not signed in; run kogen provider login for a supported provider'; });
  badRefusal(r => { r.code = 1; });
  badRefusal(r => { r.exit = 3; });
  badRefusal(r => { r.configured = true; });
  badRefusal(r => { r.requests = 1; });
  badRefusal(r => { r.status = '?? .kogen/\n'; });
  badRefusal(r => { r.headUnchanged = false; });
  badRefusal(r => { r.stderr += '  printf \'%s\' "' + SECRETS[0] + '" | kogen provider login anthropic\n'; });
  badRefusal(r => { r.stdout += SECRETS[1]; });
  badProceeds(r => { r.stderr += BLOCK + '\n'; });
  badProceeds(r => { r.stderr += '  kogen provider --help lists every route\n'; });
  badProceeds(r => { r.code = 4; r.exit = 4; r.error = FIRST; });
  badProceeds(r => { r.requests = 0; });
  badProceeds(r => { r.configured = false; });
  badProceeds(r => { r.stderr = r.stderr.replace('Initialized Kogen in ', 'Configured '); });
  badProceeds(r => { r.stderr += 'token ' + SECRETS[2] + '\n'; });
  badProceeds(r => { r.stdout += SECRETS[3]; });
  if (process.argv[2] === 'good') {
    checkRefusal(refusal);
    checkRefusal({...refusal, stderr: 'kogen: something before\n' + BLOCK + '\n'});
    checkProceeds(proceeds);
    console.log('accepted');
  } else {
    bads.forEach((bad, i) => {
      let rejected = false; try { bad(); } catch (_) { rejected = true; }
      if (!rejected) throw new Error(`observer accepted bad control ${i}`);
    });
    console.log('rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(`${P}: kogen-setup runs in a committed repository whose home has {string}`, {timeout: 300000}, async function(login) {
    this.loginRefusal = await fixture(login);
  });
  Then(`${P}: kogen-setup exits 4 with no configuration, no provider request, no new commit and the JSON error:`, function(text) { observeRefusal(this.loginRefusal, text); });
  Then(`${P}: stderr has these consecutive lines:`, function(text) { observeLines(this.loginRefusal, text); });
  Then(`${P}: kogen-setup initializes the repository with exit 0 after {int} provider request`, function(n) { observeProceeds(this.loginRefusal, n); });
  Then(`${P}: no output contains {string}`, function(text) { observeAbsent(this.loginRefusal, text); });
  Then(`${P}: no output contains a fixture environment value or saved credential`, function() { observeNoSecret(this.loginRefusal); });
}
