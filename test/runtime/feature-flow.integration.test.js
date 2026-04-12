'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('feature flow integration (runtime commands only)', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-feature-flow-'));
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

  function readExecution() {
    const executionPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    return JSON.parse(fs.readFileSync(executionPath, 'utf8'));
  }

  function readEventTypes() {
    const eventsPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    return fs
      .readFileSync(eventsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).type);
  }

  it('materializes stage, artifact, plugin, agent, and gate state through runtime commands', () => {
    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'initPipeline');
    expectSuccess(runRuntimeCommand('register-plugins', ['--register', 'test-feat']), 'registerPlugins');
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'running']), 'updateStage stage1 running');
    expectSuccess(runRuntimeCommand('record-artifact', ['test-feat', 'prd.md', '1']), 'recordArtifact prd.md');
    expectSuccess(
      runRuntimeCommand('record-artifact', ['test-feat', 'architecture.md', '1']),
      'recordArtifact architecture.md'
    );
    expectSuccess(runRuntimeCommand('update-stage', ['test-feat', '1', 'completed']), 'updateStage stage1 completed');
    expectSuccess(
      runRuntimeCommand('update-agent', ['test-feat', '2', 'boss-tech-lead', 'running']),
      'updateAgent stage2 boss-tech-lead running'
    );
    expectSuccess(runRuntimeCommand('evaluate-gates', ['test-feat', 'gate1']), 'evaluateGates gate1');

    const execution = readExecution();
    const stage1Artifacts = execution.stages['1'].artifacts;

    assert.equal(execution.stages['1'].status, 'completed');
    assert.deepEqual(stage1Artifacts.slice().sort(), ['architecture.md', 'prd.md']);
    assert.ok(execution.plugins.some((plugin) => plugin.name === 'security-audit'));
    assert.equal(execution.stages['2'].agents['boss-tech-lead'].status, 'running');
    assert.equal(execution.qualityGates.gate1.status, 'completed');
    assert.equal(execution.qualityGates.gate1.passed, true);
    assert.equal(execution.stages['3'].gateResults.gate1.passed, true);

    assert.deepEqual(readEventTypes(), [
      'PipelineInitialized',
      'PluginDiscovered',
      'PluginActivated',
      'PluginsRegistered',
      'StageStarted',
      'ArtifactRecorded',
      'ArtifactRecorded',
      'StageCompleted',
      'AgentStarted',
      'GateEvaluated'
    ]);
  });
});
