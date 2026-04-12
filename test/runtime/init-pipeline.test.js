const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('pipeline-runtime exports', () => {
  it('provides the expected phase-2 operations', () => {
    const runtime = require('../../runtime/cli/lib/pipeline-runtime.js');
    const expected = [
      'initPipeline',
      'getReadyArtifacts',
      'recordArtifact',
      'updateStage',
      'updateAgent',
      'evaluateGates',
    ];

    for (const name of expected) {
      assert.strictEqual(typeof runtime[name], 'function', `${name} should be exported as a function`);
    }
  });
});
