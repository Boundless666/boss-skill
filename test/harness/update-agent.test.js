'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const UPDATE_AGENT_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'update-agent.sh');
const RETRY_AGENT_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'retry-agent.sh');
const MATERIALIZE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'materialize-state.sh');

describe('agent-level-retry', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-agent-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);

    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const initState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'running',
      parameters: {},
      stages: {
        '1': {
          name: 'planning', status: 'running', startTime: '2024-01-01T00:01:00Z',
          endTime: null, retryCount: 0, maxRetries: 2, failureReason: null,
          artifacts: [], gateResults: {},
          agents: {
            'boss-pm': { status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2 },
            'boss-architect': { status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2 }
          }
        },
        '2': { name: 'review', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} },
        '3': { name: 'development', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} },
        '4': { name: 'deployment', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} }
      },
      qualityGates: {
        gate0: { status: 'pending', passed: null, checks: [], executedAt: null },
        gate1: { status: 'pending', passed: null, checks: [], executedAt: null },
        gate2: { status: 'pending', passed: null, checks: [], executedAt: null }
      },
      metrics: { totalDuration: null, stageTimings: {}, gatePassRate: null, retryTotal: 0 },
      plugins: [],
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };

    fs.writeFileSync(path.join(metaDir, 'execution.json'), JSON.stringify(initState, null, 2), 'utf8');

    const initEvent = JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: { initialState: initState }
    });
    const stageStartEvent = JSON.stringify({
      id: 2,
      type: 'StageStarted',
      timestamp: '2024-01-01T00:01:00Z',
      data: { stage: 1 }
    });
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), initEvent + '\n' + stageStartEvent + '\n', 'utf8');
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runScript(script, args) {
    try {
      return execSync(`bash "${script}" ${args}`, {
        encoding: 'utf8',
        cwd: tmpDir,
        env: { ...process.env, PATH: process.env.PATH }
      }).trim();
    } catch (err) {
      if (err.status !== 0) throw new Error(err.stderr || err.message);
      return err.stdout ? err.stdout.trim() : '';
    }
  }

  function readExecJson() {
    return JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'), 'utf8'
    ));
  }

  it('update-agent.sh sets agent to running via event sourcing', () => {
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm running');

    const exec = readExecJson();
    assert.equal(exec.stages['1'].agents['boss-pm'].status, 'running');
  });

  it('update-agent.sh sets agent to completed', () => {
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm running');
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm completed');

    const exec = readExecJson();
    assert.equal(exec.stages['1'].agents['boss-pm'].status, 'completed');
  });

  it('update-agent.sh records failure with reason', () => {
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm running');
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm failed --reason "超时"');

    const exec = readExecJson();
    assert.equal(exec.stages['1'].agents['boss-pm'].status, 'failed');
  });

  it('retry-agent.sh retries a failed agent', () => {
    // Set agent to running then failed
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm running');
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm failed --reason "timeout"');

    // Retry
    runScript(RETRY_AGENT_SCRIPT, 'test-feat 1 boss-pm');

    const exec = readExecJson();
    assert.equal(exec.stages['1'].agents['boss-pm'].status, 'running');
    assert.equal(exec.stages['1'].agents['boss-pm'].retryCount, 1);

    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
    const retryEvent = JSON.parse(lines[lines.length - 2]);
    assert.equal(retryEvent.type, 'AgentRetryScheduled');
    assert.equal(retryEvent.data.agent, 'boss-pm');
  });

  it('retry-agent.sh rejects non-failed agent', () => {
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm running');

    assert.throws(() => {
      runScript(RETRY_AGENT_SCRIPT, 'test-feat 1 boss-pm');
    }, /只有 failed 状态可以重试/);
  });

  it('update-agent.sh rejects invalid status', () => {
    assert.throws(() => {
      runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm invalid-status');
    });
  });

  it('update-agent.sh supports machine-readable JSON output', () => {
    const output = runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm running --json');
    const payload = JSON.parse(output);

    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.stage, 1);
    assert.equal(payload.agent, 'boss-pm');
    assert.equal(payload.status, 'running');
  });

  it('update-agent.sh exposes runtime-first help text', () => {
    const result = spawnSync('bash', [UPDATE_AGENT_SCRIPT, '--help'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stderr, /用法: update-agent\.js <feature> <stage> <agent-name> <status> \[options\]/);
  });

  it('events are correctly appended for agent transitions', () => {
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm running');
    runScript(UPDATE_AGENT_SCRIPT, 'test-feat 1 boss-pm completed');

    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');

    // 2 initial + 2 new = 4
    assert.equal(lines.length, 4);

    const agentStarted = JSON.parse(lines[2]);
    assert.equal(agentStarted.type, 'AgentStarted');
    assert.equal(agentStarted.data.agent, 'boss-pm');

    const agentCompleted = JSON.parse(lines[3]);
    assert.equal(agentCompleted.type, 'AgentCompleted');
    assert.equal(agentCompleted.data.agent, 'boss-pm');
  });
});
