const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
const source = `package setup
import("encoding/json";"os";"testing";"path/filepath";"github.com/KogenAI/kogen-coordinator/project")
func TestPublishingCapture(t *testing.T) {
 var input struct { Rows []struct { Kind, Name, Run string }; Init bool }
 if e:=json.Unmarshal([]byte(os.Getenv("PUB_INPUT")), &input);e!=nil {t.Fatal(e)}
 result:=map[string]any{}
 if !input.Init {
  rows:=[]any{}
  for _,c:=range input.Rows {
   args:=map[string]any{}
   if c.Kind=="check" {args["checks"]=[]map[string]any{{"name":c.Name,"run":c.Run}}} else {args[c.Kind]=[]any{c.Run}}
   _,p:=Validate(args,InitContext{}); rows=append(rows,p)
  }
  _,p:=Validate(map[string]any{},InitContext{DetectedChecks:[]project.Check{{Name:"detected",Run:"git push"}}})
  result["rows"]=rows;result["detected"]=p
 } else {
  f:=initNewFx(t,true,initSubmit(map[string]any{"checks":[]map[string]any{{"name":"push","run":"git push"}}}),initNothing())
  f.write("README.md","notes\\n");f.commitAll("notes")
  remote:=filepath.Join(t.TempDir(),"remote.git")
  initTestRun(t,f.repo,"git","init","--bare",remote)
  marker:=filepath.Join(t.TempDir(),"received")
  hook:="#!/bin/sh\\necho push >> '"+marker+"'\\nexit 0\\n"
  if e:=os.WriteFile(filepath.Join(remote,"hooks","pre-receive"),[]byte(hook),0755);e!=nil {t.Fatal(e)}
  f.git("remote","add","origin",remote)
  f.git("config","push.default","current")
  exit,out,_,e:=f.run("");result["exit"]=exit;result["stdout"]=out
  if e!=nil {result["error"]=e.Error()}
  result["requests"]=len(f.bodies);result["bodies"]=f.bodies
  _,stat:=os.Stat(marker);result["pushed"]=stat==nil
  cfg,e:=project.LoadConfig(f.repo);if e!=nil {t.Fatal(e)};result["checks"]=cfg.Checks
 }
 b,e:=json.Marshal(result);if e!=nil {t.Fatal(e)};if e=os.WriteFile(os.Getenv("PUB_OUTPUT"),b,0600);e!=nil {t.Fatal(e)}
}
`;
function validation(r, rows) {
 assert.equal(r.rows.length, rows.length);
 rows.forEach((c,i)=>{const p=r.rows[i]||[];if(c.reject) assert.ok(p.some(s=>s.includes(c.run)&&s.includes(c.kind==='check'?c.name:c.kind)&&s.includes('publishes or deploys')),JSON.stringify({c,p}));else assert.deepEqual(p,[],c.run);});
 assert.deepEqual(r.detected||[],[]);
}
function init(r,line) {
 assert.equal(r.exit,0);assert.ok(!r.error,r.error);assert.equal(r.requests,2);
 assert.ok(r.stdout.split('\n').includes(line),r.stdout);assert.deepEqual(r.checks||[],[]);assert.equal(r.pushed,false);
 const correction=JSON.stringify(r.bodies[1]);assert.ok(correction.includes('push')&&correction.includes('git push')&&correction.includes('publishes or deploys'),correction);
}
function capture(input) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publish-capture-'));
 try {
 fs.cpSync(process.cwd(),dir,{recursive:true,filter:p=>!p.includes('/.git')&&!p.includes('/node_modules')});
 fs.writeFileSync(path.join(dir,'setup/publishing_capture_test.go'),source);
 const output=path.join(dir,'result.json');
 const command='go test ./setup -run ^TestPublishingCapture$ -count=1';
 const r=cp.spawnSync('go',['test','./setup','-run','^TestPublishingCapture$','-count=1'],{cwd:dir,env:{...process.env,PUB_INPUT:JSON.stringify(input),PUB_OUTPUT:output},encoding:'utf8',timeout:240000});
 assert.equal(r.status,0,`TestPublishingCapture: ${command}: ${r.stdout}\n${r.stderr}`);
 return JSON.parse(fs.readFileSync(output,'utf8'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[2]==='--control') {
 const rows=[{kind:'check',name:'a',run:'npm publish',reject:true},{kind:'check',name:'d',run:'npm test',reject:false}];
 const v={rows:[['check a (npm publish) publishes or deploys'],null],detected:null};
 const r={exit:0,requests:2,stdout:'Checks: none found\n',checks:[],pushed:false,bodies:[{}, {output:'check push (git push) publishes or deploys'}]};
 validation(v,rows);init(r,'Checks: none found');
 if(process.argv[3]==='bad') {
 const mutations=[()=>validation({...v,rows:[null,null]},rows),()=>validation({...v,rows:[v.rows[0],['refused']]},rows),()=>validation({...v,detected:['refused']},rows),...['exit','error','requests','stdout','checks','pushed','bodies'].map(k=>()=>init({...r,[k]:({exit:1,error:'error',requests:1,stdout:'wrong',checks:[{}],pushed:true,bodies:[{},{}]})[k]},'Checks: none found'))];
 for(const f of mutations){let rejected=false;try{f();}catch(e){rejected=true;}assert.ok(rejected,'bad fixture accepted');}
 console.log('rejected');process.exitCode=1;
 } else console.log('accepted');
} else {
 const {When,Then}=require('@cucumber/cucumber');
 When('k-setup-refuse-publishing-commands: validate these commands:',{timeout:300000},function(text){this.pubRows=JSON.parse(text);this.pub=capture({Rows:this.pubRows});});
 Then('k-setup-refuse-publishing-commands: every validation outcome matches',function(){validation(this.pub,this.pubRows);});
 When('k-setup-refuse-publishing-commands: init proposes git push then drops it',{timeout:300000},function(){this.pub=capture({Init:true});});
 Then('k-setup-refuse-publishing-commands: init reports {string} without a remote push',function(line){init(this.pub,line);});
}
