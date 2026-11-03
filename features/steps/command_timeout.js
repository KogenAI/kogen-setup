const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

function observe(r, e) {
  assert.equal(r.exit, 0);
  assert.equal(r.error, '');
  assert.equal(r.requests, 1);
  assert.ok(r.elapsed < 15000, `init took ${r.elapsed}ms`);
  assert.deepEqual(r.setup, e.setup);
  assert.deepEqual(r.fix, e.fix);
  assert.deepEqual(r.checks, e.checks);
  assert.deepEqual(r.alive, []);
  assert.equal(r.status, '');
  assert.equal(r.readme, '# notes\n');
  assert.ok(r.config.startsWith('version: 1\n'));
  const left = r.stdout.split('\n').filter(x => x.startsWith('Left out: '));
  if (e.omitted.length) {
    assert.equal(left.length, 1);
    assert.ok(!left[0].includes('failed with status'));
    for (const name of e.omitted) assert.ok(left[0].includes(`${name} (`), left[0]);
    assert.equal((left[0].match(/timed out after 1s/g) || []).length, e.omitted.length);
  } else assert.deepEqual(left, []);
  const lines = r.stderr.split('\n');
  if (e.tail) {
    const i = lines.indexOf('kogen: checking slow: echo before; sleep 30');
    assert.ok(i >= 0);
    assert.equal(lines[i + 1], '  | before');
  }
  assert.equal(lines.filter(x => x.startsWith('kogen: running setup-1:')).length, e.runs);
  assert.equal(lines.filter(x => x.startsWith('kogen: running setup-1 again:')).length, e.again);
}
const expected = {setup:[], fix:[], checks:['good'], omitted:['setup-1','slow','fix-1'], tail:true, runs:1, again:0};
if (process.argv[2] === '--control') {
  const r = {exit:0,error:'',requests:1,elapsed:3100,setup:[],fix:[],checks:['good'],alive:[],status:'',readme:'# notes\n',config:'version: 1\n',stdout:'Left out: setup-1 (sleep 30) timed out after 1s; slow (echo before; sleep 30) timed out after 1s; fix-1 (sleep 30) timed out after 1s\n',stderr:'kogen: running setup-1: sleep 30\nkogen: checking slow: echo before; sleep 30\n  | before\n'};
  // Each corruption must be independently rejected, including assertions masked by baseline red.
  const bad = [x=>x.exit=1,x=>x.error='oops',x=>x.requests=0,x=>x.elapsed=30000,x=>x.setup=['sleep 30'],x=>x.fix=['sleep 30'],x=>x.checks=[],x=>x.alive=[123],x=>x.status=' M README.md',x=>x.readme='changed',x=>x.config='',x=>x.stdout='',x=>x.stdout=x.stdout.replace('setup-1','other'),x=>x.stdout=x.stdout.replace('timed out after 1s','failed with status 137'),x=>x.stderr=x.stderr.replace('  | before',''),x=>x.stderr+='kogen: running setup-1 again: sleep 30\n'];
  try {
    if (process.argv[3] === 'good') observe(r, expected);
    else {
      for (const change of bad) {
        const copy = JSON.parse(JSON.stringify(r)); change(copy);
        let rejected = false; try { observe(copy, expected); } catch (_) { rejected = true; }
        assert.ok(rejected, 'corruption escaped observer');
      }
      console.log('rejected'); process.exitCode=1;
    }
    if (!process.exitCode) console.log('accepted');
  } catch (e) { console.error(e.message); process.exitCode=2; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('init verifies timeout proposal {string}', {timeout:300000}, function (text) {
    const root = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-timeout-'));
    try {
      fs.cpSync(root, dir, {recursive:true, filter:p=>!p.split(path.sep).some(x=>x==='.git'||x==='node_modules')});
      const file = path.join(dir,'setup/init.go');
      const source = fs.readFileSync(file,'utf8');
      const re = /\binitCommandTimeout\s*(?:time\.Duration\s*)?=\s*10\s*\*\s*time\.Minute\b/;
      assert.ok(re.test(source), 'missing initCommandTimeout = 10 * time.Minute test seam');
      fs.writeFileSync(file, source.replace(re, 'initCommandTimeout = time.Second'));
      let h = fs.readFileSync(path.join(root,'features/steps/testdata/init_harness.go'),'utf8');
      h = h.replace('"time"','"time"\n "syscall"');
      h = h.replace('type spec struct {','type spec struct {\n Setup []string `json:"setup"`');
      h = h.replace('type result struct {','type result struct {\n Setup []string `json:"setup"`\n Alive []int `json:"alive"`\n Elapsed int64 `json:"elapsed"`');
      h = h.replace('"setup": []string{}','"setup": sp.Setup');
      h = h.replace('exit, initErr := setup.Init','started := time.Now()\n exit, initErr := setup.Init');
      h = h.replace('if initErr != nil {','res.Elapsed = time.Since(started).Milliseconds()\n res.Setup = []string{}\n res.Alive = []int{}\n for _, g := range s.Groups() { if syscall.Kill(-g, 0) != syscall.ESRCH { res.Alive = append(res.Alive, g) } }\n if initErr != nil {');
      h = h.replace('res.Fix = append(res.Fix, cfg.Fix...)','res.Setup = append(res.Setup, cfg.Setup...)\n res.Fix = append(res.Fix, cfg.Fix...)');
      fs.writeFileSync(path.join(dir,'features/steps/testdata/timeout_harness.go'), h);
      const bin = path.join(dir,'timeout-harness');
      cp.execFileSync('go',['build','-o',bin,'./features/steps/testdata/timeout_harness.go'],{cwd:dir,timeout:240000,stdio:'pipe'});
      this.timeoutResult = JSON.parse(cp.execFileSync(bin,[text],{cwd:dir,timeout:20000,encoding:'utf8'}));
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  });
  Then('the timeout outcome is:', function (text) { observe(this.timeoutResult, JSON.parse(text)); });
}
