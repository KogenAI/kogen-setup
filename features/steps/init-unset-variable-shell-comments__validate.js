// Acceptance steps of init-unset-variable-shell-comments. A small Go driver (built once per
// process) calls setup.Validate with an explicit InitContext.Env, the entry point that applies
// the unset-variable rule to proposed setup, fix and check commands.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {When, Then, setDefaultTimeout} = require('@cucumber/cucumber');

setDefaultTimeout(250000);

const P = 'init-unset-variable-shell-comments: ';
const DRIVER = String.raw`package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-setup/setup"
)

func main() {
	var in struct {
		Role    string   "json:\"role\""
		Command string   "json:\"command\""
		Env     []string "json:\"env\""
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		panic(err)
	}
	args := map[string]any{}
	if in.Role == "check" {
		args["checks"] = []any{map[string]any{"name": "t", "run": in.Command}}
	} else {
		args[in.Role] = []any{in.Command}
	}
	_, problems := setup.Validate(args, setup.InitContext{Env: append([]string{}, in.Env...)})
	if problems == nil {
		problems = []string{}
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"problems": problems}); err != nil {
		panic(err)
	}
}
`;

let driverBin = null;
function driver(input) {
  if (driverBin === null) {
    const src = fs.mkdtempSync(path.join(process.cwd(), '.unset-comment-driver-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unset-comment-driver-'));
    process.on('exit', () => fs.rmSync(outDir, {recursive: true, force: true}));
    try {
      fs.writeFileSync(path.join(src, 'main.go'), DRIVER);
      const bin = path.join(outDir, 'driver');
      const b = cp.spawnSync('go', ['build', '-o', bin, './' + path.basename(src)], {cwd: process.cwd(), encoding: 'utf8', timeout: 200000});
      assert.equal(b.status, 0, `go build of the Validate driver failed (status ${b.status}): ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
      driverBin = bin;
    } finally {
      fs.rmSync(src, {recursive: true, force: true});
    }
  }
  const r = cp.spawnSync(driverBin, [], {input: JSON.stringify(input), encoding: 'utf8', timeout: 100000});
  assert.equal(r.status, 0, `driver ${JSON.stringify(input)} failed (status ${r.status}): ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

When(P + 'Validate this proposal with the init environment SET_ONE=1', function (text) {
  const input = JSON.parse(text);
  this.commentInput = input;
  this.commentResult = driver({role: input.role, command: input.command, env: ['SET_ONE=1']});
});

Then(P + 'the reported unset variables are exactly', function (text) {
  const want = JSON.parse(text);
  const {role, command} = this.commentInput;
  const problems = this.commentResult.problems;
  const names = problems.map((p) => {
    const m = /^(?:check t \(.*\)|setup command .*|fix command .*) references variable ([A-Za-z_][A-Za-z0-9_]*), which is not set in the init environment; use a literal value or a project path instead$/s.exec(p);
    return m ? m[1] : null;
  });
  assert.deepEqual(names, want, `${role} command ${JSON.stringify(command)}: Validate problems ${JSON.stringify(problems)}, want unset variables ${JSON.stringify(want)} and no other problem`);
});
