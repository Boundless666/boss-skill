'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('subagent-stop hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/subagent-stop')];
    hook = require('../../scripts/hooks/subagent-stop');
  });

  afterEach(() => {
    if (tmpDir) { cleanupTempDir(tmpDir); tmpDir = null; }
  });

  it('writes log entry for active pipeline', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);

    hook.run(JSON.stringify({
      cwd: tmpDir,
      agent_type: 'code',
      agent_id: 'agent-123',
      last_assistant_message: 'Task completed successfully'
    }));

    const logFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'agent-log.jsonl');
    assert.ok(fs.existsSync(logFile));
    const line = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(line);
    assert.equal(entry.event, 'stop');
    assert.equal(entry.agentType, 'code');
    assert.equal(entry.agentId, 'agent-123');
  });

  it('creates log dir when no active pipeline', () => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'boss-test-'));

    hook.run(JSON.stringify({
      cwd: tmpDir,
      agent_type: 'code',
      agent_id: 'agent-456',
      last_assistant_message: 'Done'
    }));

    const logFile = path.join(tmpDir, '.boss', '.harness-logs', '.meta', 'agent-log.jsonl');
    assert.ok(fs.existsSync(logFile));
  });

  it('prefers structured boss status blocks over regex fallback', () => {
    const execData = createExecData({
      feature: 'test-feat',
      status: 'running',
      stages: {
        '1': { name: 'Planning', status: 'completed', artifacts: [] },
        '2': { name: 'Review', status: 'running', artifacts: [] },
        '3': { name: 'Development', status: 'pending', artifacts: [] },
        '4': { name: 'Deployment', status: 'pending', artifacts: [] }
      }
    });
    tmpDir = createTempBossDir('test-feat', execData);

    hook.run(JSON.stringify({
      cwd: tmpDir,
      agent_type: 'boss-tech-lead',
      agent_id: 'agent-789',
      last_assistant_message: [
        'DONE',
        '[BOSS_STATUS]',
        'status: BLOCKED',
        'reason: waiting-for-schema',
        '[/BOSS_STATUS]'
      ].join('\n')
    }));

    const execJson = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'), 'utf8')
    );
    assert.equal(execJson.stages['2'].agents['boss-tech-lead'].status, 'failed');
    assert.equal(execJson.stages['2'].agents['boss-tech-lead'].failureReason, 'waiting-for-schema');

    const logFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'agent-log.jsonl');
    const entry = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
    assert.equal(entry.status, 'BLOCKED');
    assert.equal(entry.reason, 'waiting-for-schema');
  });
});
