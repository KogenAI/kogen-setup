const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const keys = ['newline','split','tab','carriage','fix-control','other-control','quoted','ordinary','setup','fix','check','name','protect','acceptance-run','acceptance-dir','parse'];
function observe(record, names) {
  for (const name of names) if (record[name] !== true) throw new Error('roundtrip obligation '+name+' failed: '+JSON.stringify(record));
}
if (require.main === module) {
  const good = Object.fromEntries(keys.map(k => [k,true]));
  if (process.argv[2] === 'good') { observe(good,keys); console.log('accepted'); }
  else {
    for (const key of keys) {
      let rejected = false;
      try { observe({...good,[key]:false},keys); } catch (_) { rejected = true; }
      if (!rejected) throw new Error('missed '+key);
    }
    console.log('rejected each corrupted obligation'); process.exitCode = 1;
  }
} else {
  const {When,Then,setDefaultTimeout} = require('@cucumber/cucumber');
  setDefaultTimeout(180000);
  When('k-setup-written-config-matches-verified: I exercise validation and init round trips', function() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'written-config-'));
    try {
      fs.cpSync(process.cwd(),dir,{recursive:true,filter:p => !['.git','.kogen','node_modules'].includes(path.basename(p))});
      const setup = path.join(dir,'setup');
      for (const name of fs.readdirSync(setup)) if (name.endsWith('.go') && !name.endsWith('_test.go')) {
        const file = path.join(setup,name);
        fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('project.LoadConfig(', 'writtenConfigParser('));
      }
      fs.writeFileSync(path.join(setup,'written_config_acceptance_test.go'),driver);
      const result = path.join(dir,'observed.json');
      execFileSync('go',['test','./setup','-run','^TestWrittenConfigAcceptance$','-count=1'],{cwd:dir,env:{...process.env,WRITTEN_CONFIG_RESULT:result},timeout:150000,stdio:'pipe'});
      this.writtenConfigRecord = JSON.parse(fs.readFileSync(result,'utf8'));
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  });
  Then('k-setup-written-config-matches-verified: these obligations hold:', function(table) {
    observe(this.writtenConfigRecord,table.raw().flat());
  });
}
const driver = `package setup
import("encoding/json";"fmt";"os";"path/filepath";"reflect";"strings";"testing";"github.com/KogenAI/kogen-coordinator/project")
var writtenMode string
func writtenConfigParser(root string)(*project.Config,error){
 c,e:=project.LoadConfig(root);if e!=nil||c==nil{return c,e};switch writtenMode {
 case "setup": c.Setup[0]+=" changed"
 case "fix": c.Fix[0]+=" changed"
 case "check": c.Checks[0].Run+=" changed"
 case "name": c.Checks[0].Name+="-changed"
 case "protect": c.Protect=append(c.Protect,"changed")
 case "acceptance-run": if c.Acceptance!=nil {c.Acceptance.Run+=" changed"}
 case "acceptance-dir": if c.Acceptance!=nil {c.Acceptance.StepsDir+="changed"}
 case "parse": return nil,fmt.Errorf("synthetic parse error for setup command mix deps.get")
 };return c,e
}
func TestWrittenConfigAcceptance(t *testing.T){
 r:=map[string]bool{}
 cases:=[]struct{k,role,cmd string}{
 {"newline","setup","set -e\\nnpm ci"},{"tab","checks","mix\\ttest"},{"carriage","checks","mix test\\r"},{"fix-control","fix","mix format\\t"},{"other-control","setup","echo x\\u007f"},
 }
 for _,c:=range cases {var value any=[]any{c.cmd};if c.role=="checks"{value=initCheckList("test",c.cmd)};_,p:=Validate(map[string]any{c.role:value},InitContext{});text:=strings.Join(p," ");label:=c.role;if label=="checks"{label="check test"};r[c.k]=len(p)>0&&strings.Contains(text,label)&&strings.Contains(text,"one command per entry")}
 _,p:=Validate(map[string]any{"setup":[]any{"set -e","npm ci"}},InitContext{});r["split"]=len(p)==0
 quotedRoot:=t.TempDir();if e:=os.MkdirAll(filepath.Join(quotedRoot,".kogen"),0755);e!=nil{t.Fatal(e)}
 quoted:=&project.Config{Setup:[]string{"echo 'it''s'"}}
 if e:=os.WriteFile(filepath.Join(quotedRoot,project.ConfigPath),[]byte(initRenderConfig(quoted,initRoute{"chatgpt","gpt-5"})),0600);e!=nil{t.Fatal(e)}
 qc,qe:=project.LoadConfig(quotedRoot);r["quoted"]=qe==nil&&qc!=nil&&reflect.DeepEqual(qc.Setup,quoted.Setup)
 for _,mode:=range []string{"ordinary","setup","fix","check","name","protect","acceptance-run","acceptance-dir","parse"}{
  writtenMode=mode
  setup:="mix deps.get"
  f:=initNewFx(t,true,initSubmit(map[string]any{"setup":[]any{setup},"fix":[]any{"mix format"},"checks":initCheckList("test","mix test"),"protect":[]any{}}))
  f.write("README.md","# notes\\n");f.commitAll("seed");before:=f.head();exit,out,_,err:=f.run("")
  if mode=="ordinary" {
   c,e:=project.LoadConfig(f.repo);r[mode]=exit==0&&err==nil&&e==nil&&f.head()!=before&&c!=nil
   if r[mode]{r[mode]=reflect.DeepEqual(c.Setup,[]string{setup})&&reflect.DeepEqual(c.Fix,[]string{"mix format"})&&reflect.DeepEqual(c.Checks,[]project.Check{{Name:"test",Run:"mix test"}})&&len(c.Protect)==0&&c.Acceptance!=nil&&c.Acceptance.StepsDir=="features/steps"&&c.Acceptance.Run==project.AcceptanceCommand("features/steps",project.KogenRunner)}
  }else{
   _,stat:=os.Stat(filepath.Join(f.repo,project.ConfigPath));_,bridge:=os.Stat(filepath.Join(f.repo,initStepsReadmePath));_,ignore:=os.Stat(filepath.Join(f.repo,".gitignore"));message:=fmt.Sprint(err)
   label:=mode;switch mode{case "setup","parse":label="setup";case "check","name":label="test";case "acceptance-run","acceptance-dir":label="acceptance"}
   r[mode]=exit!=0&&err!=nil&&f.head()==before&&os.IsNotExist(stat)&&os.IsNotExist(bridge)&&os.IsNotExist(ignore)&&strings.TrimSpace(f.dirtyPaths())==""&&strings.Contains(message,label)&&!strings.Contains(out,"Initialized Kogen")&&!strings.Contains(out,"Commit:")
  }
 }
 b,e:=json.Marshal(r);if e!=nil{t.Fatal(e)};if e=os.WriteFile(os.Getenv("WRITTEN_CONFIG_RESULT"),b,0600);e!=nil{t.Fatal(e)}
}
`;
