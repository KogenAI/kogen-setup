'use strict';
const {Given,When,Then,AfterAll}=require('@cucumber/cucumber');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
let dir,exe;
function build(){
 if(exe)return;
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'route-env-'));
 fs.cpSync(process.cwd(),dir,{recursive:true,filter:p=>!['.git','.kogen'].includes(path.basename(p))});
 fs.copyFileSync(path.join(process.cwd(),'features/steps/setup-init-route-from-environment__driver/route_test.go'),path.join(dir,'setup/environment_acceptance_test.go'));
 exe=path.join(dir,'route.test');
 const r=cp.spawnSync('go',['test','-tags=routeacceptance','-c','-o',exe,'./setup'],{cwd:dir,encoding:'utf8',timeout:120000});
 assert.equal(r.status,0,`${r.stdout}${r.stderr}`);
}
Given('setup-init-route-from-environment: saved routes {string} and environment route {string}',function(routes,route){this.routes=routes;this.route=route;});
When('setup-init-route-from-environment: selection runs without a terminal through {string}',{timeout:180000},function(entry){
 build();const env={...process.env,ROUTE_ACCEPTANCE:'1',ROUTE_AVAILABLE:this.routes,ROUTE_ENTRY:entry};
 delete env.KOGEN_INIT_ROUTE;if(this.route!=='unset')env.KOGEN_INIT_ROUTE=this.route;
 const r=cp.spawnSync(exe,['-test.run=^TestEnvironmentRouteAcceptance$','-test.v'],{cwd:dir,env,encoding:'utf8',input:'',timeout:30000});
 assert.equal(r.status,0,`TestEnvironmentRouteAcceptance: ${exe}: ${r.stdout}${r.stderr}`);
 const m=r.stdout.match(/^ROUTE_RESULT=(.*)$/m);assert.ok(m,`TestEnvironmentRouteAcceptance did not emit result: ${r.stdout}${r.stderr}`);this.result=JSON.parse(m[1]);
});
Then('setup-init-route-from-environment: route {string} is selected without prompting',function(route){
 assert.equal(this.result.selected,route);assert.equal(this.result.exit,0);assert.equal(this.result.error,'');
 assert.ok(this.result.output.includes(`kogen: selected ${route} for discovery and shape, build and review`));
 assert.ok(!this.result.output.includes('Select a route'));
});
Then('setup-init-route-from-environment: selection is refused with exit {int} and message containing {string}',function(code,text){
 assert.equal(this.result.exit,code);assert.ok(this.result.error.startsWith('provider/selection_required:'),this.result.error);
 for(const part of text.split('|'))assert.ok(this.result.error.includes(part),this.result.error);
 for(const route of this.routes.split(','))assert.ok(this.result.error.includes(route),this.result.error);
});
AfterAll(()=>{if(dir)fs.rmSync(dir,{recursive:true,force:true});});
