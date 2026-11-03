const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
function observe(r, expected) {
 assert.equal(r.exit, 0);
 assert.equal(r.stdout.split('\n').find(x => x.startsWith('Left out: ')), expected.leftOut);
 const lines = r.stderr.split('\n');
 assert.deepEqual(lines.filter(x => x.startsWith('  | ')), expected.blocks.flatMap(b => b.lines.map(x => '  | ' + x)));
 for (const b of expected.blocks) {
  const start = lines.indexOf(b.progress);
  assert.notEqual(start, -1, b.progress);
  assert.deepEqual(lines.slice(start + 1, start + 1 + b.lines.length), b.lines.map(x => '  | ' + x));
 }
}
if (process.argv[2] === '--control') {
 const expected = {leftOut:'Left out: x',blocks:[{progress:'kogen: checking x',lines:['boom']}]};
 const r = {exit:0,stdout:'Left out: x\n',stderr:'kogen: checking x\n  | boom\n'};
 if (process.argv[3] === 'bad') r.stderr = 'kogen: checking x\n';
 try { observe(r, expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode=1; }
} else {
 const {When, Then} = require('@cucumber/cucumber');
 When('init verifies the proposal:', function(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'left-out-'));
  try {
   fs.cpSync(process.cwd(), dir, {recursive:true, filter: p => !p.includes('/.git') && !p.includes('/node_modules')});
   fs.copyFileSync(path.join(process.cwd(), 'features/steps/left-out-driver.go.txt'), path.join(dir, 'setup/intent_output_test.go'));
   const result = path.join(dir, 'result.json');
   const run = cp.spawnSync('go', ['test', './setup', '-run', '^TestIntentOutputCapture$', '-count=1'], {cwd:dir, env:{...process.env, INTENT_ARGS:text, INTENT_RESULT:result}, encoding:'utf8', timeout:240000});
   assert.equal(run.status, 0, `TestIntentOutputCapture capture driver: ${run.stdout}\n${run.stderr}`);
   this.capture = JSON.parse(fs.readFileSync(result, 'utf8'));
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
 });
 Then('the left-out output is:', function(text) { observe(this.capture, JSON.parse(text)); });
 Then('the long check retains lines {int} through {int} at width {int}', function(first,last,width) {
  const command = 'i=1; while [ "$i" -le 500 ]; do printf "%s:" "$i"; printf "%0205d\\n" 0; i=$((i+1)); done; exit 9';
  observe(this.capture, {leftOut:`Left out: long (${command}) failed with status 9`, blocks:[{progress:`kogen: checking long: ${command}`,lines:Array.from({length:last-first+1},(_,i)=>(`${first+i}:`+'0'.repeat(205)).slice(0,width))}]});
 });
}
