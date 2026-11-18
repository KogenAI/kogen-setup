'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const ROOT = fs.realpathSync(process.cwd());
const SLUG = 'setup-init-qualifies-git-reading-checks';
const FEATURE = '.kogen/intents/' + SLUG + '/acceptance.feature';

function sync(exe, args, cwd, env) {
  const r = spawnSync(exe, args, {cwd, env, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024});
  assert.equal(r.status, 0, `${exe} ${args.join(' ')}: ${r.error || ''}\n${r.stdout || ''}${r.stderr || ''}`);
  return r.stdout;
}
function run(exe, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, {cwd, env});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('init exceeded 90 seconds')); }, 90000);
    p.stdout.on('data', b => stdout += b);
    p.stderr.on('data', b => stderr += b);
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', status => { clearTimeout(timer); resolve({status, stdout, stderr}); });
  });
}

// hooks lists the real repository's hook files with a digest of each.
function hooks(repo) {
  const dir = path.join(repo, '.git', 'hooks');
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir).sort().map(n => n + ':' + crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, n))).digest('hex')).join('\n');
}

// exercise commits the case's files in a fresh repository, applies its uncommitted edits, serves
// the case's proposal from a local scripted provider and runs the compiled standalone init
// command on it. It returns the summary and the state of the real repository before and after.
async function exercise(c, base) {
  const bin = path.join(base, 'bin'), home = path.join(base, 'home'), repo = path.join(base, 'repo');
  for (const p of [bin, home, repo]) fs.mkdirSync(p, {recursive: true});
  const realGit = sync('sh', ['-c', 'command -v git'], ROOT, process.env).trim();
  const env = {...process.env, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0'};
  delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE;
  const git = (...a) => sync(realGit, a, repo, env).trim();
  git('init', '-q'); git('config', 'user.name', 'Init Fixture'); git('config', 'user.email', 'init@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  for (const [f, content] of Object.entries(c.files)) fs.writeFileSync(path.join(repo, f), content);
  git('add', '-A'); git('commit', '-qm', 'Seed');
  for (const [f, content] of Object.entries(c.dirty || {})) fs.writeFileSync(path.join(repo, f), content);
  const state = () => ({log: git('log', '--format=%s'), config: git('config', '--local', '--list'), hooks: hooks(repo), status: git('status', '--porcelain')});
  const before = state();
  const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive: true});
  fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access', refresh_token: 'fake-refresh', expires_at: 4102444800}));
  const server = http.createServer((req, res) => { req.resume(); req.on('end', () => {
    const call = {type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'submit_configuration', arguments: JSON.stringify(c.proposal), status: 'completed'};
    res.writeHead(200, {'Content-Type': 'text/event-stream'});
    res.end('data: ' + JSON.stringify({type: 'response.output_item.done', output_index: 0, item: call}) + '\n\n' + 'data: ' + JSON.stringify({type: 'response.completed', response: {usage: {input_tokens: 100, input_tokens_details: {cached_tokens: 0}, output_tokens: 20, output_tokens_details: {reasoning_tokens: 5}}}}) + '\n\n');
  }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const cli = path.join(base, 'kogen-setup');
  try {
    sync('go', ['build', '-o', cli, './cmd/kogen-setup'], ROOT, process.env);
    const r = await run(cli, [repo], ROOT, {...env, KOGEN_PROVIDER_URL: `http://127.0.0.1:${server.address().port}`});
    return {...r, before, after: state()};
  } finally { await new Promise(resolve => server.close(resolve)); }
}

// judge accepts a run whose summary has every wanted line exactly and none of the unwanted texts,
// and, for a case that names the real repository's expectations, whose real repository changed
// only by init's own configuration commit.
function judge(c, r) {
  const lines = r.stderr.split('\n');
  for (const want of c.want) assert.ok(lines.includes(want), `init summary lacks the exact line ${JSON.stringify(want)} (init exit status ${r.status}):\n${r.stderr}`);
  for (const text of c.notWant || []) assert.ok(!r.stderr.includes(text), `the init output contains ${JSON.stringify(text)}:\n${r.stderr}`);
  assert.equal(r.status, 0, `init exit status ${r.status}:\n${r.stderr}`);
  if (c.realRepo) {
    assert.equal(r.after.log, 'Add Kogen configuration\n' + r.before.log, `the real repository history is not the seed plus init's one commit:\n${r.after.log}`);
    assert.equal(r.after.config, r.before.config, 'the real repository configuration changed');
    assert.equal(r.after.hooks, r.before.hooks, 'the real repository hooks changed');
  }
  if (c.dirty) assert.equal(r.after.status, r.before.status, `the real working tree changed:\n${r.after.status}`);
}

async function scenario(c) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'init-git-copy-'));
  try { judge(c, await exercise(c, base)); } finally { fs.rmSync(base, {recursive: true, force: true}); }
}

if (require.main === module) {
  // Observer controls: the failing-check case, whose summary the feature leaves unchanged, is
  // accepted; the same real run is rejected under an expectation it does not meet.
  (async () => {
    const cases = fs.readFileSync(FEATURE, 'utf8').split('"""').filter((_, i) => i % 2 === 1).map(JSON.parse);
    const c = cases.find(x => x.want.some(l => l.includes('failed with status 1')));
    const r = await exercise(c, fs.mkdtempSync(path.join(os.tmpdir(), 'init-git-copy-obs-')));
    judge(c, r);
    if (process.argv[2] === 'bad') judge({...c, want: [...c.want, 'Checks: tracked']}, r);
    console.log('observer accepted');
  })().catch(e => { console.error(e.message.split('\n')[0].slice(0, 60)); process.exitCode = 1; });
} else {
  const {Then} = require('@cucumber/cucumber');
  Then(SLUG + ': init summarises the case', {timeout: 110000}, async function (doc) { await scenario(JSON.parse(doc)); });
}
