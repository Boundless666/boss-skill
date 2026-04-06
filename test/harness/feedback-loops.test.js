'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const RECORD_FEEDBACK_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'record-feedback.sh');

describe('feedback-loops', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-feedback-'));
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
        '1': { name: 'planning', status: 'completed', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: ['prd.md', 'architecture.md'], gateResults: {} },
        '2': { name: 'review', status: 'running', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} },
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

    // Create events.jsonl
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
    try {
      return execSync(`bash "${RECORD_FEEDBACK_SCRIPT}" ${args}`, {
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

  it('records a revision request and increments round', () => {
    runScript('test-feat --from boss-tech-lead --to boss-architect --artifact architecture.md --reason "缺少缓存策略"');

    const exec = readExecJson();
    assert.equal(exec.feedbackLoops.currentRound, 1);
    assert.equal(exec.revisionRequests.length, 1);
    assert.equal(exec.revisionRequests[0].from, 'boss-tech-lead');
    assert.equal(exec.revisionRequests[0].to, 'boss-architect');
    assert.equal(exec.revisionRequests[0].artifact, 'architecture.md');
    assert.equal(exec.revisionRequests[0].resolved, false);
  });

  it('allows second round', () => {
    runScript('test-feat --from boss-tech-lead --to boss-architect --artifact architecture.md --reason "round 1"');
    runScript('test-feat --from boss-qa --to boss-backend --artifact code --reason "round 2"');

    const exec = readExecJson();
    assert.equal(exec.feedbackLoops.currentRound, 2);
    assert.equal(exec.revisionRequests.length, 2);
  });

  it('rejects when max rounds reached', () => {
    runScript('test-feat --from boss-tech-lead --to boss-architect --artifact architecture.md --reason "round 1"');
    runScript('test-feat --from boss-qa --to boss-backend --artifact code --reason "round 2"');

    assert.throws(() => {
      runScript('test-feat --from boss-qa --to boss-frontend --artifact code --reason "round 3"');
    }, /已达上限/);
  });

  it('records priority field', () => {
    runScript('test-feat --from boss-tech-lead --to boss-architect --artifact architecture.md --reason "安全问题" --priority critical');

    const exec = readExecJson();
    assert.equal(exec.revisionRequests[0].priority, 'critical');
  });

  it('appends event to events.jsonl', () => {
    runScript('test-feat --from boss-tech-lead --to boss-architect --artifact architecture.md --reason "test"');

    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
    assert.ok(lines.length >= 2); // initial + feedback event

    const lastEvent = JSON.parse(lines[lines.length - 1]);
    assert.equal(lastEvent.type, 'AgentFailed');
    assert.ok(lastEvent.data.reason.includes('REVISION_NEEDED'));
  });

  it('requires all mandatory parameters', () => {
    assert.throws(() => {
      runScript('test-feat --from boss-tech-lead --to boss-architect --artifact architecture.md');
    }, /缺少 --reason/);
  });
});
