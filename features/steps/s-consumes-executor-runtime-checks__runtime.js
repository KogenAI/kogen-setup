'use strict';
// Runs the tests that stand in for Kogen's managed Claude Code runtime, TestClaudeRounds
// (consumes/kogen-executor) and the Claude Code route usage feature
// (k-setup-init-claude-route-usage-reported), twice: against the kogen-executor that go.mod pins,
// and against a temporary copy of that module with the runtime checks of kogen-executor's Build
// kogen-runs-unverified-claude-code-runtime. Outside a test origin (KOGEN_CLAUDE_CODE_URL set) the
// runtime must be the pinned size for the platform, and the file, its version folder and
// <home>/.kogen/claude-code must be owned by the current user and not writable by group or others.
// The copy is used through GOFLAGS=-modfile=<tmp>/go.mod with a replace directive, so the
// checkout's go.mod and go.sum are never changed.
//
// Run directly (`node <this file> [--keep-test-origin]`) it prints one line per run and exits 0
// only when all four runs pass: the observer controls of the Intent's Feasibility.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const ROOT = process.cwd();
const P = 's-consumes-executor-runtime-checks: ';
const MODULE = 'github.com/KogenAI/kogen-executor';
const TEST = 'TestClaudeRounds';
const TEST_ARGS = ['test', '-count=1', '-v', '-run', '^TestClaudeRounds$', './consumes/kogen-executor/'];
const USAGE_FEATURE = '.kogen/intents/k-setup-init-claude-route-usage-reported/acceptance.feature';
const USAGE_SUMMARY = '8 scenarios (8 passed)';
const LABELS = {pinned: 'pinned kogen-executor', checked: 'kogen-executor with the runtime checks'};
const NAMES = {test: TEST, feature: 'Claude Code route usage feature'};
// ANCHOR ends runtimeUsable in the pinned executor/claudecode/runtime.go; CHECKS goes before it.
const ANCHOR = '\treturn true, nil\n}\n\n// ensureRuntime';
const CHECKS = `\tif want, ok := pinFor(runtime.GOOS, runtime.GOARCH); ok {
\t\tif _, seam := os.LookupEnv(SeamEnv); !seam && info.Size() != want.size {
\t\t\treturn false, unavailable(fmt.Sprintf("Kogen's Claude Code at %s is %d bytes, expected %d; remove %s and run again", p, info.Size(), want.size, RuntimeDir(home)))
\t\t}
\t}
\tfor _, q := range []string{p, RuntimeDir(home), Root(home)} {
\t\tst, err := os.Stat(q)
\t\tif err != nil {
\t\t\treturn false, unavailable("cannot inspect " + q + ": " + err.Error())
\t\t}
\t\tunsafe := ""
\t\tif sys, ok := st.Sys().(*syscall.Stat_t); ok && int(sys.Uid) != os.Getuid() {
\t\t\tunsafe = fmt.Sprintf("is owned by uid %d, not uid %d", sys.Uid, os.Getuid())
\t\t} else if st.Mode().Perm()&0o020 != 0 {
\t\t\tunsafe = "is writable by group"
\t\t} else if st.Mode().Perm()&0o002 != 0 {
\t\t\tunsafe = "is writable by others"
\t\t}
\t\tif unsafe != "" {
\t\t\treturn false, unavailable("Kogen's Claude Code at " + p + " is unsafe: " + q + " " + unsafe + "; remove " + RuntimeDir(home) + " and run again")
\t\t}
\t}
`;

function run(cmd, args, env, timeout) {
  const r = cp.spawnSync(cmd, args, {cwd: ROOT, env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024});
  return {command: [cmd, ...args].join(' '), goflags: env.GOFLAGS || '', status: r.status, signal: r.signal, error: r.error ? String(r.error) : '', stdout: r.stdout || '', output: (r.stdout || '') + (r.stderr || '')};
}
// env is the caller's environment without the acceptance report variables, a Go workspace, Go
// flags or (unless keepOrigin) a test origin, so only the stand-ins themselves can set one.
function env(keepOrigin, goflags) {
  const e = {...process.env, GOWORK: 'off'};
  for (const k of ['GOFLAGS', 'KOGEN_ACCEPTANCE_REPORT', 'KOGEN_ACCEPTANCE_FEATURES']) delete e[k];
  if (!keepOrigin) delete e.KOGEN_CLAUDE_CODE_URL;
  if (goflags) e.GOFLAGS = goflags;
  return e;
}
// checkedModfile copies the pinned module into tmp, adds the runtime checks to runtimeUsable in
// executor/claudecode/runtime.go, and writes tmp/go.mod (the checkout's go.mod with a replace of
// the module by the copy) and tmp/go.sum; it returns the go.mod path.
function checkedModfile(tmp) {
  const dl = run('go', ['mod', 'download', '-json', MODULE], env(false), 240000);
  assert.equal(dl.status, 0, `${dl.command} exited ${dl.status} ${dl.error}: ${dl.output}`);
  const mod = JSON.parse(dl.stdout);
  const copy = path.join(tmp, 'kogen-executor');
  for (const [cmd, args] of [['cp', ['-R', mod.Dir, copy]], ['chmod', ['-R', 'u+w', copy]]]) {
    const r = run(cmd, args, process.env, 60000);
    assert.equal(r.status, 0, `${r.command} exited ${r.status} ${r.error}: ${r.output}`);
  }
  const file = path.join(copy, 'executor', 'claudecode', 'runtime.go');
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(source.split(ANCHOR).length, 2, `${MODULE} ${mod.Version}: executor/claudecode/runtime.go has no single runtimeUsable ending to add the runtime checks to`);
  fs.writeFileSync(file, source.replace(ANCHOR, CHECKS + ANCHOR));
  const modfile = path.join(tmp, 'go.mod');
  fs.writeFileSync(modfile, fs.readFileSync(path.join(ROOT, 'go.mod'), 'utf8') + `\nreplace ${MODULE} => ${copy}\n`);
  fs.copyFileSync(path.join(ROOT, 'go.sum'), path.join(tmp, 'go.sum'));
  return modfile;
}
// observe runs the parts ('test', 'feature') against both executors.
function observe(parts, keepOrigin) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-checks-'));
  try {
    const flags = {pinned: '', checked: '-modfile=' + checkedModfile(tmp)};
    const out = {pinned: {}, checked: {}};
    for (const kind of ['pinned', 'checked']) {
      if (parts.includes('test')) {
        const r = run('go', TEST_ARGS, env(keepOrigin, flags[kind]), 300000);
        r.passed = r.status === 0 && r.output.includes(`--- PASS: ${TEST} `);
        out[kind].test = r;
      }
      if (parts.includes('feature')) {
        const cucumber = process.env.KOGEN_CUCUMBER;
        assert.ok(cucumber, 'KOGEN_CUCUMBER is not set: the Claude Code route usage feature cannot run');
        const e = env(keepOrigin, flags[kind]);
        e.NODE_PATH = cucumber;
        const r = run(process.env.KOGEN_NODE || process.execPath, [path.join(cucumber, '@cucumber/cucumber/bin/cucumber.js'), '--strict', '--require', 'features/steps/*.js', USAGE_FEATURE], e, 600000);
        r.passed = r.status === 0 && r.output.includes(USAGE_SUMMARY);
        out[kind].feature = r;
      }
    }
    return out;
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
function describe(r, kind, name) {
  const tail = r.output.length > 6000 ? '...' + r.output.slice(-6000) : r.output;
  return `${name} against the ${LABELS[kind]}: \`${r.goflags ? 'GOFLAGS=' + r.goflags + ' ' : ''}${r.command}\` exited ${r.status}${r.signal ? ' (signal ' + r.signal + ')' : ''}${r.error ? ' ' + r.error : ''}\n${tail}`;
}
function testPasses(o, kind) {
  const r = o[kind].test;
  const outcome = r.output.includes(`--- FAIL: ${TEST}`) ? 'failed' : r.output.includes(`--- SKIP: ${TEST}`) ? 'was skipped' : r.output.includes(`--- PASS: ${TEST}`) ? 'passed but the package failed' : 'did not run';
  assert.ok(r.passed, `${TEST} did not pass against the ${LABELS[kind]} (expected exit 0 and "--- PASS: ${TEST}"; it ${outcome}). ${describe(r, kind, TEST)}`);
}
function featurePasses(o, kind) {
  const r = o[kind].feature;
  assert.ok(r.passed, `the Claude Code route usage feature (${USAGE_FEATURE}) did not pass against the ${LABELS[kind]} (expected exit 0 and "${USAGE_SUMMARY}"). ${describe(r, kind, NAMES.feature)}`);
}

if (require.main === module) {
  const o = observe(['test', 'feature'], process.argv.includes('--keep-test-origin'));
  let all = true;
  for (const part of ['test', 'feature']) {
    for (const kind of ['pinned', 'checked']) {
      const passed = o[kind][part].passed;
      all = all && passed;
      console.log(`${LABELS[kind]}: ${NAMES[part]} ${passed ? 'passed' : 'failed'}`);
    }
  }
  process.exitCode = all ? 0 : 1;
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(P + 'TestClaudeRounds runs against the pinned kogen-executor and against it with the runtime checks', {timeout: 900000}, function () { this.runtimeChecks = observe(['test'], false); });
  When(P + 'the Claude Code route usage feature runs against the pinned kogen-executor and against it with the runtime checks', {timeout: 1500000}, function () { this.runtimeChecks = observe(['feature'], false); });
  Then(P + 'TestClaudeRounds passes against the pinned kogen-executor', function () { testPasses(this.runtimeChecks, 'pinned'); });
  Then(P + 'TestClaudeRounds passes against the kogen-executor with the runtime checks', function () { testPasses(this.runtimeChecks, 'checked'); });
  Then(P + 'the Claude Code route usage feature passes against the pinned kogen-executor', function () { featurePasses(this.runtimeChecks, 'pinned'); });
  Then(P + 'the Claude Code route usage feature passes against the kogen-executor with the runtime checks', function () { featurePasses(this.runtimeChecks, 'checked'); });
  Then(P + 'go.mod requires {string}', function (want) {
    const text = fs.readFileSync(path.join(ROOT, 'go.mod'), 'utf8');
    assert.ok(text.split('\n').some(l => l.trim() === want), `go.mod does not require ${want}:\n${text}`);
  });
  Then(P + 'go.sum lists {string}', function (want) {
    const text = fs.readFileSync(path.join(ROOT, 'go.sum'), 'utf8');
    assert.ok(text.split('\n').includes(want), `go.sum does not list ${want}`);
  });
}
