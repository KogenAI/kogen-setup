const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function extractScript(file, name) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === `Scenario: ${name}`);
  assert.notEqual(start, -1, `${file} has no "Scenario: ${name}"`);
  const open = lines.findIndex((l, i) => i > start && (l.trim() === '"""' || l.trim().startsWith('Scenario:')));
  assert.ok(open !== -1 && lines[open].trim() === '"""', `${file}: scenario "${name}" has no doc string`);
  const indent = lines[open].length - lines[open].trimStart().length;
  const close = lines.findIndex((l, i) => i > open && l.trim() === '"""');
  assert.notEqual(close, -1, `${file}: scenario "${name}" has an unterminated doc string`);
  return lines.slice(open + 1, close).map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length)));
}

function surround(lines, needle, before, after) {
  const at = lines.flatMap((l, i) => (l.includes(needle) ? [i] : []));
  assert.equal(at.length, 1, `expected exactly one script line containing ${needle}, found ${at.length}:\n${at.map((i) => lines[i]).join('\n')}`);
  return [...lines.slice(0, at[0]), ...before, lines[at[0]], ...after, ...lines.slice(at[0] + 1)];
}

function run(lines) {
  const r = spawnSync('/bin/sh', ['-c', `${lines.join('\n')}\n`], {
    cwd: process.cwd(), env: process.env, encoding: 'utf8',
    timeout: 230000, maxBuffer: 16 * 1024 * 1024,
  });
  return { status: r.status, output: `${r.error || ''}${r.stdout || ''}${r.stderr || ''}` };
}

function observe(result, status, contains, lacks) {
  assert.equal(result.status, status, `the shell script exited ${result.status}, expected ${status}; output:\n${result.output}`);
  for (const text of contains) assert.ok(result.output.includes(text), `the shell script output lacks ${JSON.stringify(text)}:\n${result.output}`);
  for (const text of lacks) assert.ok(!result.output.includes(text), `the shell script output contains ${JSON.stringify(text)}:\n${result.output}`);
}

if (require.main === module) {
  // Observer control: the fault scenario's assertions on the guarded (good) and negated (bad) check.
  const negated = "! grep -q '^models:' .kogen/project.yaml";
  const guarded = "if grep -q '^models:' .kogen/project.yaml; then exit 1; fi";
  const [from, to] = process.argv[2] === 'bad' ? [guarded, negated] : [negated, guarded];
  try {
    const lines = extractScript('.kogen/intents/k-setup-models-file/acceptance.feature', 'Initial and repeat init use the team file')
      .map((l) => (l === from ? to : l));
    const result = run(surround(lines, "grep -q '^models:' .kogen/project.yaml",
      ["printf 'models:\\n  shape:\\n    model: gpt-6.1-sol\\n    effort: low\\n' >> .kogen/project.yaml",
        "echo 'fault injected: project.yaml has a models key'"],
      ["echo 'fault missed: the models check passed'", 'git checkout -q -- .kogen/project.yaml']));
    observe(result, 1, ['fault injected: project.yaml has a models key'], ['fault missed: the models check passed']);
    console.log('accepted');
  } catch (_) {
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const { Given, When, Then } = require('@cucumber/cucumber');

  Given('fix-k-setup-models-file: the shell script of scenario {string} in {string}', function (name, file) {
    this.fkmScript = extractScript(file, name);
    this.fkmBefore = [];
    this.fkmAfter = [];
  });

  Given('fix-k-setup-models-file: the shell script runs these lines before its line containing {string}:', function (needle, text) {
    this.fkmNeedle = needle;
    this.fkmBefore = text.split('\n');
  });

  Given('fix-k-setup-models-file: the shell script runs these lines after its line containing {string}:', function (needle, text) {
    assert.ok(this.fkmNeedle === undefined || this.fkmNeedle === needle, `before and after lines name different lines: ${this.fkmNeedle} and ${needle}`);
    this.fkmNeedle = needle;
    this.fkmAfter = text.split('\n');
  });

  When('fix-k-setup-models-file: I run the shell script', { timeout: 240000 }, function () {
    const lines = this.fkmNeedle === undefined ? this.fkmScript : surround(this.fkmScript, this.fkmNeedle, this.fkmBefore, this.fkmAfter);
    this.fkmResult = run(lines);
  });

  Then('fix-k-setup-models-file: the shell script has the line {string}', function (line) {
    assert.ok(this.fkmScript.includes(line), `the shell script has no line ${JSON.stringify(line)}; its lines mentioning models:\n${this.fkmScript.filter((l) => l.includes('models')).join('\n')}`);
  });

  Then('fix-k-setup-models-file: the shell script has no line starting with {string}', function (prefix) {
    const found = this.fkmScript.filter((l) => l.startsWith(prefix));
    assert.deepEqual(found, [], `the shell script has lines starting with ${JSON.stringify(prefix)}:\n${found.join('\n')}`);
  });

  Then('fix-k-setup-models-file: the shell script exits with status {int}', function (status) {
    observe(this.fkmResult, status, [], []);
  });

  Then('fix-k-setup-models-file: the shell script output contains {string}', function (text) {
    observe(this.fkmResult, this.fkmResult.status, [text], []);
  });

  Then('fix-k-setup-models-file: the shell script output does not contain {string}', function (text) {
    observe(this.fkmResult, this.fkmResult.status, [], [text]);
  });
}
