const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

// driver reads {args, tracked, detected} on stdin, calls setup.Validate with those arguments and an
// InitContext{Root: "/work/p", Tracked: tracked, DetectedChecks: detected}, and, when Validate
// reports no problems, setup.Merge(project.Detected{Checks: detected}, proposal). It prints
// {problems, proposal: {setup, fix, checks, protect}, merged} as JSON (merged is null after problems).
const driver = String.raw`package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-setup/setup"
)

func strs(l []string) []string {
	if l == nil {
		return []string{}
	}
	return l
}

func checks(l []project.Check) []map[string]string {
	out := []map[string]string{}
	for _, c := range l {
		out = append(out, map[string]string{"name": c.Name, "run": c.Run})
	}
	return out
}

func main() {
	var in struct {
		Args     map[string]any
		Tracked  []string
		Detected []project.Check
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		panic(err)
	}
	if in.Args == nil {
		in.Args = map[string]any{}
	}
	p, problems := setup.Validate(in.Args, setup.InitContext{Root: "/work/p", Tracked: in.Tracked, DetectedChecks: in.Detected})
	out := map[string]any{
		"problems": strs(problems),
		"proposal": map[string]any{"setup": strs(p.Setup), "fix": strs(p.Fix), "checks": checks(p.Checks), "protect": strs(p.Protect)},
		"merged":   nil,
	}
	if len(problems) == 0 {
		out["merged"] = checks(setup.Merge(project.Detected{Checks: in.Detected}, p).Checks)
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}
`;

const TESTS = 'go test -count=1 ./setup';

const pad = i => String(i).padStart(2, '0');
const range = n => Array.from({length: n}, (_, i) => i + 1);

// generate returns distinct entries that today's Validate accepts one by one.
function generate(setup, fix, checks, protect, detected) {
  return {
    setup: range(setup).map(i => `mkdir -p build/s${pad(i)}`),
    fix: range(fix).map(i => `gofmt -w pkg${pad(i)}`),
    checks: range(checks).map(i => ({name: `check-${pad(i)}`, run: `go vet ./pkg${pad(i)}`})),
    protect: range(protect).map(i => `docs/p${pad(i)}.md`),
    detected: range(detected).map(i => ({name: `detected-${i}`, run: `go test ./detected${i}`})),
  };
}

function describe(r) {
  const p = r.proposal || {};
  return `Validate problems ${JSON.stringify(r.problems)}; proposal setup ${(p.setup || []).length}, fix ${(p.fix || []).length}, checks ${(p.checks || []).length}, protect ${(p.protect || []).length}; merged ${r.merged === null ? 'not run' : JSON.stringify((r.merged || []).map(c => c.name))}`;
}

function observeExact(r, expected) {
  assert.deepEqual(r.problems, expected, describe(r));
}

function observeAnyOrder(r, expected) {
  assert.ok(Array.isArray(r.problems), describe(r));
  assert.deepEqual([...r.problems].sort(), [...expected].sort(), describe(r));
}

function observeNoProposal(r) {
  assert.deepEqual(r.proposal, {setup: [], fix: [], checks: [], protect: []}, `a proposal was returned: ${describe(r)}`);
  assert.equal(r.merged, null, `Merge ran although Validate should have refused: ${describe(r)}`);
}

function observeProposal(r, gen) {
  assert.deepEqual(r.problems, [], describe(r));
  assert.deepEqual(r.proposal, {setup: gen.setup, fix: gen.fix, checks: gen.checks, protect: gen.protect}, `the proposal differs from the submitted entries: ${describe(r)}`);
}

function observeMerged(r, gen, names) {
  assert.deepEqual(r.problems, [], describe(r));
  const byName = new Map([...gen.detected, ...gen.checks].map(c => [c.name, c]));
  for (const n of names) assert.ok(byName.has(n), `expected check ${n} is not among the generated checks`);
  assert.deepEqual(r.merged, names.map(n => byName.get(n)), `Merge checks differ: ${describe(r)}`);
}

function observeTests(r) {
  assert.equal(r.status, 0, `${TESTS} (the existing init tests) did not pass: status ${r.status}, ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
}

function buildDriver(dir) {
  const file = path.join(dir, 'main.go');
  fs.writeFileSync(file, driver);
  const binary = path.join(dir, 'driver');
  const b = cp.spawnSync('go', ['build', '-o', binary, file], {encoding: 'utf8', timeout: 200000});
  assert.equal(b.status, 0, `go build ${file}: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
  return binary;
}

if (process.argv[2] === '--control') {
  const setupProblem = 'setup has 21 entries; at most 20 are allowed; keep the ones the project needs';
  const fixProblem = 'fix has 11 entries; at most 10 are allowed; keep the ones the project needs';
  const checksProblem = 'checks has 21 entries; at most 20 are allowed; keep the ones the project needs';
  const protectProblem = 'protect has 51 entries; at most 50 are allowed; keep the ones the project needs';
  const empty = {setup: [], fix: [], checks: [], protect: []};
  const capGen = generate(20, 10, 20, 50, 0);
  const mergeGen = generate(0, 0, 20, 0, 3);
  const mergeNames = [...mergeGen.detected, ...mergeGen.checks].map(c => c.name);
  const refused = {problems: [setupProblem], proposal: empty, merged: null};
  const detectedOver = {problems: [checksProblem], proposal: empty, merged: null};
  const two = {problems: [protectProblem, fixProblem], proposal: empty, merged: null};
  const atCap = {problems: [], proposal: {setup: capGen.setup, fix: capGen.fix, checks: capGen.checks, protect: capGen.protect}, merged: [...capGen.checks]};
  const merged = {problems: [], proposal: {setup: [], fix: [], checks: mergeGen.checks, protect: []}, merged: [...mergeGen.detected, ...mergeGen.checks]};
  const testsOk = {status: 0, error: undefined, stdout: 'ok  \tgithub.com/KogenAI/kogen-setup/setup\t12.3s\n', stderr: ''};
  const clone = x => JSON.parse(JSON.stringify(x));
  const goods = [
    () => { observeExact(refused, [setupProblem]); observeNoProposal(refused); },
    () => { observeExact(detectedOver, [checksProblem]); observeNoProposal(detectedOver); },
    () => { observeAnyOrder(two, [fixProblem, protectProblem]); observeNoProposal(two); },
    () => { observeExact(atCap, []); observeProposal(atCap, capGen); },
    () => { observeExact(merged, []); observeProposal(merged, mergeGen); observeMerged(merged, mergeGen, mergeNames); },
    () => observeTests(testsOk),
  ];
  const bads = [
    () => observeExact({...refused, problems: []}, [setupProblem]),
    () => observeExact({...refused, problems: [setupProblem, setupProblem]}, [setupProblem]),
    () => observeExact({...refused, problems: [setupProblem.replace('21', '20')]}, [setupProblem]),
    () => observeExact({...refused, problems: [setupProblem.replace('; keep the ones the project needs', '')]}, [setupProblem]),
    () => observeNoProposal({...refused, proposal: {...empty, setup: ['mkdir -p build/s01']}}),
    () => observeNoProposal({...refused, merged: []}),
    () => observeExact({...detectedOver, problems: [checksProblem.replace('21', '24')]}, [checksProblem]),
    () => observeExact({...detectedOver, problems: []}, [checksProblem]),
    () => observeAnyOrder({...two, problems: [fixProblem]}, [fixProblem, protectProblem]),
    () => observeAnyOrder({...two, problems: [fixProblem, fixProblem]}, [fixProblem, protectProblem]),
    () => observeAnyOrder({...two, problems: [fixProblem, protectProblem, setupProblem]}, [fixProblem, protectProblem]),
    () => observeExact({...atCap, problems: [setupProblem]}, []),
    () => { const x = clone(atCap); x.proposal.protect.pop(); observeProposal(x, capGen); },
    () => { const x = clone(atCap); x.proposal.fix.reverse(); observeProposal(x, capGen); },
    () => { const x = clone(merged); x.problems = ['checks has 23 entries; at most 20 are allowed; keep the ones the project needs']; observeExact(x, []); },
    () => { const x = clone(merged); x.merged = x.merged.slice(3); observeMerged(x, mergeGen, mergeNames); },
    () => { const x = clone(merged); x.merged = x.merged.slice(0, 20); observeMerged(x, mergeGen, mergeNames); },
    () => { const x = clone(merged); x.merged = [...mergeGen.checks, ...mergeGen.detected]; observeMerged(x, mergeGen, mergeNames); },
    () => observeTests({...testsOk, status: 1, stdout: '--- FAIL: TestInitValidate (0.01s)\nFAIL\n'}),
    () => observeTests({...testsOk, status: null, error: 'ETIMEDOUT'}),
  ];
  try {
    if (process.argv[3] === 'good') {
      for (const g of goods) g();
      console.log('accepted');
    } else {
      for (const b of bads) assert.throws(b, undefined, `corruption escaped the observer: ${b}`);
      console.log('rejected');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');

  When('k-setup-proposal-size-bounded: Validate {int} setup commands, {int} fix commands, {int} checks and {int} protect paths with {int} detected checks', {timeout: 240000}, function (setup, fix, checks, protect, detected) {
    const gen = generate(setup, fix, checks, protect, detected);
    const args = {};
    if (setup > 0) args.setup = gen.setup;
    if (fix > 0) args.fix = gen.fix;
    if (checks > 0) args.checks = gen.checks;
    if (protect > 0) args.protect = gen.protect;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proposal-size-bounded-'));
    try {
      const binary = buildDriver(dir);
      const input = JSON.stringify({args, tracked: gen.protect, detected: gen.detected});
      const r = cp.spawnSync(binary, [], {input, encoding: 'utf8', timeout: 60000});
      assert.equal(r.status, 0, `Validate driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.sizeBoundedGen = gen;
      this.sizeBoundedResult = JSON.parse(r.stdout);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  });

  Then('k-setup-proposal-size-bounded: the problems are exactly:', function (text) {
    observeExact(this.sizeBoundedResult, JSON.parse(text));
  });

  Then('k-setup-proposal-size-bounded: the problems, in any order, are:', function (text) {
    observeAnyOrder(this.sizeBoundedResult, JSON.parse(text));
  });

  Then('k-setup-proposal-size-bounded: no proposal is returned', function () {
    observeNoProposal(this.sizeBoundedResult);
  });

  Then('k-setup-proposal-size-bounded: the proposal holds every submitted entry', function () {
    observeProposal(this.sizeBoundedResult, this.sizeBoundedGen);
  });

  Then('k-setup-proposal-size-bounded: Merge with the detected checks returns the checks named:', function (text) {
    observeMerged(this.sizeBoundedResult, this.sizeBoundedGen, JSON.parse(text));
  });

  Then('k-setup-proposal-size-bounded: the existing setup package tests pass', {timeout: 300000}, function () {
    const [cmd, ...args] = TESTS.split(' ');
    observeTests(cp.spawnSync(cmd, args, {encoding: 'utf8', timeout: 280000}));
  });
}
