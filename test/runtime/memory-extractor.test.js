'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('memory extractor', () => {
  it('extracts gate failure and retry memories from event and execution inputs', () => {
    const { extractFeatureMemories } = require('../../runtime/memory/extractor');
    const records = extractFeatureMemories({
      feature: 'test-feat',
      now: '2026-04-17T00:00:00Z',
      events: [
        {
          id: 2,
          type: 'GateEvaluated',
          timestamp: '2026-04-17T00:00:00Z',
          data: { gate: 'gate1', passed: false, stage: 3, checks: ['coverage < 70'] }
        },
        {
          id: 3,
          type: 'AgentFailed',
          timestamp: '2026-04-17T00:01:00Z',
          data: { agent: 'boss-backend', stage: 3, reason: 'timeout' }
        }
      ],
      execution: {
        parameters: { roles: 'full' },
        stages: {
          '3': {
            retryCount: 2,
            agents: {
              'boss-backend': { status: 'failed', failureReason: 'timeout' }
            }
          }
        }
      }
    });

    assert.ok(records.some((record) => record.category === 'gate_failure_pattern'));
    assert.ok(records.some((record) => record.category === 'agent_failure_pattern'));
    assert.ok(records.some((record) => record.category === 'retry_lesson'));
  });

  it('extracts stable decision memory from successful parameter combinations', () => {
    const { extractFeatureMemories } = require('../../runtime/memory/extractor');
    const records = extractFeatureMemories({
      feature: 'test-feat',
      now: '2026-04-17T00:00:00Z',
      events: [
        {
          id: 4,
          type: 'StageCompleted',
          timestamp: '2026-04-17T00:03:00Z',
          data: { stage: 2 }
        }
      ],
      execution: {
        parameters: { roles: 'core', skipUI: true, pipelinePack: 'api-only' },
        stages: {
          '2': { retryCount: 0, status: 'completed', agents: {} }
        }
      }
    });

    const stable = records.find((record) => record.category === 'stable_decision');
    assert.equal(stable.scope, 'feature');
    assert.match(stable.summary, /roles=core/);
  });
});
