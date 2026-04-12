'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

describe('runtime schema contract', () => {
  it('event schema documents ArtifactRecorded and GateEvaluated payload requirements', () => {
    const schema = loadJson('runtime/schema/event-schema.json');
    const clauses = Array.isArray(schema.allOf) ? schema.allOf : [];

    const artifactClause = clauses.find((clause) =>
      clause?.if?.properties?.type?.const === 'ArtifactRecorded'
    );
    const gateClause = clauses.find((clause) =>
      clause?.if?.properties?.type?.const === 'GateEvaluated'
    );

    assert.ok(artifactClause, 'ArtifactRecorded conditional schema missing');
    assert.deepEqual(
      artifactClause.then.properties.data.required.slice().sort(),
      ['artifact', 'stage']
    );

    assert.ok(gateClause, 'GateEvaluated conditional schema missing');
    assert.deepEqual(
      gateClause.then.properties.data.required.slice().sort(),
      ['gate', 'passed', 'stage']
    );
  });

  it('execution schema requires plugin lifecycle read-model fields', () => {
    const schema = loadJson('runtime/schema/execution-schema.json');

    assert.ok(
      Array.isArray(schema.required) && schema.required.includes('pluginLifecycle'),
      'execution schema must require pluginLifecycle'
    );
    assert.deepEqual(
      schema.properties.pluginLifecycle.required.slice().sort(),
      ['activated', 'discovered', 'executed', 'failed']
    );
  });

  it('execution schema requires expanded phase-4 metrics fields', () => {
    const schema = loadJson('runtime/schema/execution-schema.json');

    assert.deepEqual(
      schema.properties.metrics.required.slice().sort(),
      [
        'agentFailureCount',
        'agentSuccessCount',
        'gatePassRate',
        'meanRetriesPerStage',
        'pluginFailureCount',
        'retryTotal',
        'revisionLoopCount',
        'stageTimings',
        'totalDuration'
      ]
    );
  });

  it('progress schema requires feature on emitted progress events', () => {
    const schema = loadJson('runtime/schema/progress-schema.json');

    assert.ok(Array.isArray(schema.required));
    assert.ok(schema.required.includes('feature'));
  });

  it('event schema documents plugin hook lifecycle payload requirements', () => {
    const schema = loadJson('runtime/schema/event-schema.json');
    const clauses = Array.isArray(schema.allOf) ? schema.allOf : [];

    const executedClause = clauses.find((clause) =>
      clause?.if?.properties?.type?.const === 'PluginHookExecuted'
    );
    const failedClause = clauses.find((clause) =>
      clause?.if?.properties?.type?.const === 'PluginHookFailed'
    );

    assert.ok(executedClause, 'PluginHookExecuted conditional schema missing');
    assert.deepEqual(
      executedClause.then.properties.data.required.slice().sort(),
      ['exitCode', 'hook', 'plugin']
    );

    assert.ok(failedClause, 'PluginHookFailed conditional schema missing');
    assert.deepEqual(
      failedClause.then.properties.data.required.slice().sort(),
      ['exitCode', 'hook', 'plugin']
    );
  });
});
