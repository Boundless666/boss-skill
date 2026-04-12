'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runtime = require('../../runtime/cli/lib/pipeline-runtime');
const { materializeState } = require('../../runtime/projectors/materialize-state');

describe('initPipeline pack application', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-pack-init-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"api-only-app"}\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records detected pack configuration into runtime state truth', () => {
    const state = runtime.initPipeline('test-feat', { cwd: tmpDir });

    assert.equal(state.parameters.pipelinePack, 'api-only');
    assert.equal(state.parameters.skipUI, true);
    assert.equal(state.parameters.skipFrontend, true);
    assert.deepEqual(state.parameters.enabledGates, ['gate0', 'gate1', 'gate2']);
    assert.deepEqual(state.parameters.enabledStages, [1, 2, 3, 4]);
    assert.ok(Array.isArray(state.parameters.activeAgents));
    assert.ok(state.parameters.activeAgents.includes('boss-backend'));

    const rematerialized = materializeState('test-feat', tmpDir).state;
    assert.equal(rematerialized.parameters.pipelinePack, 'api-only');
    assert.equal(rematerialized.parameters.skipUI, true);
    assert.deepEqual(rematerialized.parameters.enabledGates, ['gate0', 'gate1', 'gate2']);

    const eventsFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const events = fs
      .readFileSync(eventsFile, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    assert.ok(events.some((event) => event.type === 'PackApplied'));
  });

  it('rejects partial legacy execution-only state', () => {
    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const legacyState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2026-04-12T00:00:00.000Z',
      updatedAt: '2026-04-12T00:00:00.000Z',
      status: 'initialized',
      parameters: {
        skipUI: false,
        skipDeploy: false,
        quick: false,
        hitlLevel: 'auto',
        roles: 'full'
      },
      stages: {},
      qualityGates: {},
      metrics: {
        totalDuration: null,
        stageTimings: {},
        gatePassRate: null,
        retryTotal: 0
      },
      plugins: [],
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };

    fs.writeFileSync(path.join(metaDir, 'execution.json'), `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8');

    assert.throws(
      () => runtime.initPipeline('test-feat', { cwd: tmpDir }),
      /检测到不完整的流水线状态/
    );
  });

  it('rejects already initialized pipelines instead of backfilling pack truth', () => {
    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const legacyState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2026-04-12T00:00:00.000Z',
      updatedAt: '2026-04-12T00:00:00.000Z',
      status: 'initialized',
      parameters: {
        skipUI: false,
        skipDeploy: false,
        quick: false,
        hitlLevel: 'auto',
        roles: 'full'
      },
      stages: {},
      qualityGates: {},
      metrics: {
        totalDuration: null,
        stageTimings: {},
        gatePassRate: null,
        retryTotal: 0
      },
      plugins: [],
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };
    fs.writeFileSync(path.join(metaDir, 'execution.json'), `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8');

    const initEvent = {
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2026-04-12T00:00:00.000Z',
      data: {
        initialState: legacyState
      }
    };
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), `${JSON.stringify(initEvent)}\n`, 'utf8');

    assert.throws(
      () => runtime.initPipeline('test-feat', { cwd: tmpDir }),
      /流水线已存在/
    );
  });

  it('rejects already initialized default-pack pipelines instead of backfilling truth', () => {
    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.rmSync(path.join(tmpDir, 'package.json'));

    const legacyState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2026-04-12T00:00:00.000Z',
      updatedAt: '2026-04-12T00:00:00.000Z',
      status: 'initialized',
      parameters: {
        skipUI: false,
        skipDeploy: false,
        quick: false,
        hitlLevel: 'auto',
        roles: 'full'
      },
      stages: {},
      qualityGates: {},
      metrics: {
        totalDuration: null,
        stageTimings: {},
        gatePassRate: null,
        retryTotal: 0
      },
      plugins: [],
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };
    fs.writeFileSync(path.join(metaDir, 'execution.json'), `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8');

    const initEvent = {
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2026-04-12T00:00:00.000Z',
      data: {
        initialState: legacyState
      }
    };
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), `${JSON.stringify(initEvent)}\n`, 'utf8');

    assert.throws(
      () => runtime.initPipeline('test-feat', { cwd: tmpDir }),
      /流水线已存在/
    );
  });
});
