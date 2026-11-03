const assert = require('node:assert/strict');
function observe(stderr, blocks) {
  const lines = stderr.split('\n');
  const expected = blocks.flatMap(b => b.lines.map(l => '  | ' + l));
  assert.deepEqual(lines.filter(l => l.startsWith('  | ')), expected);
  for (const b of blocks) {
    const i = lines.indexOf(b.progress);
    assert.notEqual(i, -1);
    assert.deepEqual(lines.slice(i + 1, i + 1 + b.lines.length), b.lines.map(l => '  | ' + l));
  }
}
if (process.argv[2] === '--control') {
  const blocks = [{progress:'kogen: running fix-1: failing',lines:['boom']},{progress:'kogen: running fix-2: true',lines:[]}];
  const text = process.argv[3] === 'good' ? 'kogen: running fix-1: failing\n  | boom\nkogen: running fix-2: true\n' : 'kogen: running fix-1: failing\nkogen: running fix-2: true\n  | boom\n';
  try { observe(text, blocks); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {Then} = require('@cucumber/cucumber');
  Then('fixer diagnostic blocks are:', function(text) { observe(this.result.stderr, JSON.parse(text)); });
  Then('the failed fixer {string} retains only lines {int} through {int} with width {int} from {int} zeroes', function(command, first, last, width, zeroes) {
    observe(this.result.stderr, [{progress:'kogen: running fix-1: ' + command, lines:Array.from({length:last-first+1}, (_, i) => (`${first+i}:` + '0'.repeat(zeroes)).slice(0,width))}]);
  });
}
