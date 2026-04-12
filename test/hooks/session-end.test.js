'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('session-end hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/session-end')];
    hook = require('../../scripts/hooks/session-end');
  });

  afterEach(() => {
    if (tmpDir) { cleanupTempDir(tmpDir); tmpDir = null; }
  });

  it('returns empty string when no .boss dir', () => {
    const result = hook.run(JSON.stringify({ cwd: '/nonexistent' }));
    assert.equal(result, '');
  });

  it('saves session state for running pipeline', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);

    // Ensure SKILL_DIR points nowhere so report script is not found
    const origSkill = process.env.SKILL_DIR;
    process.env.SKILL_DIR = '/nonexistent';
    try {
      hook.run(JSON.stringify({ cwd: tmpDir }));
    } finally {
      if (origSkill !== undefined) process.env.SKILL_DIR = origSkill;
      else delete process.env.SKILL_DIR;
    }

    const sessionStatePath = path.join(tmpDir, '.boss', '.session-state.json');
    assert.ok(fs.existsSync(sessionStatePath));
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    assert.equal(state.feature, 'test-feat');
    assert.equal(state.pipelineStatus, 'running');
  });

  it('skips features with unknown/initialized status', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'initialized' });
    tmpDir = createTempBossDir('test-feat', execData);

    const origSkill = process.env.SKILL_DIR;
    process.env.SKILL_DIR = '/nonexistent';
    try {
      hook.run(JSON.stringify({ cwd: tmpDir }));
    } finally {
      if (origSkill !== undefined) process.env.SKILL_DIR = origSkill;
      else delete process.env.SKILL_DIR;
    }

    const sessionStatePath = path.join(tmpDir, '.boss', '.session-state.json');
    assert.ok(!fs.existsSync(sessionStatePath));
  });

  it('generates summary report through runtime modules even without SKILL_DIR', () => {
    const execData = createExecData({
      feature: 'test-feat',
      status: 'running',
      schemaVersion: '0.2.0',
      createdAt: '2026-04-12T00:00:00Z',
      updatedAt: '2026-04-12T00:01:00Z',
      parameters: { pipelinePack: 'default' },
      qualityGates: {
        gate0: { status: 'pending', passed: null, checks: [], executedAt: null },
        gate1: { status: 'pending', passed: null, checks: [], executedAt: null },
        gate2: { status: 'pending', passed: null, checks: [], executedAt: null }
      },
      metrics: {
        totalDuration: 60,
        stageTimings: { '1': 30 },
        gatePassRate: null,
        retryTotal: 0,
        agentSuccessCount: 0,
        agentFailureCount: 0,
        meanRetriesPerStage: 0,
        revisionLoopCount: 0,
        pluginFailureCount: 0
      },
      plugins: [],
      pluginLifecycle: { discovered: [], activated: [], executed: [], failed: [] },
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    });
    tmpDir = createTempBossDir('test-feat', execData);

    const origSkill = process.env.SKILL_DIR;
    const origClaude = process.env.CLAUDE_PROJECT_DIR;
    delete process.env.SKILL_DIR;
    delete process.env.CLAUDE_PROJECT_DIR;
    try {
      hook.run(JSON.stringify({ cwd: tmpDir }));
    } finally {
      if (origSkill !== undefined) process.env.SKILL_DIR = origSkill;
      if (origClaude !== undefined) process.env.CLAUDE_PROJECT_DIR = origClaude;
    }

    const summaryPath = path.join(tmpDir, '.boss', 'test-feat', 'summary-report.md');
    assert.ok(fs.existsSync(summaryPath));
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /# 流水线执行报告/);
  });
});
