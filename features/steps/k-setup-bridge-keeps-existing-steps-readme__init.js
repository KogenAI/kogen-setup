const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const P = 'k-setup-bridge-keeps-existing-steps-readme: ';
const TEST = 'TestBridgeKeepsExistingStepsReadmeDriver';
const COMMAND = `go test ./setup -run ^${TEST}$ -count=1`;
function observe(actual, expected) {
  assert.equal(actual.exit, expected.exit, `Init exit code; stderr: ${actual.stderr}`);
  const line = actual.out.split('\n').filter(x => x.startsWith('Acceptance: '));
  assert.equal(line.length, 1, `exactly one Acceptance line on stdout: ${actual.out}`);
  for (const part of expected.acceptanceContains || []) assert.ok(line[0].includes(part), `Acceptance line ${JSON.stringify(line[0])} lacks ${JSON.stringify(part)}`);
  if (expected.acceptanceIs !== undefined) assert.equal(line[0], expected.acceptanceIs, 'Acceptance line');
  assert.deepStrictEqual(actual.files, expected.files, 'file contents after Init (null = absent)');
  for (const f of expected.commitIncludes || []) assert.ok(actual.commit.includes(f), `commit lacks ${f}: ${actual.commit}`);
  for (const f of expected.commitExcludes || []) assert.ok(!actual.commit.includes(f), `commit touches ${f}: ${actual.commit}`);
}
const driver = `package setup
import (
 "encoding/json"
 "os"
 "path/filepath"
 "testing"
)
func ${TEST}(t *testing.T) {
 var input struct { Files map[string]string; Read []string }
 if err := json.Unmarshal([]byte(os.Getenv("BRIDGE_README_INPUT")), &input); err != nil { t.Fatal(err) }
 f := initNewFx(t, true, initNothing())
 for p, c := range input.Files { f.write(p, c) }
 f.commitAll("fixture")
 exit, out, stderr, err := f.run("")
 if err != nil { stderr += err.Error() }
 files := map[string]any{}
 for _, p := range input.Read {
  b, rerr := os.ReadFile(filepath.Join(f.repo, p))
  if rerr != nil { files[p] = nil } else { files[p] = string(b) }
 }
 commit := f.commitFiles()
 if commit == nil { commit = []string{} }
 data, err := json.Marshal(map[string]any{"exit": exit, "out": out, "stderr": stderr, "files": files, "commit": commit})
 if err != nil { t.Fatal(err) }
 if err := os.WriteFile(os.Getenv("BRIDGE_README_RESULT"), data, 0o600); err != nil { t.Fatal(err) }
}
`;
if (require.main === module) {
  const expected = {exit: 0, acceptanceContains: ['not configured', 'features/steps/README.md', 'already exists'], files: {'features/steps/README.md': 'mine\n'}, commitIncludes: ['.kogen/project.yaml'], commitExcludes: ['features/steps/README.md']};
  const good = {exit: 0, stderr: '', out: 'Initialized Kogen in /r\nAcceptance: not configured: features/steps/README.md already exists, so the Cucumber bridge was left out\n', files: {'features/steps/README.md': 'mine\n'}, commit: ['.gitignore', '.kogen/models.yaml', '.kogen/project.yaml']};
  if (process.argv[2] === 'good') { observe(good, expected); console.log('accepted'); }
  else {
    const bads = [];
    for (const mutate of [r => r.exit = 1, r => r.out = r.out.replace('already exists', 'is there'), r => r.out = 'Acceptance: Cucumber bridge added in features/steps\n', r => r.files['features/steps/README.md'] = 'Cucumber step definitions\n', r => r.files['features/steps/README.md'] = null, r => r.commit.push('features/steps/README.md'), r => r.commit = []]) {
      const bad = JSON.parse(JSON.stringify(good)); mutate(bad); bads.push(bad);
    }
    for (const bad of bads) {
      let rejected = false; try { observe(bad, expected); } catch (_) { rejected = true; }
      if (!rejected) throw new Error('observer accepted bad control');
    }
    console.log('rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(P + 'Init runs on a clean repository with no Cucumber runner tracking:', {timeout: 300000}, function (text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-readme-'));
    try {
      for (const name of ['go.mod', 'go.sum', 'setup']) fs.cpSync(path.join(process.cwd(), name), path.join(dir, name), {recursive: true});
      fs.writeFileSync(path.join(dir, 'setup/bridge_keeps_readme_driver_test.go'), driver);
      const result = path.join(dir, 'result.json');
      const run = cp.spawnSync('go', ['test', './setup', '-run', `^${TEST}$`, '-count=1'], {cwd: dir, env: {...process.env, BRIDGE_README_INPUT: text, BRIDGE_README_RESULT: result}, encoding: 'utf8', timeout: 270000});
      assert.equal(run.status, 0, `${TEST}: ${COMMAND} outcome ${run.status}: ${run.stdout}\n${run.stderr}`);
      assert.ok(fs.existsSync(result), `${TEST} absent/skipped/ran zero times: ${COMMAND} wrote no result: ${run.stdout}`);
      this.bridgeReadme = JSON.parse(fs.readFileSync(result, 'utf8'));
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  });
  Then(P + 'the results are:', function (text) { observe(this.bridgeReadme, JSON.parse(text)); });
  Then(P + 'the existing setup tests pass', {timeout: 300000}, function () {
    const r = cp.spawnSync('go', ['test', './setup', '-count=1'], {encoding: 'utf8', timeout: 270000});
    assert.equal(r.status, 0, `go test ./setup -count=1 failed with status ${r.status}: ${r.stdout}\n${r.stderr}`);
  });
}
