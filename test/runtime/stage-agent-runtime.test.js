'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runtime = require('../../runtime/cli/lib/pipeline-runtime');

describe('stage/agent runtime updates', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-stage-agent-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
    runtime.initPipeline('test-feat', { cwd: tmpDir });
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readEvents() {
    const eventsPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    return fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  }

  function runCli(script, args) {
    return spawnSync('node', [script, ...args], { cwd: tmpDir, encoding: 'utf8' });
  }

  it('updates stage then agent status', () => {
    const stageExecution = runtime.updateStage('test-feat', 1, 'running', { cwd: tmpDir });
    assert.equal(stageExecution.stages['1'].status, 'running');

    const agentExecution = runtime.updateAgent('test-feat', 1, 'boss-pm', 'running', { cwd: tmpDir });
    assert.equal(agentExecution.stages['1'].agents['boss-pm'].status, 'running');
  });

  it('rejects pending as a target status', () => {
    assert.throws(() => {
      runtime.updateStage('test-feat', 1, 'pending', { cwd: tmpDir });
    }, /无效状态/);

    assert.throws(() => {
      runtime.updateAgent('test-feat', 1, 'boss-pm', 'pending', { cwd: tmpDir });
    }, /无效状态/);
  });

  it('rejects invalid stage transitions', () => {
    assert.throws(() => {
      runtime.updateStage('test-feat', 1, 'completed', { cwd: tmpDir });
    }, /无效的状态转换/);
  });

  it('records artifacts and gate results for stage completion', () => {
    runtime.updateStage('test-feat', 1, 'running', { cwd: tmpDir });
    const execution = runtime.updateStage('test-feat', 1, 'completed', {
      cwd: tmpDir,
      artifacts: ['prd.md'],
      gate: 'gate1',
      gatePassed: true
    });

    assert.ok(execution.stages['1'].artifacts.includes('prd.md'));
    assert.equal(execution.stages['1'].gateResults.gate1.passed, true);

    const events = readEvents();
    const types = events.map(event => event.type);
    assert.ok(types.includes('ArtifactRecorded'));
    assert.ok(types.includes('GateEvaluated'));
  });

  it('fails CLI when option value is missing', () => {
    const updateStageCli = path.join(__dirname, '..', '..', 'runtime', 'cli', 'update-stage.js');
    const updateAgentCli = path.join(__dirname, '..', '..', 'runtime', 'cli', 'update-agent.js');

    const stageResult = runCli(updateStageCli, ['test-feat', '1', 'running', '--reason']);
    assert.notEqual(stageResult.status, 0);
    assert.match(stageResult.stderr, /--reason/);

    const agentResult = runCli(updateAgentCli, ['test-feat', '1', 'boss-pm', 'running', '--reason', '--artifact']);
    assert.notEqual(agentResult.status, 0);
    assert.match(agentResult.stderr, /--reason/);
  });
});
