'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('runtime check-stage and replay-events CLIs', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-check-replay-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runtimeCli(name) {
    return path.join(REPO_ROOT, 'runtime', 'cli', `${name}.js`);
  }

  function runRuntimeCommand(name, args) {
    return spawnSync('node', [runtimeCli(name), ...args], {
      cwd: tmpDir,
      encoding: 'utf8'
    });
  }

  function expectSuccess(result, label) {
    assert.equal(result.status, 0, `${label} should exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  it('check-stage returns execution summary and stage JSON through runtime', () => {
    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'init-pipeline');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'running']), 'stage-running');
    expectSuccess(runRuntimeCommand('record-artifact', ['test-feat', 'prd.md', '1']), 'record-artifact');

    const summary = runRuntimeCommand('check-stage', ['test-feat', '--json']);
    expectSuccess(summary, 'check-stage summary');
    const summaryPayload = JSON.parse(summary.stdout);
    assert.equal(summaryPayload.status, 'running');
    assert.equal(summaryPayload.metrics.retryTotal, 0);

    const stage = runRuntimeCommand('check-stage', ['test-feat', '1', '--json']);
    expectSuccess(stage, 'check-stage stage');
    const stagePayload = JSON.parse(stage.stdout);
    assert.equal(stagePayload.status, 'running');
    assert.deepEqual(stagePayload.artifacts, ['prd.md']);
  });

  it('replay-events returns recent events and snapshot-at-event through runtime', () => {
    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'init-pipeline');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'running']), 'stage-running');
    expectSuccess(runRuntimeCommand('record-artifact', ['test-feat', 'prd.md', '1']), 'record-artifact');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'completed']), 'stage-completed');

    const events = runRuntimeCommand('replay-events', ['test-feat', '--json', '--limit', '2']);
    expectSuccess(events, 'replay-events recent');
    const eventsPayload = JSON.parse(events.stdout);
    assert.equal(eventsPayload.events.length, 2);
    assert.equal(eventsPayload.events[0].type, 'StageCompleted');

    const at = runRuntimeCommand('replay-events', ['test-feat', '--json', '--at', '3']);
    expectSuccess(at, 'replay-events at');
    const atPayload = JSON.parse(at.stdout);
    assert.equal(atPayload.snapshot.stages['1'].status, 'running');
    assert.deepEqual(atPayload.snapshot.stages['1'].artifacts, ['prd.md']);
  });
});
