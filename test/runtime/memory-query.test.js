'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('memory query and summarizer', () => {
  it('returns startup summary ordered by decayScore and confidence', () => {
    const { buildStartupSummary } = require('../../runtime/memory/summarizer');
    const summary = buildStartupSummary([
      { category: 'successful_pattern', scope: 'global', summary: 'Global success', decayScore: 5, confidence: 0.5 },
      { category: 'gate_failure_pattern', scope: 'feature', summary: 'Feature gate failure', decayScore: 10, confidence: 0.9 }
    ]);

    assert.deepEqual(summary.map((item) => item.summary), ['Feature gate failure', 'Global success']);
  });

  it('filters agent memory records by stage and agent relevance', () => {
    const { queryAgentMemories } = require('../../runtime/memory/query');
    const records = queryAgentMemories([
      { category: 'historical_risk', stage: 3, agent: null, tags: ['gate1'], summary: 'Stage 3 risk', decayScore: 9, confidence: 0.8 },
      { category: 'agent_failure_pattern', stage: 3, agent: 'boss-backend', tags: ['boss-backend'], summary: 'Backend failed', decayScore: 8, confidence: 0.9 },
      { category: 'stable_decision', stage: 2, agent: 'boss-tech-lead', tags: ['boss-tech-lead'], summary: 'Review stays stable', decayScore: 7, confidence: 0.7 }
    ], {
      agent: 'boss-backend',
      stage: 3,
      limit: 2
    });

    assert.deepEqual(records.map((item) => item.summary), ['Backend failed', 'Stage 3 risk']);
  });
});
