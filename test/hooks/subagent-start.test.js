'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('subagent-start hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/subagent-start')];
    hook = require('../../scripts/hooks/subagent-start');
  });

  afterEach(() => {
    if (tmpDir) { cleanupTempDir(tmpDir); tmpDir = null; }
  });

  it('returns empty string when cwd is empty', () => {
    const result = hook.run(JSON.stringify({ cwd: '' }));
    assert.equal(result, '');
  });

  it('returns empty string when no active pipeline', () => {
    const result = hook.run(JSON.stringify({ cwd: '/nonexistent' }));
    assert.equal(result, '');
  });

  it('returns pipeline context when active', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);

    const result = hook.run(JSON.stringify({
      cwd: tmpDir,
      agent_type: 'code'
    }));
    assert.ok(result.length > 0);
    const parsed = JSON.parse(result);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('test-feat'));
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('code'));
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('BOSS_STATUS'));
  });

  it('includes a memory section when relevant memories exist for the agent stage', () => {
    const memoryRuntime = require('../../runtime/cli/lib/memory-runtime');
    const execData = createExecData({
      feature: 'test-feat',
      status: 'running',
      stages: {
        '1': { name: 'Planning', status: 'completed', artifacts: [] },
        '2': { name: 'Review', status: 'completed', artifacts: [], agents: {} },
        '3': { name: 'Development', status: 'running', artifacts: [], agents: { 'boss-backend': { status: 'pending' } } },
        '4': { name: 'Deployment', status: 'pending', artifacts: [] }
      }
    });
    tmpDir = createTempBossDir('test-feat', execData);
    memoryRuntime.writeFeatureMemory('test-feat', [{
      id: 'm1',
      scope: 'feature',
      kind: 'execution',
      category: 'agent_failure_pattern',
      feature: 'test-feat',
      stage: 3,
      agent: 'boss-backend',
      summary: 'Backend timed out in stage 3',
      source: { type: 'events' },
      evidence: [{ type: 'event', ref: '5' }],
      tags: ['boss-backend'],
      confidence: 0.9,
      createdAt: '2026-04-17T00:00:00Z',
      lastSeenAt: '2026-04-17T00:00:00Z',
      expiresAt: null,
      decayScore: 10,
      influence: 'preference'
    }], { cwd: tmpDir });
    memoryRuntime.buildFeatureSummary('test-feat', { cwd: tmpDir });

    const result = hook.run(JSON.stringify({ cwd: tmpDir, agent_type: 'boss-backend' }));
    const parsed = JSON.parse(result);
    assert.match(parsed.hookSpecificOutput.additionalContext, /记忆提示/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /Backend timed out in stage 3/);
  });
});
