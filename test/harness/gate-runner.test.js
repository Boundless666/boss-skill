'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const GATE_RUNNER_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'gates', 'gate-runner.sh');

describe('gate-runner', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-gate-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);

    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const initState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'initialized',
      parameters: {},
      stages: {
        '1': { name: 'planning', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} },
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
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: { initialState: initState }
    }) + '\n', 'utf8');
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runScript(args) {
    try {
      return execSync(`bash "${GATE_RUNNER_SCRIPT}" ${args}`, {
        encoding: 'utf8',
        cwd: tmpDir,
        env: { ...process.env, PATH: process.env.PATH }
      }).trim();
    } catch (err) {
      if (err.status !== 0) {
        throw new Error(err.stderr || err.message);
      }
      return err.stdout ? err.stdout.trim() : '';
    }
  }

  it('appends a GateEvaluated event and materializes quality gate state', () => {
    runScript('test-feat gate1');

    const events = fs.readFileSync(path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));

    assert.equal(events.length, 2);
    assert.equal(events[1].type, 'GateEvaluated');
    assert.equal(events[1].data.gate, 'gate1');
    assert.equal(events[1].data.stage, 3);
    assert.equal(Array.isArray(events[1].data.checks), true);
    assert.ok(events[1].data.checks.length > 0);

    const execJson = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'),
      'utf8'
    ));
    assert.equal(execJson.qualityGates.gate1.status, 'completed');
    assert.equal(execJson.qualityGates.gate1.passed, true);
    assert.deepEqual(execJson.qualityGates.gate1.checks, events[1].data.checks);
    assert.equal(execJson.metrics.gatePassRate, 100);
  });
});
