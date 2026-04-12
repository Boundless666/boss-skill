'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const UPDATE_STAGE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'update-stage.sh');

describe('stage-level runtime wrapper', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-stage-wrapper-'));
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
          name: 'planning',
          status: 'pending',
          startTime: null,
          endTime: null,
          retryCount: 0,
          maxRetries: 2,
          failureReason: null,
          artifacts: [],
          gateResults: {},
          agents: {}
        },
        '2': { name: 'review', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {}, agents: {} },
        '3': { name: 'development', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {}, agents: {} },
        '4': { name: 'deployment', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {}, agents: {} }
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
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), initEvent + '\n', 'utf8');
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runScript(args) {
    return execSync(`bash "${UPDATE_STAGE_SCRIPT}" ${args}`, {
      encoding: 'utf8',
      cwd: tmpDir,
      env: { ...process.env, PATH: process.env.PATH }
    }).trim();
  }

  it('update-stage.sh supports machine-readable JSON output', () => {
    const output = runScript('test-feat 1 running --json');
    const payload = JSON.parse(output);

    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.stage, 1);
    assert.equal(payload.previousStatus, 'pending');
    assert.equal(payload.status, 'running');
    assert.equal(payload.executionPath, '.boss/test-feat/.meta/execution.json');
  });

  it('update-stage.sh exposes runtime-first help text', () => {
    const result = spawnSync('bash', [UPDATE_STAGE_SCRIPT, '--help'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stderr, /用法: update-stage\.js <feature> <stage> <status> \[options\]/);
  });
});
