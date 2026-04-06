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
  });
});
