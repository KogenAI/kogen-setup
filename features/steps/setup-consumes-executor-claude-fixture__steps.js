const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const P = 'setup-consumes-executor-claude-fixture: ';
const EXECUTOR = 'github.com/KogenAI/kogen-executor';
const CONSUMER_TEST = 'consumes/kogen-executor/executor_test.go';
const FIXTURE_SCRIPT = 'testkit/clauderuntime/script.go';
const FOCUSED = '^(TestClaudeRounds|TestHookAndToolDefinitions)$';
// Setup's own sources and the other three consumer suites; none may change in this Build.
const UNCHANGED_TREES = ['cmd', 'contract', 'setup', 'consumes/kogen-coordinator', 'consumes/kogen-loop', 'consumes/kogen-verification'];

function go(args, extraEnv, timeout) {
  const r = spawnSync('go', args, {
    encoding: 'utf8',
    timeout: timeout || 200000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...(extraEnv || {}) },
  });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error };
}

function describe(cmd, r) {
  return `${cmd} exited ${r.status}${r.error ? ` (${r.error})` : ''}:\n${r.out}`;
}

function moduleVersion(mod) {
  const r = go(['list', '-m', '-f', '{{.Version}}', mod], { GOFLAGS: '-mod=readonly' });
  assert.equal(r.status, 0, describe(`go list -m ${mod}`, r));
  return r.out.trim();
}

function moduleDir(mod) {
  const r = go(['list', '-m', '-f', '{{.Dir}}', mod], { GOFLAGS: '-mod=readonly' });
  assert.equal(r.status, 0, describe(`go list -m ${mod}`, r));
  return r.out.trim();
}

Then(P + 'the module graph resolves {string} at version {string}', { timeout: 220000 }, function (mod, version) {
  assert.equal(moduleVersion(mod), version, `${mod} must resolve through go.mod and go.sum at ${version}`);
});

Then(P + 'go.mod requires only the Kogen modules coordinator, executor, loop and verification and replaces nothing', function () {
  const mod = fs.readFileSync('go.mod', 'utf8');
  const kogen = [...mod.matchAll(/github\.com\/KogenAI\/([a-z-]+) v/g)].map((m) => m[1]).sort();
  assert.deepEqual(kogen, ['kogen-coordinator', 'kogen-executor', 'kogen-loop', 'kogen-verification'], `go.mod Kogen requirements:\n${mod}`);
  assert.ok(/^module github\.com\/KogenAI\/kogen-setup$/m.test(mod), `go.mod module path:\n${mod}`);
  assert.ok(!/^\s*replace\b/m.test(mod), `go.mod must not replace any module:\n${mod}`);
});

Then(P + 'the resolved Executor module provides the fixture accessors Args and Token', { timeout: 220000 }, function () {
  const file = path.join(moduleDir(EXECUTOR), 'testkit', 'clauderuntime', 'fixture.go');
  const src = fs.readFileSync(file, 'utf8');
  for (const want of ['func (f *Fixture) Args(t testing.TB, n int) []string', 'func (f *Fixture) Token(t testing.TB, n int) string', 'func Install(t testing.TB, o Options) *Fixture']) {
    assert.ok(src.includes(want), `${file} must declare ${want}`);
  }
});

Then(P + 'the module graph builds with readonly modules', { timeout: 220000 }, function () {
  const r = go(['build', './...'], { GOFLAGS: '-mod=readonly' });
  assert.equal(r.status, 0, describe('GOFLAGS=-mod=readonly go build ./...', r));
});

function digestTrees() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(p);
    }
  };
  for (const t of UNCHANGED_TREES) walk(t);
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f); h.update('\0'); h.update(fs.readFileSync(f)); h.update('\0');
  }
  return { digest: h.digest('hex'), count: files.length };
}

Then(P + 'the sources of the CLI, the contract suite, Setup and the other consumer suites are unchanged with digest {string}', function (expected) {
  const { digest, count } = digestTrees();
  assert.equal(digest, expected, `${UNCHANGED_TREES.join(', ')} (${count} files) must keep their bytes; this check reads only the working tree`);
});

function consumerSource() {
  return fs.readFileSync(CONSUMER_TEST, 'utf8');
}

Then(P + 'the Executor consumer test installs the signed fixture and reads Args and Token from it', function () {
  const src = consumerSource();
  assert.ok(src.includes('"github.com/KogenAI/kogen-executor/testkit/clauderuntime"'), `${CONSUMER_TEST} must import the Executor fixture package`);
  assert.ok(/clauderuntime\.Install\(/.test(src), `${CONSUMER_TEST} must install the fake runtime with clauderuntime.Install`);
  assert.ok(/\.Args\(t, /.test(src), `${CONSUMER_TEST} must read the runtime's arguments through the fixture's Args accessor`);
  assert.ok(/\.Token\(t, /.test(src), `${CONSUMER_TEST} must read the token through the fixture's Token accessor`);
});

Then(P + 'the Executor consumer test no longer carries its own fake Claude program', function () {
  const src = consumerSource();
  assert.ok(!src.includes('#!/bin/sh'), `${CONSUMER_TEST} must not embed a shell fake runtime`);
  assert.ok(!/claudecode\.RuntimePath\(home\), \[\]byte/.test(src), `${CONSUMER_TEST} must not write a runtime program itself`);
  assert.ok(!/filepath\.Join\(home, "(args|token|prompt)"\)/.test(src), `${CONSUMER_TEST} must not read the files of the old fake program`);
});

Then(P + 'the Executor consumer test still names {string}', function (literal) {
  assert.ok(consumerSource().includes(literal), `${CONSUMER_TEST} must still contain ${JSON.stringify(literal)}`);
});

Then(P + 'the focused Executor consumer tests TestClaudeRounds and TestHookAndToolDefinitions pass', { timeout: 220000 }, function () {
  const r = go(['test', '-count=1', '-v', '-run', FOCUSED, './consumes/kogen-executor/']);
  assert.equal(r.status, 0, describe('go test -count=1 -v -run ' + FOCUSED + ' ./consumes/kogen-executor/', r));
  for (const name of ['TestClaudeRounds', 'TestHookAndToolDefinitions']) {
    assert.ok(r.out.includes(`--- PASS: ${name} `), `${name} must run and pass, not be absent or skipped:\n${r.out}`);
  }
});

Then(P + 'go test succeeds for {string}', { timeout: 240000 }, function (pkg) {
  const r = go(['test', '-count=1', pkg], undefined, 230000);
  assert.equal(r.status, 0, describe(`go test -count=1 ${pkg}`, r));
});

// The fixture runtime of the pinned Executor module, changed in one way, must make the consumer
// test fail. The module is copied to a temporary directory and substituted through -modfile, so
// go.mod, go.sum and the module cache stay untouched.
const L = String.raw;
const ROUND_LINE = /^if \[ -f "\$STATE\/round-\$n\.jsonl" \].*$/m;
const ARGS_LINE = L`printf '%s\n' "$@" > "$STATE/args-$n.txt"`;
const TOKEN_LINE = L`if ( : <&3 ) 2>/dev/null; then cat <&3 > "$STATE/token-$n.bin"; fi`;
const PROMPT_LINE = L`cat > "$STATE/prompt-$n.bin"`;
const VERSION_LINE = /^ {2}echo "` \+ claudecode\.Version \+ ` \(Claude Code\)"$/m;
const result = (structured) => L`printf '{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"%s","num_turns":1,"terminal_reason":"completed","structured_output":${structured}}\n' "$sid"`;
const dropArg = (flag) => L`printf '%s\n' "$@" | sed '/^${flag}$/{N;d;}' > "$STATE/args-$n.txt"`;

const MUTATIONS = {
  'every round answers a structured output that is not an object': [ROUND_LINE, result('"not-an-object"')],
  'every round answers a structured output with other content': [ROUND_LINE, result('{"setup":["make"],"checks":[]}')],
  'every round answers no result line': [ROUND_LINE, ':'],
  'the second round answers a structured output that is not an object': [ROUND_LINE, `if [ "$n" = 2 ]; then ${result('"not-an-object"')}; else ${L`sed "s/@SID@/$sid/g" "$STATE/round-$n.jsonl"`}; fi`],
  'the arguments omit --model': [ARGS_LINE, dropArg('--model')],
  'the arguments omit --effort': [ARGS_LINE, dropArg('--effort')],
  'the arguments omit --json-schema': [ARGS_LINE, dropArg('--json-schema')],
  'the token read from file descriptor 3 has other bytes': [TOKEN_LINE, L`printf 'other-token' > "$STATE/token-$n.bin"`],
  'no token is read from file descriptor 3': [TOKEN_LINE, ':'],
  'the second round prompt lacks the retry feedback': [PROMPT_LINE, `if [ "$n" = 2 ]; then cat > /dev/null; printf 'policy input' > "$STATE/prompt-$n.bin"; else cat > "$STATE/prompt-$n.bin"; fi`],
  'the runtime reports another Claude Code version': [VERSION_LINE, '  echo "0.0.1 (Claude Code)"'],
};

let pristine;
function pristineModule() {
  if (pristine) return pristine;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-fixture-'));
  const dest = path.join(root, 'executor');
  fs.cpSync(moduleDir(EXECUTOR), dest, { recursive: true });
  const writable = (dir) => {
    fs.chmodSync(dir, 0o755);
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) writable(p);
      else fs.chmodSync(p, 0o644);
    }
  };
  writable(dest);
  pristine = { root, dir: dest };
  return pristine;
}

function runWithExecutorCopy(dir, name) {
  const modfile = path.join(path.dirname(dir), `${name}.mod`);
  fs.writeFileSync(modfile, `${fs.readFileSync('go.mod', 'utf8')}\nreplace ${EXECUTOR} => ${dir}\n`);
  fs.copyFileSync('go.sum', modfile.replace(/\.mod$/, '.sum'));
  return go(['test', `-modfile=${modfile}`, '-count=1', '-v', '-run', '^TestClaudeRounds$', './consumes/kogen-executor/']);
}

Then(P + 'TestClaudeRounds fails when the fixture runtime changes so that {string}', { timeout: 220000 }, function (change) {
  const mutation = MUTATIONS[change];
  assert.ok(mutation, `unknown fixture runtime change ${JSON.stringify(change)}`);
  const base = pristineModule();
  // Control: the unchanged copy of the same module passes, so a failure below comes from the change.
  const control = runWithExecutorCopy(base.dir, 'control');
  assert.equal(control.status, 0, describe('control run with the unchanged Executor copy', control));
  assert.ok(control.out.includes('--- PASS: TestClaudeRounds '), `control run must pass TestClaudeRounds:\n${control.out}`);
  const dir = path.join(base.root, `mutant-${crypto.createHash('sha1').update(change).digest('hex').slice(0, 8)}`);
  fs.cpSync(base.dir, dir, { recursive: true });
  const script = path.join(dir, FIXTURE_SCRIPT);
  const [anchor, replacement] = mutation;
  const before = fs.readFileSync(script, 'utf8');
  const found = typeof anchor === 'string' ? before.includes(anchor) : anchor.test(before);
  assert.ok(found, `the fixture script ${FIXTURE_SCRIPT} no longer contains ${anchor}; the change ${JSON.stringify(change)} cannot be applied`);
  const after = before.replace(anchor, () => replacement);
  assert.notEqual(after, before, `the change ${JSON.stringify(change)} left the fixture script unchanged`);
  fs.writeFileSync(script, after);
  const r = runWithExecutorCopy(dir, 'mutant');
  assert.ok(!r.out.includes('[build failed]') && !r.out.includes('[setup failed]'), `the changed fixture must still compile:\n${r.out}`);
  assert.notEqual(r.status, 0, `TestClaudeRounds must fail when ${change}:\n${r.out}`);
  assert.ok(r.out.includes('--- FAIL: TestClaudeRounds '), `go test must report TestClaudeRounds as failed when ${change}:\n${r.out}`);
});
