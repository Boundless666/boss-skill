'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'boss-memory-store-'));
}

describe('memory store', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists feature memory records under .boss/<feature>/.meta', () => {
    const store = require('../../runtime/memory/store');
    store.saveFeatureMemory('test-feat', [{
      id: 'm1',
      scope: 'feature',
      kind: 'execution',
      category: 'gate_failure_pattern',
      summary: 'Gate 1 failed twice',
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

    const payload = JSON.parse(fs.readFileSync(path.join(tmpDir, '.boss', 'test-feat', '.meta', 'feature-memory.json'), 'utf8'));
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].category, 'gate_failure_pattern');
  });

  it('dedupes matching records and updates lastSeenAt and decayScore', () => {
    const store = require('../../runtime/memory/store');
    const merged = store.mergeRecords([
      {
        id: 'm1',
        scope: 'feature',
        kind: 'execution',
        category: 'retry_lesson',
        feature: 'test-feat',
        stage: 3,
        agent: 'boss-backend',
        summary: 'Backend retried',
        source: { type: 'events' },
        evidence: [{ type: 'event', ref: '3' }],
        tags: ['retry'],
        confidence: 0.6,
        createdAt: '2026-04-17T00:00:00Z',
        lastSeenAt: '2026-04-17T00:00:00Z',
        expiresAt: null,
        decayScore: 5,
        influence: 'preference'
      }
    ], [
      {
        id: 'm2',
        scope: 'feature',
        kind: 'execution',
        category: 'retry_lesson',
        feature: 'test-feat',
        stage: 3,
        agent: 'boss-backend',
        summary: 'Backend retried again',
        source: { type: 'events' },
        evidence: [{ type: 'event', ref: '4' }],
        tags: ['retry'],
        confidence: 0.8,
        createdAt: '2026-04-18T00:00:00Z',
        lastSeenAt: '2026-04-18T00:00:00Z',
        expiresAt: null,
        decayScore: 9,
        influence: 'preference'
      }
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].lastSeenAt, '2026-04-18T00:00:00Z');
    assert.equal(merged[0].decayScore, 9);
    assert.equal(merged[0].evidence.length, 2);
  });

  it('persists summary payload separately from raw records', () => {
    const store = require('../../runtime/memory/store');
    store.saveFeatureSummary('test-feat', {
      feature: 'test-feat',
      generatedAt: '2026-04-17T00:00:00Z',
      startupSummary: [{ category: 'historical_risk', scope: 'feature', summary: 'Stage 3 is unstable' }],
      agentSections: { 'boss-qa': [{ category: 'retry_lesson', summary: 'Check backend retry path' }] }
    }, { cwd: tmpDir });

    const payload = JSON.parse(fs.readFileSync(path.join(tmpDir, '.boss', 'test-feat', '.meta', 'memory-summary.json'), 'utf8'));
    assert.equal(payload.agentSections['boss-qa'][0].summary, 'Check backend retry path');
  });

  it('persists global memory records under .boss/.memory', () => {
    const store = require('../../runtime/memory/store');
    store.saveGlobalMemory([
      {
        id: 'g1',
        scope: 'global',
        kind: 'long_term',
        category: 'gate_failure_pattern',
        summary: 'Gate 1 fails across features',
        source: { type: 'aggregation' },
        evidence: [{ type: 'feature', ref: 'feat-a' }],
        tags: ['gate1'],
        confidence: 0.9,
        createdAt: '2026-04-18T00:00:00Z',
        lastSeenAt: '2026-04-18T00:00:00Z',
        expiresAt: null,
        decayScore: 11,
        influence: 'preference'
      }
    ], { cwd: tmpDir });

    const payload = JSON.parse(fs.readFileSync(path.join(tmpDir, '.boss', '.memory', 'global-memory.json'), 'utf8'));
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].scope, 'global');
  });
});
