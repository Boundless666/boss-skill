'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('memory runtime integration', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-memory-runtime-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refreshes feature memory after runtime state transitions', () => {
    const memoryRuntime = require('../../runtime/cli/lib/memory-runtime');
    const runtime = require('../../runtime/cli/lib/pipeline-runtime');

    runtime.initPipeline('test-feat', { cwd: tmpDir });
    runtime.updateStage('test-feat', 3, 'running', { cwd: tmpDir });
    runtime.updateAgent('test-feat', 3, 'boss-backend', 'failed', { cwd: tmpDir, reason: 'timeout' });

    const payload = memoryRuntime.readFeatureMemory('test-feat', { cwd: tmpDir });
    assert.ok(payload.records.some((record) => record.category === 'agent_failure_pattern'));
  });

  it('continues runtime execution when memory rebuild throws', () => {
    const runtime = require('../../runtime/cli/lib/pipeline-runtime');
    const memoryRuntime = require('../../runtime/cli/lib/memory-runtime');
    const original = memoryRuntime.rebuildFeatureMemory;

    runtime.initPipeline('test-feat', { cwd: tmpDir });
    memoryRuntime.rebuildFeatureMemory = () => {
      throw new Error('boom');
    };

    assert.doesNotThrow(() => runtime.updateStage('test-feat', 1, 'running', { cwd: tmpDir }));
    memoryRuntime.rebuildFeatureMemory = original;
  });

  it('promotes repeated feature patterns into global memory', () => {
    const runtime = require('../../runtime/cli/lib/memory-runtime');
    runtime.writeFeatureMemory('feat-a', [{
      id: 'a1',
      scope: 'feature',
      kind: 'execution',
      category: 'gate_failure_pattern',
      feature: 'feat-a',
      stage: 3,
      agent: null,
      summary: 'Gate 1 failed',
      source: { type: 'events' },
      evidence: [{ type: 'event', ref: '2' }],
      tags: ['gate1'],
      confidence: 0.8,
      createdAt: '2026-04-17T00:00:00Z',
      lastSeenAt: '2026-04-17T00:00:00Z',
      expiresAt: null,
      decayScore: 10,
      influence: 'preference'
    }], { cwd: tmpDir });
    runtime.writeFeatureMemory('feat-b', [{
      id: 'b1',
      scope: 'feature',
      kind: 'execution',
      category: 'gate_failure_pattern',
      feature: 'feat-b',
      stage: 3,
      agent: null,
      summary: 'Gate 1 failed again',
      source: { type: 'events' },
      evidence: [{ type: 'event', ref: '7' }],
      tags: ['gate1'],
      confidence: 0.85,
      createdAt: '2026-04-18T00:00:00Z',
      lastSeenAt: '2026-04-18T00:00:00Z',
      expiresAt: null,
      decayScore: 11,
      influence: 'preference'
    }], { cwd: tmpDir });

    runtime.rebuildGlobalMemory({ cwd: tmpDir });
    const payload = runtime.readGlobalMemory({ cwd: tmpDir });
    assert.ok(payload.records.some((record) => record.scope === 'global' && record.category === 'gate_failure_pattern'));
  });
});
