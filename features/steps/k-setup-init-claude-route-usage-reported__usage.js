'use strict';
// Runs the real setup command (cmd/kogen-setup) on a synthetic repository, on the Claude Code
// route through a scripted Claude Code runtime installed where Kogen runs it, or on the direct
// ChatGPT route through a scripted provider, and reads the init progress line from its stderr.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process');
const ROOT = process.cwd();
const P = 'k-setup-init-claude-route-usage-reported: ';
const VALID = {setup: [], fix: [], checks: [], protect: []};
const INVALID = {setup: [], fix: [], checks: [{name: 'c'.repeat(65), run: 'test -f README.md'}], protect: []};
const INVALID_ERROR = 'provider/init_invalid: the model did not return a valid configuration; nothing was written';
const claudeSource = `#!${process.execPath}
const fs=require('node:fs');const a=process.argv.slice(2);
if(a[0]==='--version'){console.log('2.1.312 (Claude Code)');process.exit(0);}
if(a[0]==='auth'){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}));process.exit(0);}
const at=a.indexOf('--session-id')>=0?a.indexOf('--session-id'):a.indexOf('--resume');const sid=a[at+1];
const token=fs.readFileSync(3,'utf8');if(token!=='fixture-token')throw Error('fixture token not delivered');
let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{
const log=process.env.USAGE_FIXTURE_LOG;const n=fs.existsSync(log)?fs.readFileSync(log,'utf8').split('\\n').filter(Boolean).length:0;
fs.appendFileSync(log,JSON.stringify({args:a,input})+'\\n');
const round=JSON.parse(fs.readFileSync(process.env.USAGE_FIXTURE_SCRIPT,'utf8'))[n];
if(!round){process.stderr.write('no scripted round '+(n+1)+'\\n');process.exit(9);}
console.log(JSON.stringify({type:'system',subtype:'init',cwd:process.cwd(),session_id:sid,mcp_servers:[],model:'claude-sonnet-5-5',permissionMode:'acceptEdits',apiKeySource:'none',claude_code_version:'2.1.312'}));
const result={type:'result',subtype:'success',is_error:false,num_turns:1,session_id:sid,result:'',terminal_reason:'completed',stop_reason:'end_turn',permission_denials:[],structured_output:round.answer,total_cost_usd:0};
if(round.usage)result.usage=round.usage;
console.log(JSON.stringify(result));
});
`;
// parseRounds reads "invalid 100/40/10, valid 50/50/5" (Claude Code: input/cached/output as the
// executor reports them) or "valid 100/0/20/5" (direct: input/cached/output/reasoning); "none"
// is a round that reports no usage.
function parseRounds(text) {
  return text.split(',').map(s => s.trim()).map(s => {
    const m = /^(valid|invalid) (none|\d+(?:\/\d+){2,3})$/.exec(s);
    assert.ok(m, `bad round ${JSON.stringify(s)}`);
    return {answer: m[1] === 'valid' ? VALID : INVALID, usage: m[2] === 'none' ? null : m[2].split('/').map(Number)};
  });
}
function claudeUsage(u) {
  if (!u) return null;
  assert.equal(u.length, 3, 'a Claude Code round reports input/cached/output');
  // The executor's Input is input_tokens + cache_read_input_tokens + cache_creation_input_tokens.
  return {input_tokens: u[0] - u[1], cache_read_input_tokens: u[1], cache_creation_input_tokens: 0, output_tokens: u[2]};
}
function responsesUsage(u) {
  if (!u) return null;
  assert.equal(u.length, 4, 'a direct round reports input/cached/output/reasoning');
  return {input_tokens: u[0], input_tokens_details: {cached_tokens: u[1]}, output_tokens: u[2], output_tokens_details: {reasoning_tokens: u[3]}};
}
function frame(v) { return 'data: ' + JSON.stringify(v) + '\n\n'; }
let built = null;
function binary() {
  if (built) return built;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-usage-bin-'));
  const exe = path.join(dir, 'kogen-setup');
  const r = cp.spawnSync('go', ['build', '-o', exe, './cmd/kogen-setup'], {cwd: ROOT, encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `go build -o ${exe} ./cmd/kogen-setup failed with status ${r.status}: ${r.error || ''}${r.stdout}${r.stderr}`);
  built = exe;
  return exe;
}
function sync(cmd, args, cwd, env) {
  const r = cp.spawnSync(cmd, args, {cwd, env, encoding: 'utf8', timeout: 60000});
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}
function put(p, text, mode = 0o600) { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, text, {mode}); }
// runInit runs the setup command on route "claude-code" or "chatgpt" with the scripted rounds.
async function runInit(route, roundsText) {
  const rounds = parseRounds(roundsText);
  const exe = binary();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'init-usage-'));
  const repo = path.join(tmp, 'repo'), home = path.join(tmp, 'home'), bin = path.join(tmp, 'bin');
  for (const d of [repo, home, bin, path.join(tmp, 'cucumber'), path.join(tmp, 'hooks')]) fs.mkdirSync(d, {recursive: true});
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', b => body += b); req.on('end', () => {
      calls.push(req.url);
      const round = rounds[calls.length - 1];
      if (!round) { res.writeHead(400, {'Content-Type': 'application/json'}); res.end('{"error":{"message":"no scripted reply","code":"invalid_request_error"}}'); return; }
      const call = {type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'submit_configuration', arguments: JSON.stringify(round.answer), status: 'completed'};
      const response = {id: 'r' + calls.length, status: 'completed'};
      const usage = responsesUsage(round.usage);
      if (usage) response.usage = usage;
      res.writeHead(200, {'Content-Type': 'text/event-stream'});
      res.end(frame({type: 'response.output_item.done', output_index: 0, item: call}) + frame({type: 'response.completed', response}));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const env = {...process.env, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', KOGEN_PROVIDER_URL: `http://127.0.0.1:${server.address().port}`,
      USAGE_FIXTURE_LOG: path.join(tmp, 'claude.log'), USAGE_FIXTURE_SCRIPT: path.join(tmp, 'claude-rounds.json')};
    for (const k of Object.keys(env)) if (/^(GIT_(AUTHOR|COMMITTER|DIR|WORK_TREE|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)|ANTHROPIC_|OPENAI_|CLAUDE_CODE_OAUTH|KOGEN_ACCEPTANCE_|KOGEN_QUINT)/.test(k)) delete env[k];
    put(path.join(bin, 'node'), '#!/bin/sh\n[ -n "$KOGEN_ACCEPTANCE_REPORT" ] && echo \'{}\' > "$KOGEN_ACCEPTANCE_REPORT"\nexit 0\n', 0o755);
    env.PATH = bin + ':' + process.env.PATH; env.KOGEN_NODE = path.join(bin, 'node'); env.KOGEN_CUCUMBER = path.join(tmp, 'cucumber');
    if (route === 'claude-code') {
      put(path.join(home, '.kogen/credentials/claude-code.json'), JSON.stringify({provider: 'claude-code', api_key: 'fixture-token'}));
      put(path.join(home, '.kogen/claude-code/2.1.312/claude'), claudeSource, 0o700);
      put(env.USAGE_FIXTURE_SCRIPT, JSON.stringify(rounds.map(r => ({answer: r.answer, usage: claudeUsage(r.usage)}))));
    } else {
      assert.equal(route, 'chatgpt');
      for (const r of rounds) responsesUsage(r.usage);
      put(path.join(home, '.kogen/credentials/chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600}));
    }
    const git = (...a) => sync('git', a, repo, env);
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', path.join(tmp, 'hooks'));
    put(path.join(repo, 'README.md'), '# Fixture\n', 0o644);
    git('add', '-A'); git('commit', '-qm', 'Seed');
    const child = await new Promise((resolve, reject) => {
      const p = cp.spawn(exe, [repo], {cwd: tmp, env, stdio: ['ignore', 'pipe', 'pipe']});
      let out = '', err = '';
      const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('kogen-setup exceeded 120 seconds')); }, 120000);
      p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b);
      p.on('error', reject); p.on('close', code => { clearTimeout(timer); resolve({code, out, err}); });
    });
    const log = fs.existsSync(env.USAGE_FIXTURE_LOG) ? fs.readFileSync(env.USAGE_FIXTURE_LOG, 'utf8').split('\n').filter(Boolean) : [];
    let result = null;
    try { result = JSON.parse(child.out); } catch (_) { /* reported by the observers */ }
    return {route, code: child.code, stdout: child.out, stderr: child.err, result, rounds: route === 'claude-code' ? log.length : calls.length, otherRoute: route === 'claude-code' ? calls.length : log.length};
  } finally {
    await new Promise(r => server.close(r));
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
function describe(o) { return `route ${o.route}, exit ${o.code}, ${o.rounds} rounds\nstdout: ${o.stdout}\nstderr:\n${o.stderr}`; }
function lines(o) { return o.stderr.split('\n').filter(l => l !== ''); }
function usageLines(o) { return lines(o).filter(l => l.startsWith('kogen: init ')); }
function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// observeRounds: the scripted model answered exactly n rounds on the requested route only.
function observeRounds(o, n) {
  assert.equal(o.rounds, n, `scripted rounds answered on ${o.route}: ${describe(o)}`);
  assert.equal(o.otherRoute, 0, `the other route was used: ${describe(o)}`);
}
// observeSuccess: Init exited 0 with the configuration written.
function observeSuccess(o) {
  assert.equal(o.code, 0, describe(o));
  assert.ok(o.result && o.result.exit === 0 && o.result.error === null && o.result.configuration, `kogen-setup result: ${describe(o)}`);
}
// observeLine: stderr has exactly one init progress line, `<want> wall_ms=<digits>`.
function observeLine(o, want) {
  const got = usageLines(o);
  assert.equal(got.length, 1, `init progress lines ${JSON.stringify(got)}: ${describe(o)}`);
  assert.match(got[0], new RegExp('^' + escape(want) + ' wall_ms=\\d+$'), `init progress line: ${describe(o)}`);
}
// observeInvalid: exit 4, the init_invalid error, nothing written, and the error is the last
// stderr line, after the init progress line.
function observeInvalid(o, want) {
  assert.equal(o.code, 4, describe(o));
  assert.ok(o.result && o.result.exit === 4 && o.result.error === INVALID_ERROR && o.result.configuration === null, `kogen-setup result: ${describe(o)}`);
  observeLine(o, want);
  const all = lines(o);
  assert.equal(all[all.length - 1], INVALID_ERROR, `last stderr line: ${describe(o)}`);
  assert.ok(all.indexOf(usageLines(o)[0]) < all.length - 1, `usage line before the error: ${describe(o)}`);
}
if (require.main === module && process.argv[2] === '--control') {
  // Observer controls: real runs qualify the fixture (rounds, exit); the known-good and known-bad
  // stderr differ only in the init progress line, so the observers are judged on it.
  const swap = (o, text) => ({...o, stderr: o.stderr.replace(/^kogen: init (\S+) .* wall_ms=(\d+)$/m, (_, role, ms) => `kogen: init ${role} ${text} wall_ms=${ms}`)});
  const insertBeforeError = (o, text) => ({...o, stderr: o.stderr.replace(INVALID_ERROR + '\n', `kogen: init claude-sonnet-5-5/high ${text} wall_ms=7\n` + INVALID_ERROR + '\n')});
  const strip = o => ({...o, stderr: lines(o).filter(l => !l.startsWith('kogen: init ')).join('\n') + '\n'});
  (async () => {
    const mode = process.argv[3];
    let fixtures;
    try {
      const one = await runInit('claude-code', 'valid 100/40/10');
      const two = await runInit('claude-code', 'invalid 100/40/10, valid 50/50/5');
      const none = await runInit('claude-code', 'valid none');
      const bad = await runInit('claude-code', 'invalid 100/40/10, invalid 50/50/5');
      const direct = await runInit('chatgpt', 'valid 100/0/20/5');
      observeRounds(one, 1); observeSuccess(one); observeRounds(two, 2); observeSuccess(two); observeRounds(none, 1); observeSuccess(none);
      observeRounds(bad, 2); assert.equal(bad.code, 4, describe(bad)); observeRounds(direct, 1); observeSuccess(direct);
      observeLine(direct, 'kogen: init gpt-6.1-sol/high input=100 cached=0 output=20 reasoning=5');
      fixtures = {one, two, none, bad: strip(bad)};
    } catch (e) { console.log('broken'); console.error(e.stack); process.exitCode = 2; return; }
    const {one, two, none, bad} = fixtures;
    const zero = 'input=0 cached=0 output=0 reasoning=0';
    const cases = mode === 'bad' ? [
      () => observeLine(swap(one, zero), 'kogen: init claude-sonnet-5-5/high input=100 cached=40 output=10 reasoning=0'),
      () => observeLine(swap(two, 'input=50 cached=50 output=5 reasoning=0'), 'kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0'),
      () => observeLine(swap(none, zero), 'kogen: init claude-sonnet-5-5/high usage=unknown'),
      () => observeInvalid(bad, 'kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0'),
      () => observeInvalid({...bad, stderr: bad.stderr + 'kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0 wall_ms=7\n'}, 'kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0'),
    ] : [
      () => observeLine(swap(one, 'input=100 cached=40 output=10 reasoning=0'), 'kogen: init claude-sonnet-5-5/high input=100 cached=40 output=10 reasoning=0'),
      () => observeLine(swap(two, 'input=150 cached=90 output=15 reasoning=0'), 'kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0'),
      () => observeLine(swap(none, 'usage=unknown'), 'kogen: init claude-sonnet-5-5/high usage=unknown'),
      () => observeInvalid(insertBeforeError(bad, 'input=150 cached=90 output=15 reasoning=0'), 'kogen: init claude-sonnet-5-5/high input=150 cached=90 output=15 reasoning=0'),
    ];
    let accepted = 0;
    for (const c of cases) { try { c(); accepted++; } catch (e) { if (mode !== 'bad') console.error(e.stack); } }
    if (mode === 'bad') { if (accepted === 0) { console.log('rejected'); process.exitCode = 1; } else console.log('accepted'); }
    else if (accepted === cases.length) console.log('accepted');
    else { console.log('rejected'); process.exitCode = 1; }
  })();
} else if (require.main !== module) {
  const {When, Then} = require('@cucumber/cucumber');
  When(P + 'init runs on the {string} route with rounds {string}', {timeout: 300000}, async function (route, rounds) { this.initUsage = await runInit(route, rounds); });
  Then(P + 'the scripted model answered {int} round(s)', function (n) { observeRounds(this.initUsage, n); });
  Then(P + 'init succeeds', function () { observeSuccess(this.initUsage); });
  Then(P + 'the init progress line reads {string} with its wall time', function (want) { observeLine(this.initUsage, want); });
  Then(P + 'stderr does not contain {string}', function (text) { assert.ok(!this.initUsage.stderr.includes(text), `stderr contains ${JSON.stringify(text)}: ${describe(this.initUsage)}`); });
  Then(P + 'init stops with exit 4 and the init_invalid error after the progress line {string}', function (want) { observeInvalid(this.initUsage, want); });
}
