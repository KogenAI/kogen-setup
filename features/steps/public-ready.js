const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Then } = require('@cucumber/cucumber');

function files(dir = '.') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(file);
    return entry.isFile() ? [file] : [];
  });
}
Then('public README contains {string}', function (text) {
  assert.ok(fs.readFileSync('README.md', 'utf8').includes(text), `README.md must contain ${text}`);
});
Then('public README contains {string} exactly {int} times', function (text, count) {
  assert.equal(fs.readFileSync('README.md', 'utf8').split(text).length - 1, count, `README.md occurrence count for ${text}`);
});
Then('public README does not match {string}', function (pattern) {
  assert.doesNotMatch(fs.readFileSync('README.md', 'utf8'), new RegExp(pattern, 'i'));
});
Then('public tree has no file named {string}', function (name) {
  assert.deepEqual(files().filter(file => path.basename(file) === name), [], `Forbidden policy file: ${name}`);
});
Then('public documentation does not match {string}', function (pattern) {
  const hits = files().filter(file => /\.(md|feature|qnt)$/.test(file)).filter(file => new RegExp(pattern, 'i').test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(hits, [], 'Identifying examples in public documentation');
});
Then('public document {string} contains {string}', function (file, text) {
  assert.ok(fs.readFileSync(file, 'utf8').includes(text), `${file} must contain ${text}`);
});
