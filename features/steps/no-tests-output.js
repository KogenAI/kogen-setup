const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
Then('the no-tests project has no configured checks', function () {
  assert.deepEqual(this.result.checks, [], `project.yaml:\n${this.result.config}`);
});
