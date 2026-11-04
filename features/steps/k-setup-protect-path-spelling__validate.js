const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
function observe(actual, expected) { assert.deepEqual(actual, expected); }
if (require.main === module) {
  const expected = {protect:['config/.credo.exs'], problems:[], merged:['config/.credo.exs']};
  const actual = JSON.parse(JSON.stringify(expected));
  if (process.argv[2] === 'bad') actual.merged.push('./config/.credo.exs');
  try { observe(actual, expected); console.log('accepted'); }
  catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(/^k-setup-protect-path-spelling: observe (.+)$/, {timeout:180000}, function(input) {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.protect-spelling-'));
    try {
      fs.writeFileSync(path.join(dir, 'main.go'), `package main
import (
 "encoding/json"
 "os"
 "github.com/KogenAI/kogen-setup/setup"
 "github.com/KogenAI/kogen-coordinator/project"
)
func main() {
 var in struct { Protect []string; MergeOnly bool }
 if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil { panic(err) }
 var p setup.InitProposal
 var problems []string
 var merged []string
 if in.MergeOnly {
  merged = setup.Merge(project.Detected{Protect: []string{".credo.exs"}}, setup.InitProposal{Protect: in.Protect}).Protect
 } else {
  entries := []any{}
  for _, s := range in.Protect { entries = append(entries, s) }
  p, problems = setup.Validate(map[string]any{"protect":entries}, setup.InitContext{Root:"/work/p", Tracked:[]string{"mix.exs","config/.credo.exs"}, Contents:map[string]string{"mix.exs":"defmodule Demo.MixProject do\\n def project, do: [app: :demo, test_paths: [\\\"test\\\"]]\\nend\\n"}})
  if len(problems) == 0 { merged = setup.Merge(project.Detected{Protect:[]string{"config/.credo.exs"}}, p).Protect }
 }
 if p.Protect == nil { p.Protect = []string{} }
 if problems == nil { problems = []string{} }
 if merged == nil { merged = []string{} }
 if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"protect":p.Protect,"problems":problems,"merged":merged}); err != nil { panic(err) }
}
`);
      const output = cp.execFileSync('go', ['run', './'+path.basename(dir)], {input, encoding:'utf8', timeout:150000});
      this.protectSpellingResult = JSON.parse(output);
    } finally { fs.rmSync(dir, {recursive:true, force:true}); }
  });
  Then(/^k-setup-protect-path-spelling: result equals (.+)$/, function(expected) {
    observe(this.protectSpellingResult, JSON.parse(expected));
  });
}
