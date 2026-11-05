'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process'), assert = require('node:assert/strict');
const KEYS = ['code', 'exit', 'error', 'configuration', 'initialized', 'requests', 'paths', 'status', 'headUnchanged'];
function observe(actual, expected) {
  for (const key of KEYS) assert.deepStrictEqual(actual[key], expected[key], `kogen-setup ${key} after Init's failed .gitignore write: ${JSON.stringify(actual)}`);
  assert.deepStrictEqual(actual, expected, 'whole kogen-setup outcome after the failed .gitignore write');
}
function sync(cmd, args, cwd, env) {
  const r = cp.spawnSync(cmd, args, {cwd, env, encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}
function run(cmd, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(cmd, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`kogen-setup exceeded 120 seconds: ${out}${err}`)); }, 120000);
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
// The fixture commits README.md, creates the input's untracked directories, and makes .gitignore an
// excluded symlink to a file in a missing directory: Init then creates .kogen, writes
// .kogen/project.yaml and fails writing .gitignore.
async function fixture(input) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fix-failed-write-')));
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
    put(path.join(home, '.kogen/credentials/chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access', refresh_token: 'fake-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600}), 0o600);
    const git = (...a) => sync('git', a, repo, env);
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', hooks);
    put(path.join(repo, 'README.md'), '# notes\n');
    git('add', '-A'); git('commit', '-qm', 'fixture');
    put(path.join(repo, '.git/info/exclude'), '.gitignore\n');
    for (const d of input.dirs) fs.mkdirSync(path.join(repo, d), {recursive: true});
    fs.symlinkSync(path.join(base, 'missing', 'gitignore'), path.join(repo, '.gitignore'));
    const head = git('rev-parse', 'HEAD');
    const exe = path.join(base, 'kogen-setup');
    sync('go', ['build', '-o', exe, './cmd/kogen-setup'], process.cwd(), process.env);
    const child = await run(exe, [repo], base, env);
    let value;
    try { value = JSON.parse(child.out); } catch (e) { throw new Error(`kogen-setup stdout is not one JSON object: ${child.out}\n${child.err}`); }
    const paths = {};
    for (const p of input.observe) { try { fs.lstatSync(path.join(repo, p)); paths[p] = true; } catch (_) { paths[p] = false; } }
    return {code: child.code, exit: value.exit, error: value.error === null ? null : value.error.split(repo).join('{repo}'), configuration: value.configuration,
      initialized: child.err.includes('Initialized Kogen'), requests, paths, status: git('status', '--porcelain'), headUnchanged: git('rev-parse', 'HEAD') === head};
  } finally { await new Promise(r => server.close(r)); fs.rmSync(base, {recursive: true, force: true}); }
}
if (require.main === module) {
  const error = 'open {repo}/.gitignore: no such file or directory';
  const removed = {code:70,exit:70,error,configuration:null,initialized:false,requests:1,paths:{'.kogen':false,'.kogen/project.yaml':false,'.kogen/models.yaml':false,'features':false},status:'',headUnchanged:true};
  const kept = JSON.parse(JSON.stringify(removed)); kept.paths['.kogen'] = true;
  // Observed on unchanged main: the written file is removed but the new .kogen directory stays.
  const main = JSON.parse(JSON.stringify(kept));
  if (process.argv[2] === 'good') { observe(removed, removed); observe(kept, kept); console.log('accepted'); }
  else {
    const bads = [[main, removed], [removed, kept]];
    for (const mutate of [r=>{r.code=0},r=>{r.exit=0},r=>{r.error+='; restoring files: boom'},r=>{r.configuration={path:'.kogen/project.yaml',content:'version: 1\n'}},r=>{r.initialized=true},r=>{r.requests=0},r=>{r.paths['.kogen/project.yaml']=true},r=>{r.paths['.kogen/models.yaml']=true},r=>{r.status='?? .kogen/\n'},r=>{r.headUnchanged=false}]) {
      const bad = JSON.parse(JSON.stringify(removed)); mutate(bad); bads.push([bad, removed]);
    }
    for (const [bad, expected] of bads) {
      let rejected = false; try { observe(bad, expected); } catch (_) { rejected = true; }
      if (!rejected) throw new Error('observer accepted bad control');
    }
    console.log('rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('fix-k-setup-written-config-matches-verified: kogen-setup runs and its .gitignore write fails, with:', {timeout:300000}, async function(text) {
    this.fixFailedWrite = await fixture(JSON.parse(text));
  });
  Then('fix-k-setup-written-config-matches-verified: the outcome is:', function(text) { observe(this.fixFailedWrite, JSON.parse(text)); });
  Then('fix-k-setup-written-config-matches-verified: the existing setup tests pass', {timeout:300000}, function() {
    const r = cp.spawnSync('go', ['test','./setup','-count=1'], {encoding:'utf8', timeout:270000});
    assert.equal(r.status, 0, `go test ./setup -count=1 failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  });
}
