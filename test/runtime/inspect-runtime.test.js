'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('inspection runtime CLIs', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-inspect-'));
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
    assert.equal(
      result.status,
      0,
      `${label} should exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  it('inspect-pipeline reports current stage, ready artifacts, active agents, pack, plugins, and metrics', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"api-only-app"}\n', 'utf8');

    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'init-pipeline');
    expectSuccess(runRuntimeCommand('register-plugins', ['--register', 'test-feat']), 'register-plugins');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'running']), 'update-stage');
    expectSuccess(runRuntimeCommand('record-artifact', ['test-feat', 'prd.md', '1']), 'record-artifact');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'completed']), 'update-stage-complete');
    expectSuccess(runRuntimeCommand('update-agent', ['test-feat', '2', 'boss-tech-lead', 'running']), 'update-agent');

    const inspect = runRuntimeCommand('inspect-pipeline', ['test-feat', '--json']);
    expectSuccess(inspect, 'inspect-pipeline');

    const payload = JSON.parse(inspect.stdout);
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.status, 'running');
    assert.equal(payload.currentStage.id, 2);
    assert.equal(payload.currentStage.status, 'pending');
    assert.equal(payload.pack.name, 'api-only');
    assert.ok(payload.plugins.active.some((plugin) => plugin.name === 'security-audit'));
    assert.ok(payload.readyArtifacts.includes('architecture.md'));
    assert.deepEqual(payload.activeAgents, [
      { stage: 2, agent: 'boss-tech-lead', status: 'running' }
    ]);
    assert.equal(typeof payload.metrics.retryTotal, 'number');
    assert.equal(typeof payload.metrics.agentSuccessCount, 'number');
    assert.equal(typeof payload.metrics.agentFailureCount, 'number');
    assert.equal(typeof payload.metrics.meanRetriesPerStage, 'number');
    assert.equal(typeof payload.metrics.revisionLoopCount, 'number');
    assert.equal(typeof payload.metrics.pluginFailureCount, 'number');
  });

  it('inspect-events returns recent events in reverse chronological order with filtering', () => {
    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'init-pipeline');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'running']), 'update-stage');
    expectSuccess(runRuntimeCommand('record-artifact', ['test-feat', 'prd.md', '1']), 'record-artifact');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'completed']), 'update-stage-complete');

    const inspectRecent = runRuntimeCommand('inspect-events', ['test-feat', '--json', '--limit', '2']);
    expectSuccess(inspectRecent, 'inspect-events recent');
    const recentPayload = JSON.parse(inspectRecent.stdout);
    assert.equal(recentPayload.feature, 'test-feat');
    assert.equal(recentPayload.events.length, 2);
    assert.equal(recentPayload.events[0].type, 'StageCompleted');
    assert.equal(recentPayload.events[1].type, 'ArtifactRecorded');

    const inspectFiltered = runRuntimeCommand('inspect-events', ['test-feat', '--json', '--type', 'ArtifactRecorded']);
    expectSuccess(inspectFiltered, 'inspect-events filtered');
    const filteredPayload = JSON.parse(inspectFiltered.stdout);
    assert.equal(filteredPayload.events.length, 1);
    assert.equal(filteredPayload.events[0].type, 'ArtifactRecorded');
  });

  it('inspect-plugins returns plugin lifecycle slices from the execution view', () => {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'local-reporter');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'report.sh'), '#!/bin/bash\nexit 0\n', 'utf8');
    fs.writeFileSync(path.join(pluginDir, 'post-gate.sh'), '#!/bin/bash\nexit 0\n', 'utf8');
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      name: 'local-reporter',
      version: '1.0.0',
      type: 'reporter',
      hooks: {
        report: 'report.sh',
        'post-gate': 'post-gate.sh'
      },
      stages: [3]
    }, null, 2), 'utf8');

    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'init-pipeline');
    expectSuccess(runRuntimeCommand('register-plugins', ['--register', 'test-feat']), 'register-plugins');
    expectSuccess(runRuntimeCommand('run-plugin-hook', ['post-gate', 'test-feat', '--stage', '3']), 'run-plugin-hook');

    const inspect = runRuntimeCommand('inspect-plugins', ['test-feat', '--json']);
    expectSuccess(inspect, 'inspect-plugins');

    const payload = JSON.parse(inspect.stdout);
    assert.equal(payload.feature, 'test-feat');
    assert.ok(payload.active.some((plugin) => plugin.name === 'local-reporter'));
    assert.ok(payload.discovered.some((plugin) => plugin.name === 'local-reporter'));
    assert.ok(payload.activated.some((plugin) => plugin.name === 'local-reporter'));
    assert.equal(payload.executed.length, 1);
    assert.equal(payload.failed.length, 0);
  });

  it('inspect-progress returns recent structured progress events', () => {
    const { emitProgress } = require('../../scripts/lib/progress-emitter');

    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'init-pipeline');
    emitProgress(tmpDir, 'test-feat', { type: 'stage-start', data: { stage: 1 } });
    emitProgress(tmpDir, 'test-feat', { type: 'agent-start', data: { stage: 1, agent: 'boss-pm' } });

    const inspect = runRuntimeCommand('inspect-progress', ['test-feat', '--json', '--limit', '1']);
    expectSuccess(inspect, 'inspect-progress');

    const payload = JSON.parse(inspect.stdout);
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.events.length, 1);
    assert.equal(payload.events[0].feature, 'test-feat');
    assert.equal(payload.events[0].type, 'agent-start');
  });
});
