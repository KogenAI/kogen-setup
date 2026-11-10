'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'route-observer-'));
try {
 fs.cpSync(root,dir,{recursive:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});
 const c=JSON.parse(fs.readFileSync('.kogen/intents/setup-init-route-from-environment/controls.json','utf8'));
 const files={...c.correct.files,...(process.argv[2]==='bad'?c.wrong.find(x=>x.name==='wrong refusal exit').files:{})};
 for(const [p,s] of Object.entries(files))fs.writeFileSync(path.join(dir,p),s);
 const r=cp.spawnSync(process.env.KOGEN_NODE,[path.join(process.env.KOGEN_CUCUMBER,'@cucumber/cucumber/bin/cucumber.js'),'--strict','--require','features/steps/setup-init-route-from-environment__route.js','--name','Select chatgpt|Reject unavailable route through Init|Refuse unattended choice without environment|Preserve automatic single route','.kogen/intents/setup-init-route-from-environment/acceptance.feature'],{cwd:dir,env:{...process.env,NODE_PATH:process.env.KOGEN_CUCUMBER},encoding:'utf8',timeout:180000});
 const out=r.stdout+r.stderr;
 const good=process.argv[2]==='good';
 if(good?r.status===0 && /4 scenarios \(4 passed\)/.test(out):r.status===1 && /4 scenarios \(3 passed, 1 failed\)/.test(out) && /4 !== 3|3 !== 4/.test(out)) {
  console.log(good?'accepted':'rejected');process.exitCode=good?0:1;
 } else {console.log(out);process.exitCode=2;}
} finally {fs.rmSync(dir,{recursive:true,force:true});}
