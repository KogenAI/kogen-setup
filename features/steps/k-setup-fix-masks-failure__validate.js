// Steps for k-setup-fix-masks-failure: call setup.Validate on a fixture proposal (JSON decoded the
// way the model's submit_configuration arguments are) with InitContext{Root: "/fixture", Tracked:
// ["README.md"]} and observe the problems and the returned proposal. No command is executed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

// observe compares problem lists as sets of exact strings (order is not part of the contract).
function observe(actual, expected) {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

if (require.main === module) {
  // Observer control: the comparison the Then step uses accepts the expected refusal and rejects
  // the unchanged-tree result (no problems) for fix `gofmt -w . || true`.
  try {
    const expected = ['fix command gofmt -w . || true ignores its own failure'];
    observe(process.argv[2] === 'good' ? ['fix command gofmt -w . || true ignores its own failure'] : [], expected);
    console.log('accepted');
  } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const driver = String.raw`package main

import (
	"encoding/json"
	"os"
	"reflect"

	"github.com/KogenAI/kogen-setup/setup"
)

func main() {
	var args map[string]any
	if err := json.NewDecoder(os.Stdin).Decode(&args); err != nil {
		panic(err)
	}
	p, problems := setup.Validate(args, setup.InitContext{Root: "/fixture", Tracked: []string{"README.md"}, Contents: map[string]string{}})
	if problems == nil {
		problems = []string{}
	}
	fix := p.Fix
	if fix == nil {
		fix = []string{}
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"problems": problems, "fix": fix, "zero": reflect.DeepEqual(p, setup.InitProposal{})}); err != nil {
		panic(err)
	}
}
`;
  let binary;
  function build() {
    if (binary) return binary;
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.fix-mask-'));
    try {
      fs.writeFileSync(path.join(dir, 'main.go'), driver);
      const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fix-mask-')), 'validate');
      execFileSync('go', ['build', '-o', out, './' + path.basename(dir)], {encoding: 'utf8', timeout: 170000});
      binary = out;
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
    return binary;
  }

  When('k-setup-fix-masks-failure: Validate the proposal:', {timeout: 180000}, function (proposal) {
    JSON.parse(proposal);
    this.fixMaskResult = JSON.parse(execFileSync(build(), [], {input: proposal, encoding: 'utf8', timeout: 60000}));
  });

  Then('k-setup-fix-masks-failure: the problems are:', function (expected) {
    observe(this.fixMaskResult.problems, JSON.parse(expected));
  });

  Then('k-setup-fix-masks-failure: no proposal is returned', function () {
    assert.equal(this.fixMaskResult.zero, true, `Validate returned a proposal: fix ${JSON.stringify(this.fixMaskResult.fix)}`);
  });

  Then('k-setup-fix-masks-failure: the returned fix commands are:', function (expected) {
    assert.equal(this.fixMaskResult.zero, false, `Validate returned no proposal; problems ${JSON.stringify(this.fixMaskResult.problems)}`);
    assert.deepEqual(this.fixMaskResult.fix, JSON.parse(expected));
  });
}
