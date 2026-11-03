'use strict';
if (require.main === module) {
  // Evaluate the final fixture functions, not its Cucumber registration suffix.
  const fs = require('node:fs');
  const path = require('node:path');
  const Module = require('node:module');
  const assert = require('node:assert/strict');
  const file = path.resolve('features/steps/provider-init.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'if(require.main===module) {';
  assert.equal(source.split(marker).length, 2, 'fixture registration marker must be unique');
  const m = new Module(file, module);
  m.filename = file; m.paths = module.paths;
  m._compile(source.slice(0, source.indexOf(marker)) + '\nmodule.exports={fixture,success,stopped};\n', file);
  (async () => {
    for (const route of ['chatgpt','supergrok','opencode-go','anthropic','claude-code']) {
      process.env.INIT_QUALIFY = route;
      const o = await m.exports.fixture(route);
      assert.equal(o.result.exit, 0, `${route}: ${JSON.stringify(o)}`);
      assert.equal(o.child.code, 0);
      assert.equal(o.calls.length, route === 'claude-code' ? 0 : 1);
      assert.equal(o.claude.length, route === 'claude-code' ? 1 : 0);
    }
    delete process.env.INIT_QUALIFY;
    const o = await m.exports.fixture('chatgpt');
    m.exports.success(o, 'chatgpt');
    const corruptions = [
      x => x.result.config.Models.shape.Provider = 'anthropic',
      x => x.result.config.Models.review.Executor = 'claude-code',
      x => x.result.config.Checks.push({Name:'fail',Run:'sh fail.sh'}),
      x => x.result.config.Setup = [],
      x => x.result.config.Acceptance.StepsDir = 'wrong',
      x => x.files.push('README.md'),
      x => x.status = ' M README.md',
      x => x.subject = 'wrong',
      x => x.calls = [],
      x => {x.child.out='';x.child.err='';},
      x => x.claude.push({}),
    ];
    for (const corrupt of corruptions) {
      const bad = JSON.parse(JSON.stringify(o)); corrupt(bad);
      assert.throws(() => m.exports.success(bad,'chatgpt'));
    }
    if (process.argv[2] === 'bad') {
      const bad = JSON.parse(JSON.stringify(o));bad.result.config.Models.build.Provider='anthropic';
      m.exports.success(bad,'chatgpt');
    }
    console.log('qualified');
  })().catch(e=>{console.log('rejected');if(process.argv[2]!=='bad') console.error(e.stack);process.exitCode=1;});
}
