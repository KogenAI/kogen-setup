const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
function validate(r,cases){
 assert.equal(r.rows.length,cases.length);
 cases.forEach((c,i)=>{const p=r.rows[i]||[]; if(c.reject) assert.ok(p.some(x=>x.includes(c.name)&&/runs nothing/i.test(x)),JSON.stringify({c,p})); else assert.deepEqual(p,[],c.run);});
 assert.deepEqual(r.detectedProblems||[],[]);
}
function init(r,line,n){
 assert.equal(r.exit,0); assert.ok(!r.error,r.error); assert.equal(r.requests,n);
 assert.ok(r.stdout.split('\n').includes(line),r.stdout);
 assert.deepEqual(r.checks||[],[]);
 const correction=JSON.stringify(r.bodies[1]); assert.ok(correction.includes('a')&&/runs nothing/i.test(correction),correction);
}
if(process.argv[2]==='--control'){
 try{
 validate({rows:[['check a runs nothing'],null],detectedProblems:null},[{name:'a',reject:true},{name:'d',reject:false}]);
 init({exit:0,requests:2,stdout:'Checks: none found\n',checks:process.argv[3]==='bad'?[{Name:'a',Run:'true'}]:[],bodies:[{}, {message:'check a runs nothing'}]},'Checks: none found',2);
 console.log('accepted');
 }catch(e){console.log('rejected');process.exitCode=1;}
}else{
 const {When,Then}=require('@cucumber/cucumber');
 function capture(input){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'runs-nothing-'));
 try{
 fs.cpSync(process.cwd(),dir,{recursive:true,filter:p=>!p.includes('/.git')&&!p.includes('/node_modules')});
 fs.copyFileSync('features/steps/runs-nothing.go.txt',path.join(dir,'setup/runs_nothing_capture_test.go'));
 const output=path.join(dir,'capture.json');
 const r=cp.spawnSync('go',['test','./setup','-run','^TestRunsNothingCapture$','-count=1'],{cwd:dir,env:{...process.env,RN_INPUT:JSON.stringify(input),RN_OUTPUT:output},encoding:'utf8',timeout:240000});
 assert.equal(r.status,0,`TestRunsNothingCapture: go test ./setup -run ^TestRunsNothingCapture$ -count=1: ${r.stdout}\n${r.stderr}`);
 return JSON.parse(fs.readFileSync(output,'utf8'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 When('runs-nothing validation captures these cases:',{timeout:300000},function(text){this.rnCases=JSON.parse(text);this.rn=capture({Cases:this.rnCases});});
 Then('the runs-nothing validation matches every case',function(){validate(this.rn,this.rnCases);});
 When('runs-nothing init proposes check {string} with command {string} then drops it',{timeout:300000},function(name,run){this.rn=capture({Name:name,Run:run});});
 Then('runs-nothing init reports {string} with no checks and exactly {int} requests',function(line,n){init(this.rn,line,n);});
}
