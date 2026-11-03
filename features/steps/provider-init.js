'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');
const ROOT = process.cwd();
const proposal = {setup: [], fix: [], checks: [{name: 'pass', run: 'sh pass.sh'}, {name: 'fail', run: 'sh fail.sh'}], protect: []};
function sync(cmd, args, cwd, env) {
  const r = cp.spawnSync(cmd, args, {cwd, env, encoding: 'utf8', timeout: 120000});
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}
function run(cmd, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(cmd, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    const timer = setTimeout(() => {p.kill('SIGKILL'); reject(new Error('init exceeded 60 seconds'));}, 60000);
    p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b);
    p.on('error', reject); p.on('close', code => {clearTimeout(timer); resolve({code, out, err});});
  });
}
function put(p, text, mode = 0o600) {fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, text, {mode});}
function responses() {
  const item = {type: 'function_call', id: 'item1', call_id: 'call1', name: 'submit_configuration', arguments: JSON.stringify(proposal)};
  return `event: response.completed\ndata: ${JSON.stringify({type:'response.completed',response:{id:'r1',status:'completed',output:[item],usage:{input_tokens:10,output_tokens:10,total_tokens:20}}})}\n\n`;
}
function messages() {
  return [
    ['message_start', {message:{id:'m1',type:'message',role:'assistant',model:'claude-sonnet-5-5',content:[],usage:{input_tokens:10,output_tokens:0}}}],
    ['content_block_start',{index:0,content_block:{type:'tool_use',id:'call1',name:'submit_configuration',input:{}}}],
    ['content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(proposal)}}],
    ['content_block_stop',{index:0}], ['message_delta',{delta:{stop_reason:'tool_use'},usage:{output_tokens:10}}], ['message_stop',{}]
  ].map(([type,b])=>`event: ${type}\ndata: ${JSON.stringify({type,...b})}\n\n`).join('');
}
const claudeSource = `#!${process.execPath}
const fs=require('node:fs'); const a=process.argv.slice(2);
if(a[0]==='--version'){console.log('2.1.312 (Claude Code)');process.exit(0);}
if(a[0]==='auth'){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}));process.exit(0);}
const sid=a[a.indexOf('--session-id')+1];
const token=fs.readFileSync(3,'utf8'); if(token!=='fixture-token') throw Error('fixture token not delivered');
let input=''; process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{
fs.appendFileSync(process.env.INIT_CLAUDE_LOG,JSON.stringify({args:a,input,token})+'\\n');
console.log(JSON.stringify({type:'system',subtype:'init',cwd:process.cwd(),session_id:sid,mcp_servers:[],model:'claude-sonnet-5-5',permissionMode:'acceptEdits',apiKeySource:'none',claude_code_version:'2.1.312'}));
console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,num_turns:1,session_id:sid,result:'',terminal_reason:'completed',stop_reason:'end_turn',permission_denials:[],structured_output:${JSON.stringify(proposal)},usage:{input_tokens:10,output_tokens:10,cache_read_input_tokens:0,cache_creation_input_tokens:0},total_cost_usd:0}));
});
`;
async function fixture(routes, mode = 'fresh', selection = '') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'init-provider-'));
  const repo = path.join(tmp, 'repo'), home = path.join(tmp, 'home');
  fs.mkdirSync(repo); fs.mkdirSync(home);
  const calls = [];
  const server = http.createServer((req,res) => {
    let body = ''; req.on('data',b=>body+=b); req.on('end',()=>{
      calls.push({url:req.url, headers:req.headers, body:JSON.parse(body || '{}')});
      if(mode==='rejected'){res.writeHead(401, {'Content-Type':'application/json'});res.end('{"error":{"message":"fixture rejected login","type":"authentication_error"}}');return;}
      if(req.url.includes('messages')) {res.writeHead(200,{'Content-Type':'text/event-stream'}); res.end(messages());}
      else if(req.url.includes('chat/completions')) {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'c1',object:'chat.completion',choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'call1',type:'function',function:{name:'submit_configuration',arguments:JSON.stringify(proposal)}}]}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));}
      else {res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(responses());}
    });
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const env = {...process.env,HOME:home,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',KOGEN_PROVIDER_URL:url,INIT_CLAUDE_LOG:path.join(tmp,'claude.log')};
  for(const k of Object.keys(env)) if(/^(GIT_(AUTHOR|COMMITTER|DIR|WORK_TREE|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)|ANTHROPIC_|OPENAI_|CLAUDE_CODE_OAUTH)/.test(k)) delete env[k];
  const git = (...a)=>sync('git',a,repo,env);
  try {
    git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false');
    fs.mkdirSync(path.join(tmp,'hooks'));git('config','core.hooksPath',path.join(tmp,'hooks'));
    put(path.join(repo,'README.md'),'# Fixture\nUse sh pass.sh to check this project.\n');
    put(path.join(repo,'pass.sh'),'exit 0\n');put(path.join(repo,'fail.sh'),'echo fixture-check-failed >&2\nexit 1\n');
    put(path.join(repo,'package.json'),'{"scripts":{"test":"sh pass.sh"}}\n');
    put(path.join(repo,'package-lock.json'),'{"lockfileVersion":3,"packages":{}}\n');
    const bin=path.join(tmp,'bin');fs.mkdirSync(bin);
    put(path.join(bin,'npm'),'#!/bin/sh\ncase "$*" in\n"ci --no-audit --no-fund"|"run test") exit 0;;\nesac\nexit 2\n',0o755);
    const node=path.join(bin,'node');put(node,'#!/bin/sh\n[ -n "$KOGEN_ACCEPTANCE_REPORT" ] && echo \'{}\' > "$KOGEN_ACCEPTANCE_REPORT"\nexit 0\n',0o755);
    env.PATH=bin+':'+process.env.PATH;env.KOGEN_NODE=node;env.KOGEN_CUCUMBER=path.join(tmp,'cucumber');fs.mkdirSync(env.KOGEN_CUCUMBER);
    for(const route of routes.split(',').filter(x=>x && x!=='none')) {
      let cred;
      if(route==='chatgpt'||route==='supergrok') cred={client_id:route==='chatgpt'?'oaiapp_fixture':'fixture-client',access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,referrer:'kogen'};
      else cred={provider:route,api_key:route==='claude-code'?'fixture-token':'fixture-key'};
      put(path.join(home,'.kogen/credentials',route+'.json'),JSON.stringify(cred));
    }
    put(path.join(home,'.kogen/claude-code/2.1.312/claude'),claudeSource,0o700);
    let original = null;
    if(mode==='existing'||mode==='leftover') {
      original='version: 1\ncommands:\n  setup: []\n  fix: []\n  checks: []\n  acceptance:\n    run: null\n    steps_dir: null\nprotect: []\nmodels:\n  shape:\n    provider: supergrok\n    model: grok-4.7\n    effort: high\n  build:\n    executor: native\n    model: gpt-6.1-sol\n    effort: medium\n  review:\n    executor: claude-code\n    model: claude-sonnet-5-5\n    effort: high\n    max_rounds: 3\n';
      if(mode==='existing') put(path.join(repo,'.kogen/project.yaml'),original);
    }
    git('add','-A');git('commit','-qm','Seed');
    if(mode==='leftover') put(path.join(repo,'.kogen/project.yaml'),original);
    const before=git('rev-parse','HEAD');
    const src=path.join(tmp,'driver.go');fs.copyFileSync(path.join(ROOT,'features/steps/provider-init-driver.go.txt'),src);
    const exe=path.join(tmp,'driver');sync('go',['build','-o',exe,src],ROOT,process.env);
    const resultFile=path.join(tmp,'result.json');
    const child=selection ? await run('python3',[path.join(ROOT,'features/steps/provider-init-pty.py'),exe,repo,resultFile,selection],ROOT,env) : await run(exe,[repo,resultFile],ROOT,env);
    assert.ok(fs.existsSync(resultFile), `driver did not return Init result: ${JSON.stringify(child)}`);
    const result=JSON.parse(fs.readFileSync(resultFile,'utf8'));
    const configFile=path.join(repo,'.kogen/project.yaml');
    return {result,child,calls,claude:fs.existsSync(env.INIT_CLAUDE_LOG)?fs.readFileSync(env.INIT_CLAUDE_LOG,'utf8').trim().split('\n').map(JSON.parse):[],before,after:git('rev-parse','HEAD'),count:Number(git('rev-list','--count','HEAD')),status:git('status','--porcelain'),subject:git('log','-1','--format=%s'),files:git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n'),config:fs.existsSync(configFile)?fs.readFileSync(configFile,'utf8'):null,original,readme:fs.readFileSync(path.join(repo,'README.md'),'utf8'),bridge:fs.existsSync(path.join(repo,'features/steps/README.md'))};
  } finally {await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
}
function success(o, route, checkRoles=true) {
  assert.equal(o.child.code,0,JSON.stringify(o));assert.equal(o.result.exit,0);assert.equal(o.result.error,'');assert.equal(o.result.loadError,'');
  assert.equal(o.count,2);assert.notEqual(o.before,o.after);assert.equal(o.status,'');assert.equal(o.subject,'Add Kogen configuration');
  assert.deepEqual(o.files.sort(),['.gitignore','.kogen/project.yaml','features/steps/README.md'].sort());assert.equal(o.bridge,true);
  const cfg=o.result.config;
  assert.deepEqual(cfg.Setup,['npm ci --no-audit --no-fund']);
  assert.deepEqual(cfg.Checks.map(c=>c.Name),['test','pass']);
  assert.deepEqual(cfg.Checks.map(c=>c.Run),['npm run test','sh pass.sh']);
  assert.ok(cfg.Acceptance.Run);assert.equal(cfg.Acceptance.StepsDir,'features/steps');
  assert.equal(o.readme,'# Fixture\nUse sh pass.sh to check this project.\n');
  const human=o.child.out+o.child.err;
  for(const word of ['Initialized Kogen','Setup:','Checks:','Acceptance:','Commit:','Left out:','fail']) assert.ok(human.includes(word),word+': '+human);
  assert.equal(o.calls.length,route==='claude-code'?0:1);assert.equal(o.claude.length,route==='claude-code'?1:0);
  if(route!=='claude-code') {assert.ok(o.calls[0].body.model);assert.ok(JSON.stringify(o.calls[0].body).includes('submit_configuration'));}
  if(checkRoles) for(const name of ['shape','build','review']) {
    const role=cfg.Models[name];assert.ok(role.Model);assert.ok(role.Effort);
    if(route==='claude-code') assert.equal(role.Executor,'claude-code');
    else {assert.ok(!role.Executor || role.Executor==='native');assert.equal(role.Provider||'chatgpt',route);}
  }
}
function stopped(o, reason) {
  assert.notEqual(o.child.code,0);assert.notEqual(o.result.exit,0);assert.match(o.result.error,new RegExp(reason,'i'));
  assert.equal(o.before,o.after);assert.equal(o.count,1);assert.equal(o.config,null);assert.equal(o.status,'');assert.equal(o.claude.length,0);
}
async function control(bad) {
  const o=await fixture('chatgpt');
  if(bad) o.result.config.Checks.push({Name:'fail',Run:'sh fail.sh'});
  success(o,'chatgpt',false);
}
if(require.main===module) {
  control(process.argv[2]==='bad').then(()=>console.log('accepted'),e=>{console.log('rejected');if(process.argv[2]!=='bad') console.error(e.stack);process.exitCode=1;});
} else {
  const {When,Then}=require('@cucumber/cucumber');
  When('provider init runs with {string} in mode {string} choosing {string}', {timeout:180000}, async function(routes,mode,selection){this.providerInit=await fixture(routes,mode,selection);});
  Then('provider init succeeds using {string}',function(route){success(this.providerInit,route);});
  Then('provider init stops for {string} before sending anything',function(reason){stopped(this.providerInit,reason);assert.equal(this.providerInit.calls.length,0);});
  Then('provider init preserves the existing configuration with {int} commits',function(count){const o=this.providerInit;assert.equal(o.result.exit,0,JSON.stringify(o));assert.equal(o.config,o.original);assert.equal(o.count,count);assert.equal(o.calls.length,0);assert.equal(o.claude.length,0);assert.equal(o.status,'');if(count===1)assert.equal(o.before,o.after);});
  Then('provider init reports the rejected route without fallback',function(){const o=this.providerInit;stopped(o,'login|auth|reject');assert.ok(o.calls.length>=1);assert.ok(o.calls.every(c=>c.headers.authorization==='Bearer fixture-access'));});
}
