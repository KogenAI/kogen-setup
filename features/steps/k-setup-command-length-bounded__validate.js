const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
// "{{<unit>*<n>}}" in a string stands for <unit> repeated n times.
function expand(value) {
  if (typeof value === 'string') return value.replace(/\{\{([^*}]+)\*(\d+)\}\}/g, (_, unit, n) => unit.repeat(Number(n)));
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v)]));
  return value;
}
function observe(actual, expected) { assert.deepEqual(actual, expand(expected)); }
if (process.argv[2] === '--control') {
  try { observe(JSON.parse(process.argv[3]), JSON.parse(process.argv[4])); console.log('accepted'); }
  catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  let binary;
  function driver() {
    if (binary) return binary;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'command-length-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true,force:true}));
    const file = path.join(dir, 'main.go');
    fs.writeFileSync(file, 'package main\nimport("encoding/json";"os";"github.com/KogenAI/kogen-setup/setup")\nfunc main(){var in struct{Root string `json:"root"`;Args map[string]any `json:"args"`};if e:=json.Unmarshal([]byte(os.Getenv("VALIDATE_INPUT")),&in);e!=nil{panic(e)};p,problems:=setup.Validate(in.Args,setup.InitContext{Root:in.Root});checks:=[]map[string]string{};for _,c:=range p.Checks{checks=append(checks,map[string]string{"name":c.Name,"run":c.Run})};list:=func(l []string)[]string{if l==nil{return []string{}};return l};if e:=json.NewEncoder(os.Stdout).Encode(map[string]any{"proposal":map[string]any{"setup":list(p.Setup),"fix":list(p.Fix),"checks":checks,"protect":list(p.Protect)},"problems":list(problems)});e!=nil{panic(e)}}\n');
    const out = path.join(dir, 'validate');
    const b = cp.spawnSync('go', ['build', '-o', out, file], {encoding:'utf8',timeout:200000});
    assert.equal(b.status, 0, `go build Validate driver: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
    binary = out;
    return binary;
  }
  When('k-setup-command-length-bounded: Validate in project folder {string} the proposal:', {timeout:240000}, function(root, text) {
    const args = expand(JSON.parse(text));
    const r = cp.spawnSync(driver(), [], {env:{...process.env,VALIDATE_INPUT:JSON.stringify({root, args})},encoding:'utf8',timeout:30000});
    assert.equal(r.status, 0, `Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
    this.commandLengthArgs = args;
    this.commandLengthResult = JSON.parse(r.stdout);
  });
  Then('k-setup-command-length-bounded: the submitted commands have these character counts:', function(text) {
    const a = this.commandLengthArgs;
    const count = s => [...s].length;
    const actual = {setup: (a.setup || []).map(count), fix: (a.fix || []).map(count), checks: (a.checks || []).map(c => count(c.run))};
    assert.deepEqual(actual, JSON.parse(text));
  });
  Then('k-setup-command-length-bounded: problems equal:', function(text) {
    observe(this.commandLengthResult.problems, JSON.parse(text));
  });
  Then('k-setup-command-length-bounded: the proposal equals:', function(text) {
    observe(this.commandLengthResult.proposal, JSON.parse(text));
  });
  Then('k-setup-command-length-bounded: every problem is shorter than {int} characters', function(limit) {
    const problems = this.commandLengthResult.problems;
    assert.ok(problems.length > 0, 'expected at least one problem');
    for (const p of problems) {
      const n = [...p].length;
      assert.ok(n < limit, `problem has ${n} characters, want fewer than ${limit}: ${p.slice(0, 200)}`);
    }
  });
}
