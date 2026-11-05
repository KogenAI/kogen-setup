const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const prefix = 'fix-k-setup-check-installs-dependencies: ';
const anchor = '\t\t\t\tvalid = printIsNothing\n';
const mutants = {
  'print-with-and': '\t\t\t\tvalid = printIsNothing || strings.Contains(command, "&&")\n',
  'print-with-exit': '\t\t\t\tvalid = printIsNothing || strings.Contains(command, "; exit 0")\n',
};
// Runs go test ./setup on a copy of the tree, optionally with setup/init.go mutated or a control test body.
function runTest(root, mutant, testFunction) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-nothing-'));
  try {
    for (const name of ['go.mod', 'go.sum', 'setup']) fs.cpSync(path.join(root, name), path.join(tmp, name), {recursive: true});
    if (mutant) {
      const file = path.join(tmp, 'setup/init.go');
      const source = fs.readFileSync(file, 'utf8');
      assert.equal(source.split(anchor).length, 2, `mutation ${mutant}: setup/init.go must contain exactly one line ${JSON.stringify(anchor)}`);
      fs.writeFileSync(file, source.replace(anchor, mutants[mutant]));
    }
    if (testFunction) {
      const file = path.join(tmp, 'setup/init_test.go');
      const source = fs.readFileSync(file, 'utf8');
      const start = source.indexOf('func TestInitValidateRunsNothing(t *testing.T) {\n');
      const end = source.indexOf('\n}\n', start);
      assert.ok(start >= 0 && end > start, 'control: setup/init_test.go must define TestInitValidateRunsNothing');
      fs.writeFileSync(file, source.slice(0, start) + testFunction + source.slice(end + 3));
    }
    const command = 'go test ./setup -count=1';
    const run = cp.spawnSync('go', ['test', './setup', '-count=1'], {cwd: tmp, encoding: 'utf8', timeout: 280000});
    return {command, mutant: mutant || 'none', status: run.status, output: `${run.error || ''}${run.stdout || ''}${run.stderr || ''}`};
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}
function assertPasses(result) {
  assert.equal(result.status, 0, `${result.command} must pass on the project, exit ${result.status}:\n${result.output}`);
  assert.match(result.output, /^ok\s+github\.com\/KogenAI\/kogen-setup\/setup\s/m, `${result.command}: setup package tests did not run and pass:\n${result.output}`);
}
function assertTestsFail(result, command) {
  assert.notEqual(result.status, 0, `${result.command} with mutation ${result.mutant} stayed green: no setup test asserts the check case ${JSON.stringify(command)}:\n${result.output}`);
  assert.ok(!result.output.includes('[build failed]') && /^--- FAIL: Test/m.test(result.output), `${result.command} with mutation ${result.mutant} did not fail a test (build or setup failure), exit ${result.status}:\n${result.output}`);
}
const cases = {'print-with-and': 'echo ok && exit 0', 'print-with-exit': "printf '%s' ok; true || : | echo done; exit 0"};
function observe(root, testFunction) {
  assertPasses(runTest(root, null, testFunction));
  for (const mutant of Object.keys(mutants)) assertTestsFail(runTest(root, mutant, testFunction), cases[mutant]);
}
// restored(echoWant, printfWant) is a control test body; "any" accepts at most one problem and "one" exactly one.
function restored(echoWant, printfWant) {
  return `func TestInitValidateRunsNothing(t *testing.T) {
	for _, tc := range []struct {
		command string
		want    string
	}{
		{"true", "runs nothing"}, {"echo ok && exit 0", "${echoWant}"}, {":", "runs nothing"},
		{"echo \\"tests passed\\"", ""}, {"printf '%s' ok; true || : | echo done; exit 0", "${printfWant}"},
		{"echo 'a;b|c'", ""}, {\`printf "%s\\n" ok\`, ""}, {\`echo "\\\\$(pwd)"\`, ""},
	} {
		t.Run(tc.command, func(t *testing.T) {
			_, problems := Validate(map[string]any{"checks": initCheckList("a", tc.command)}, InitContext{})
			if tc.want == "any" && len(problems) <= 1 || tc.want == "one" && len(problems) == 1 {
				return
			}
			var want []string
			if tc.want != "" {
				want = []string{"check a (" + tc.command + ") " + tc.want}
			}
			if !reflect.DeepEqual(problems, want) {
				t.Fatalf("problems: %q, want %q", problems, want)
			}
		})
	}
}`;
}
const controls = {
  good: restored('', 'ignores its own failure'),
  'bad-and': restored('any', 'ignores its own failure'),
  'bad-exit': restored('', 'one'),
};
if (require.main === module) {
  if (process.argv[2] !== '--control' || !(process.argv[3] in controls)) {
    console.log('usage: --control good|bad-and|bad-exit');
    process.exitCode = 2;
  } else {
    try {
      observe(process.cwd(), controls[process.argv[3]]);
      console.log('accepted');
    } catch (_) { console.log('rejected'); process.exitCode = 1; }
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  let observed;
  When(prefix + 'the setup tests run on the project and on its print-only check mutations', {timeout: 900000}, function() {
    const root = process.cwd();
    observed ||= {plain: runTest(root, null), 'print-with-and': runTest(root, 'print-with-and'), 'print-with-exit': runTest(root, 'print-with-exit')};
    this.runsNothing = observed;
  });
  Then(prefix + 'the setup tests pass on the project', function() { assertPasses(this.runsNothing.plain); });
  Then(prefix + 'mutation {string} fails the setup tests for the check {string}', function(mutant, command) {
    assert.ok(mutant in mutants && cases[mutant] === command, `unknown mutation ${mutant} for check ${command}`);
    assertTestsFail(this.runsNothing[mutant], command);
  });
}
