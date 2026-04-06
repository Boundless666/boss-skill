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
});
