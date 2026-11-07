'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const ROOT = process.cwd();
const FEATURE = '.kogen/intents/k-init-large-file-list/acceptance.feature';
const wrapper = `#!/usr/bin/python3
import os, sys, json
with open(os.environ['INIT_GIT_LOG'], 'a') as f:
    f.write(json.dumps(sys.argv[1:])+'\\n')
os.execv(os.environ['INIT_REAL_GIT'], [os.environ['INIT_REAL_GIT']]+sys.argv[1:])
`;
function sync(exe,args,cwd,env) {
  const r=spawnSync(exe,args,{cwd,env,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});
  assert.equal(r.status,0,`${exe} ${args.join(' ')}: ${r.error||''}\n${r.stdout||''}${r.stderr||''}`);
  return r.stdout;
}
function run(exe,args,cwd,env) {
  return new Promise((resolve,reject)=>{
    const p=spawn(exe,args,{cwd,env}); let stdout='',stderr='';
    const timer=setTimeout(()=>{p.kill('SIGKILL');reject(new Error('init exceeded 90 seconds'));},90000);
    p.stdout.on('data',b=>stdout+=b); p.stderr.on('data',b=>stderr+=b);
    p.on('error',e=>{clearTimeout(timer);reject(e);});
    p.on('close',status=>{clearTimeout(timer);resolve({status,stdout,stderr});});
  });
}
function verify(r,e,minimum,bound) {
  assert.equal(r.status,e.exit,`init process failed: ${r.stderr}`);
  assert.equal(r.result.exit,e.exit,`init reported failure: ${JSON.stringify(r.result)}`);
  assert.equal(r.result.error,e.error);
  assert.ok(r.stderr.includes(e.success),'init must report success');
  assert.equal(r.requests,e.requests,'the local setup proposal must be consumed exactly once');
  assert.equal(r.commits,e.commits,'init must add exactly one branch commit');
  assert.equal(r.subject,e.subject);
  assert.deepEqual(r.files,e.files);
  assert.equal(r.result.configuration.path,e.configurationPath);
  assert.equal(r.result.configuration.content,r.config);
  assert.equal(r.config,e.config);
  assert.equal(r.models,e.models);
  assert.equal(r.ignore,e.ignore);
  assert.equal(r.bridge,e.bridge);
  assert.equal(r.preserved,true,'init must preserve dirty tracked files');
  assert.ok(r.calls.length>0,'recording wrapper saw no Git calls');
  assert.ok(r.calls.some(a=>a.includes('commit')),'recording wrapper must see the init commit');
  for(const a of r.calls) assert.ok(a.reduce((n,s)=>n+Buffer.byteLength(s)+1,4)<=bound,`git argv exceeds ${bound} bytes`);
  assert.ok(r.pathBytes>=minimum,'fixture path bytes do not reach the reproducing size');
}
async function exercise(count,base) {
  const bin=path.join(base,'bin'), home=path.join(base,'home'), repo=path.join(base,'repo');
  for(const p of [bin,home,repo]) fs.mkdirSync(p,{recursive:true});
  const realGit=sync('sh',['-c','command -v git'],ROOT,process.env).trim();
  const env={...process.env,HOME:home,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_DATE:'2026-11-06T12:00:00Z',GIT_COMMITTER_DATE:'2026-11-06T12:00:00Z'};
  delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE;
  const git=(...a)=>sync(realGit,a,repo,env).trim();
  git('init','-q'); git('config','user.name','Init Fixture'); git('config','user.email','init@example.invalid'); git('config','commit.gpgsign','false'); git('config','core.hooksPath','/dev/null');
  fs.writeFileSync(path.join(repo,'README.md'),'# Literal Node fixture\n');
  fs.writeFileSync(path.join(repo,'package.json'),'{"name":"literal-init-fixture","version":"1.0.0","private":true}\n');
  fs.mkdirSync(path.join(repo,'vendor'));
  const names=Array.from({length:count},(_,i)=>'vendor/'+String(i).padStart(5,'0')+'-'+ 'x'.repeat(55)+'.txt');
  for(const n of names) fs.writeFileSync(path.join(repo,n),'committed\n');
  fs.writeFileSync(path.join(repo,'verify.py'),`from pathlib import Path\np = list(Path('vendor').glob('*.txt'))\nassert len(p) == ${count}\nassert all(x.read_text() == 'committed\\n' for x in p)\nprint('snapshot verified')\n`);
  git('add','-A'); git('commit','-qm','Seed'); const head=git('rev-parse','HEAD');
  for(const n of names) fs.writeFileSync(path.join(repo,n),'dirty\n');
  const creds=path.join(home,'.kogen','credentials'); fs.mkdirSync(creds,{recursive:true});
  fs.writeFileSync(path.join(creds,'chatgpt.json'),JSON.stringify({client_id:'oaiapp_fixture',access_token:'fake-access',refresh_token:'fake-refresh',expires_at:4102444800}));
  fs.writeFileSync(path.join(bin,'git'),wrapper,{mode:0o755});
  const log=path.join(base,'git.jsonl'); fs.writeFileSync(log,'');
  let requests=0;
  const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{
    requests++;
    const args={setup:[],fix:[],checks:[{name:'readme',run:'test -f README.md'},{name:'snapshot',run:'python3 verify.py'}],protect:[]};
    const call={type:'function_call',id:'fc_1',call_id:'call_1',name:'submit_configuration',arguments:JSON.stringify(args),status:'completed'};
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.end('data: '+JSON.stringify({type:'response.output_item.done',output_index:0,item:call})+'\n\n'+'data: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:100,input_tokens_details:{cached_tokens:0},output_tokens:20,output_tokens_details:{reasoning_tokens:5}}}})+'\n\n');
  });});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const cli=path.join(base,'kogen-setup');
  let result;
  try {
    sync('go',['build','-o',cli,'./cmd/kogen-setup'],ROOT,process.env);
    result=await run(cli,[repo],ROOT,{...env,PATH:bin+path.delimiter+env.PATH,KOGEN_PROVIDER_URL:`http://127.0.0.1:${server.address().port}`,INIT_REAL_GIT:realGit,INIT_GIT_LOG:log});
  } finally { await new Promise(resolve=>server.close(resolve)); }
  let doc; try {doc=JSON.parse(result.stdout);} catch {doc={raw:result.stdout};}
  const read=p=>fs.existsSync(path.join(repo,p))?fs.readFileSync(path.join(repo,p),'utf8'):'';
  return {...result,result:doc,requests,commits:Number(git('rev-list','--count',head+'..HEAD')),subject:git('log','-1','--format=%s'),files:git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n').filter(Boolean).sort(),config:read('.kogen/project.yaml'),models:read('.kogen/models.yaml'),ignore:read('.gitignore'),bridge:read('features/steps/README.md'),preserved:names.every(n=>read(n)==='dirty\n'),calls:fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),pathBytes:names.reduce((n,s)=>n+Buffer.byteLength(s)+1,0)};
}
async function scenario(count,minimum,bound,e) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'k-init-large-'));
  try { const r=await exercise(count,base); verify(r,e,minimum,bound); return r; }
  finally {fs.rmSync(base,{recursive:true,force:true});}
}
if(require.main===module) {
  (async()=>{
    const mode=process.argv[2];
    const e=JSON.parse(fs.readFileSync(FEATURE,'utf8').split('"""')[1]);
    const r=await scenario(2,0,32768,e);
    if(mode==='bad') {r.calls.push(['archive','x'.repeat(32768)]);verify(r,e,0,32768);}
    console.log('observer accepted');
  })().catch(e=>{console.error(e.message);process.exitCode=1;});
} else {
  const {Given,Then}=require('@cucumber/cucumber');
  Given('k-init-large-file-list: the unchanged small project result',function(doc){this.initExpected=JSON.parse(doc);});
  Then('k-init-large-file-list: init succeeds with {int} changed tracked files, at least {int} path bytes and Git argv bounded to {int} bytes',{timeout:120000},async function(count,minimum,bound){await scenario(count,minimum,bound,this.initExpected);});
}
