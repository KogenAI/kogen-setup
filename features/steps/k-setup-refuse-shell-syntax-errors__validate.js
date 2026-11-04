const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
if (process.argv[2] === '--control') {
  try {
    observe(JSON.parse(process.argv[3]), JSON.parse(process.argv[4]));
    console.log('accepted');
  } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const prefix = 'k-setup-refuse-shell-syntax-errors: ';
  function run(command, args, options = {}) {
    const r = cp.spawnSync(command, args, {encoding:'utf8', timeout:200000, ...options});
    assert.equal(r.status, 0, `${command} ${args.join(' ')}: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
    return r.stdout;
  }
  function withDriver(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syntax-validate-'));
    try {
      const source = path.join(dir, 'main.go');
      fs.writeFileSync(source, `package main
import("encoding/json";"fmt";"os";"path/filepath";"github.com/KogenAI/kogen-setup/setup")
func main(){
 if filepath.Base(os.Args[0])=="sh" { cwd,_:=os.Getwd(); b,_:=json.Marshal(map[string]any{"args":os.Args[1:],"env":os.Environ(),"cwd":cwd}); fmt.Fprintln(os.Stderr,string(b)); fmt.Fprintln(os.Stderr,"second diagnostic line"); os.Exit(2) }
 var a map[string]any; if e:=json.Unmarshal([]byte(os.Args[1]),&a);e!=nil{panic(e)}
 _,p:=setup.Validate(a,setup.InitContext{Root:os.Args[2]}); if p==nil {p=[]string{}}; if e:=json.NewEncoder(os.Stdout).Encode(p);e!=nil{panic(e)}
}
`);
      const binary = path.join(dir, 'validate');
      run('go', ['build','-o',binary,source]);
      fn({dir,binary});
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  }
  function args(kind, command) {
    return kind === 'check' ? {checks:[{name:'syntax',run:command}]} : {[kind]:[command]};
  }
  When(prefix + 'Validate these commands:', {timeout:240000}, function(table) {
    this.syntaxActual = []; this.syntaxExpected = [];
    withDriver(({dir,binary}) => {
      for (const row of table.hashes()) {
        const problems = JSON.parse(run(binary,[JSON.stringify(args(row.list,row.command)),path.join(dir,'nonexistent-project')],{cwd:dir}));
        const expected = [];
        if (row.result === 'refused') {
          const shell = cp.spawnSync('sh',['-n','-c',row.command],{env:{},encoding:'utf8',cwd:dir});
          assert.notEqual(shell.status,0,'real shell must reject the supplied malformed fixture');
          assert.equal(shell.error,undefined,'real shell must start');
          expected.push(`${row.list} command ${row.command} is not valid shell syntax: ${shell.stderr.split(/\r?\n/)[0]}`);
        } else { assert.equal(row.result,'accepted'); }
        this.syntaxActual.push(row.result === 'refused' ? problems.filter(p => p.includes(' is not valid shell syntax: ')) : problems);
        this.syntaxExpected.push(expected);
      }
      this.syntaxActual.push(fs.existsSync(path.join(dir,'marker')));
      this.syntaxExpected.push(false);
    });
  });
  Then(prefix + 'the problems match the shell first line and no marker exists', function() {
    observe(this.syntaxActual,this.syntaxExpected);
  });
  When(prefix + 'Validate with shell mode {word}', {timeout:240000}, function(mode) {
    withDriver(({dir,binary}) => {
      const command = 'nonexistent-program --flag';
      const env = {...process.env, SYNTAX_SENTINEL:'must-not-leak'};
      if (mode === 'missing') { env.PATH = path.join(dir,'absent'); }
      else {
        assert.equal(mode,'recording');
        fs.copyFileSync(binary,path.join(dir,'sh')); fs.chmodSync(path.join(dir,'sh'),0o755);
        env.PATH = dir;
      }
      this.syntaxActual = JSON.parse(run(binary,[JSON.stringify(args('check',command)),path.join(dir,'unused-project')],{cwd:dir,env}));
      // Parse the shim's JSON semantically: object field order is not contractual.
      if (mode === 'recording') {
        const start = `check command ${command} is not valid shell syntax: `;
        assert.equal(this.syntaxActual.length,1,'one syntax problem from the recording shell');
        assert.ok(this.syntaxActual[0].startsWith(start),this.syntaxActual[0]);
        this.syntaxActual = JSON.parse(this.syntaxActual[0].slice(start.length));
        this.syntaxExpected = {args:['-n','-c',command],env:[],cwd:fs.realpathSync(dir)};
      } else { this.syntaxExpected = []; }
    });
  });
  Then(prefix + 'the shell isolation result matches', function() { observe(this.syntaxActual,this.syntaxExpected); });
  When(prefix + 'Init receives the malformed fix:', {timeout:240000}, function(command) {
    const output = JSON.parse(run('go',['run','./features/steps/testdata/init_harness.go',JSON.stringify({fix:[command]})]));
    this.syntaxActual = {requests:output.requests,config:output.config,status:output.status,verified:output.stderr.includes('kogen: running fix-1:')};
  });
  Then(prefix + 'Init observations equal:', function(text) { observe(this.syntaxActual,JSON.parse(text)); });
}
