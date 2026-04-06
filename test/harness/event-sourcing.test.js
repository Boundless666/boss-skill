'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const APPEND_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'append-event.sh');
const MATERIALIZE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'materialize-state.sh');
const REPLAY_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'replay-events.sh');

describe('event-sourcing', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-event-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);

    // Create .boss/test-feat/.meta/ structure
    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    // Create initial execution.json
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

    // Create initial events.jsonl with PipelineInitialized event
    const initEvent = JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: { initialState: initState }
    });
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), initEvent + '\n', 'utf8');
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

  it('append-event.sh adds event to events.jsonl', () => {
    runScript(APPEND_SCRIPT, 'test-feat StageStarted --stage 1');

    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2); // initial + new

    const event = JSON.parse(lines[1]);
    assert.equal(event.type, 'StageStarted');
    assert.equal(event.data.stage, 1);
    assert.equal(event.id, 2);
  });

  it('materialize-state.sh rebuilds execution.json from events', () => {
    // Add events
    runScript(APPEND_SCRIPT, 'test-feat StageStarted --stage 1');
    runScript(APPEND_SCRIPT, 'test-feat ArtifactRecorded --artifact prd.md --stage 1');
    runScript(APPEND_SCRIPT, 'test-feat StageCompleted --stage 1');

    // Materialize
    runScript(MATERIALIZE_SCRIPT, 'test-feat');

    // Verify
    const execJson = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'), 'utf8'
    ));
    assert.equal(execJson.stages['1'].status, 'completed');
    assert.ok(execJson.stages['1'].artifacts.includes('prd.md'));
  });

  it('replay-events.sh --compact lists events', () => {
    runScript(APPEND_SCRIPT, 'test-feat StageStarted --stage 1');

    const output = runScript(REPLAY_SCRIPT, 'test-feat --compact');
    assert.ok(output.includes('PipelineInitialized'));
    assert.ok(output.includes('StageStarted'));
  });

  it('append-event.sh rejects invalid event type', () => {
    assert.throws(() => {
      runScript(APPEND_SCRIPT, 'test-feat InvalidEvent --stage 1');
    });
  });

  it('materialize handles GateEvaluated events', () => {
    runScript(APPEND_SCRIPT, 'test-feat StageStarted --stage 3');
    runScript(APPEND_SCRIPT, 'test-feat GateEvaluated --gate gate0 --passed true --stage 3');

    runScript(MATERIALIZE_SCRIPT, 'test-feat');

    const execJson = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'), 'utf8'
    ));
    assert.equal(execJson.qualityGates.gate0.status, 'completed');
    assert.equal(execJson.qualityGates.gate0.passed, true);
  });
});
