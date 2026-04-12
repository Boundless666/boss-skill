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

  it('append-event.sh accepts plugin lifecycle event types from the runtime catalog', () => {
    runScript(APPEND_SCRIPT, `test-feat PluginDiscovered --data '${JSON.stringify({
      plugin: { name: 'security-audit', version: '1.0.0', type: 'gate' }
    })}'`);
    runScript(APPEND_SCRIPT, `test-feat PluginActivated --data '${JSON.stringify({
      plugin: { name: 'security-audit', version: '1.0.0', type: 'gate' }
    })}'`);

    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
    const eventTypes = lines.map((line) => JSON.parse(line).type);
    assert.deepEqual(eventTypes, ['PipelineInitialized', 'PluginDiscovered', 'PluginActivated']);
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

  it('materialize preserves gate checks and computes gate pass rate', () => {
    runScript(APPEND_SCRIPT, `test-feat GateEvaluated --gate gate0 --passed true --stage 3 --data '${JSON.stringify({
      checks: [{ name: 'lint', passed: true, detail: 'ok' }]
    })}'`);
    runScript(APPEND_SCRIPT, `test-feat GateEvaluated --gate gate1 --passed false --stage 3 --data '${JSON.stringify({
      checks: [{ name: 'unit-tests', passed: false, detail: 'failed' }]
    })}'`);

    runScript(MATERIALIZE_SCRIPT, 'test-feat');

    const execJson = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'), 'utf8'
    ));
    assert.deepEqual(execJson.qualityGates.gate0.checks, [{ name: 'lint', passed: true, detail: 'ok' }]);
    assert.deepEqual(execJson.qualityGates.gate1.checks, [{ name: 'unit-tests', passed: false, detail: 'failed' }]);
    assert.equal(execJson.metrics.gatePassRate, 50);
  });

  it('materialize handles PluginsRegistered events', () => {
    runScript(APPEND_SCRIPT, `test-feat PluginsRegistered --data '${JSON.stringify({
      plugins: [{ name: 'security-audit', version: '1.0.0', type: 'gate' }]
    })}'`);

    runScript(MATERIALIZE_SCRIPT, 'test-feat');

    const execJson = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'), 'utf8'
    ));
    assert.deepEqual(execJson.plugins, [{ name: 'security-audit', version: '1.0.0', type: 'gate' }]);
  });

  it('materialize-state.sh rejects malformed ArtifactRecorded events', () => {
    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    fs.appendFileSync(eventsFile, `${JSON.stringify({
      id: 2,
      type: 'ArtifactRecorded',
      timestamp: '2024-01-01T00:00:01Z',
      data: { artifact: 'prd.md' }
    })}\n`, 'utf8');

    assert.throws(() => {
      runScript(MATERIALIZE_SCRIPT, 'test-feat');
    }, /ArtifactRecorded.*stage/);
  });

  it('materialize-state.sh rejects malformed GateEvaluated events', () => {
    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    fs.appendFileSync(eventsFile, `${JSON.stringify({
      id: 2,
      type: 'GateEvaluated',
      timestamp: '2024-01-01T00:00:01Z',
      data: { gate: 'gate0', stage: 3 }
    })}\n`, 'utf8');

    assert.throws(() => {
      runScript(MATERIALIZE_SCRIPT, 'test-feat');
    }, /GateEvaluated.*passed/);
  });
});
