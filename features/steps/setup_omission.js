const assert = require('node:assert/strict');
const {Then} = require('@cucumber/cucumber');
Then('the omitted setup selection is:', function (text) {
  const r = this.trackedSetupObservation;
  assert.deepStrictEqual({setup:r.setup, checks:r.checks, a:r.a}, JSON.parse(text));
});
