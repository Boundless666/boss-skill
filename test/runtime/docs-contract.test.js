'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('runtime docs contract', () => {
  it('describes evaluateGates as an event-sourced state transition', () => {
    const contract = read('docs/runtime-contract.md');

    assert.match(contract, /evaluateGates/);
    assert.match(contract, /GateEvaluated/);
    assert.match(contract, /read model/i);
    assert.doesNotMatch(contract, /evaluateGates[\s\S]*does not write state itself/i);
  });
});
