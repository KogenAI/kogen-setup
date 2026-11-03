const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
// This is a proposed check, never the executable used to launch Init.
const lintCheck = {name:'lint',run:'npm run lint'};
function observe(r, checks, protect, omitted) {
 assert.equal(r.exit, 0); assert.equal(r.error, ''); assert.equal(r.requests, 1);
 assert.deepEqual(r.checks, checks); assert.deepEqual(r.protect, protect);
 const left = r.stdout.split('\n').filter(l => l.startsWith('Left out: ')).join('\n');
 for (const name of omitted) assert.ok(left.includes(name), `missing ${name}: ${left}`);
 for (const name of protect) assert.ok(!left.includes(name), `retained ${name} reported left out`);
 assert.equal(r.status, '');
}
if (process.argv[2] === '--control') {
 const r = {exit:0,error:'',requests:1,checks:['ok'],protect:['README.md'],stdout:'Left out: lint (npm run lint) failed with status 1\n',status:''};
 if(process.argv[3] === 'bad') r.protect = [];
 try { observe(r,['ok'],['README.md'],['lint']); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode=1; }
} else {
 const {When,Then} = require('@cucumber/cucumber');
 When('init verifies lint exit {int} protecting {string} with embedded settings {string} and ok {string}', {timeout:300000}, function(code,protect,embedded,ok) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kept-protect-'));
  try {
   let src=fs.readFileSync('features/steps/testdata/init_harness.go','utf8');
   function replace(a,b) { assert.equal(src.split(a).length,2,`harness anchor ${a}`); src=src.replace(a,b); }
   replace('"protect": []string{}', '"protect": []string{'+JSON.stringify(protect)+'}');
   const pkg=JSON.stringify({scripts:{lint:`exit ${code}`},...(embedded==='yes'?{eslintConfig:{}}:{})});
   replace('if _, err := git("add", "-A"); err != nil {', 'if err := os.WriteFile(filepath.Join(repo, "package.json"), []byte('+JSON.stringify(pkg)+'), 0o644); err != nil { return err }; if _, err := git("add", "-A"); err != nil {');
   replace('Checks   []string `json:"checks"`', 'Checks   []string `json:"checks"`\n Protect []string `json:"protect"`');
   replace('res.Fix = append(res.Fix, cfg.Fix...)', 'res.Protect = append([]string{}, cfg.Protect...); res.Fix = append(res.Fix, cfg.Fix...)');
   const source=path.join(dir,'main.go'),bin=path.join(dir,'init'); fs.writeFileSync(source,src);
   cp.execFileSync('go',['build','-o',bin,source],{encoding:'utf8',timeout:240000});
   const checks=[lintCheck]; if(ok==='yes') checks.push({name:'ok',run:'true'});
   const run=cp.spawnSync(bin,[JSON.stringify({checks})],{encoding:'utf8',timeout:240000});
   assert.equal(run.status,0,`direct Init executable: ${run.stdout}\n${run.stderr}`);
   this.keptProtect=JSON.parse(run.stdout);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
 });
 Then('the kept-check configuration is:', function(text) { const e=JSON.parse(text); observe(this.keptProtect,e.checks,e.protect,e.omitted); });
}
