const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

// driverSource prints, as JSON, the problems setup.Validate returns for the proposal in VALIDATE_ARGS
// (null when there are none).
const driverSource = `package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-setup/setup"
)

func main() {
	var args map[string]any
	if err := json.Unmarshal([]byte(os.Getenv("VALIDATE_ARGS")), &args); err != nil {
		panic(err)
	}
	_, problems := setup.Validate(args, setup.InitContext{})
	if err := json.NewEncoder(os.Stdout).Encode(problems); err != nil {
		panic(err)
	}
}
`;

let driver;

// validateDriver builds the driver once per process and removes it on exit.
function validateDriver() {
  if (driver) return driver;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tests-through-wrappers-'));
  process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'main.go');
  fs.writeFileSync(file, driverSource);
  const binary = path.join(dir, 'validate');
  const b = cp.spawnSync('go', ['build', '-o', binary, file], {encoding: 'utf8', timeout: 200000});
  assert.equal(b.status, 0, `go build of the Validate driver: ${b.error || ''}\n${b.stdout}\n${b.stderr}`);
  driver = binary;
  return driver;
}

function validate(args) {
  const r = cp.spawnSync(validateDriver(), [], {env: {...process.env, VALIDATE_ARGS: JSON.stringify(args)}, encoding: 'utf8', timeout: 20000});
  assert.equal(r.status, 0, `Validate driver on ${JSON.stringify(args)}: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  return {args, problems: JSON.parse(r.stdout)};
}

function proposal(command, role) {
  if (role === 'checks') return {checks: [{name: 'suite', run: command}]};
  assert.ok(role === 'setup' || role === 'fix', `unknown role ${role}`);
  return {[role]: [command]};
}

function observe(result, expected) {
  const actual = result.problems === null ? [] : result.problems;
  assert.ok(Array.isArray(actual) && actual.every(p => typeof p === 'string'), `Validate(${JSON.stringify(result.args)}) returned ${JSON.stringify(result.problems)}, not a list of problems`);
  assert.deepEqual(actual, expected, `Validate(${JSON.stringify(result.args)}) problems`);
}

if (process.argv[2] === '--control') {
  const setupProblem = 'setup command CI=1 npm test runs tests or linting; put it in checks';
  const fixProblem = 'fix command go test ./... runs tests or linting; put it in checks';
  const refused = {args: {setup: ['CI=1 npm test'], fix: ['go test ./...', 'gofmt -w .']}, problems: [setupProblem, fixProblem]};
  const accepted = {args: {setup: ['npm ci'], fix: ['gofmt -w .']}, problems: null};
  const badRefused = [
    null,
    [],
    [setupProblem],
    [fixProblem, setupProblem],
    [setupProblem, fixProblem, fixProblem],
    [setupProblem, fixProblem.replace('fix command', 'setup command')],
    ['setup command npm test runs tests or linting; put it in checks', fixProblem],
    {0: setupProblem, 1: fixProblem},
    [setupProblem, 42],
  ];
  const badAccepted = [[setupProblem], ['fix command gofmt -w . runs tests or linting; put it in checks'], 'null'];
  try {
    if (process.argv[3] === 'good') {
      observe(refused, [setupProblem, fixProblem]);
      observe(accepted, []);
      observe({args: accepted.args, problems: []}, []);
      console.log('accepted');
    } else {
      for (const problems of badRefused) {
        assert.throws(() => observe({args: refused.args, problems}, [setupProblem, fixProblem]), undefined, `corruption escaped the observer: ${JSON.stringify(problems)}`);
      }
      for (const problems of badAccepted) {
        assert.throws(() => observe({args: accepted.args, problems}, []), undefined, `corruption escaped the observer: ${JSON.stringify(problems)}`);
      }
      console.log('rejected');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');

  When('k-setup-tests-in-setup-or-fix-through-wrappers: Validate the proposal:', {timeout: 240000}, function (text) {
    this.testsThroughWrappers = validate(JSON.parse(text));
  });

  When('k-setup-tests-in-setup-or-fix-through-wrappers: Validate {string} as {word}', {timeout: 240000}, function (command, role) {
    this.testsThroughWrappers = validate(proposal(command, role));
  });

  Then('k-setup-tests-in-setup-or-fix-through-wrappers: the problems are:', function (text) {
    observe(this.testsThroughWrappers, JSON.parse(text));
  });

  Then('k-setup-tests-in-setup-or-fix-through-wrappers: existing init tests pass', {timeout: 300000}, function () {
    const r = cp.spawnSync('go', ['test', './setup', '-count=1'], {encoding: 'utf8', timeout: 280000});
    assert.equal(r.status, 0, `go test ./setup -count=1 exited ${r.status}${r.signal ? ' (signal ' + r.signal + ')' : ''}: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  });
}
