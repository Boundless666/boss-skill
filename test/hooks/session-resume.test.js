'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('session-resume hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/session-resume')];
    hook = require('../../scripts/hooks/session-resume');
  });

  afterEach(() => {
    if (tmpDir) { cleanupTempDir(tmpDir); tmpDir = null; }
  });

  it('returns empty string when cwd is empty', () => {
    const result = hook.run(JSON.stringify({ cwd: '' }));
    assert.equal(result, '');
  });

  it('returns empty string when no .boss dir', () => {
    const result = hook.run(JSON.stringify({ cwd: '/nonexistent' }));
    assert.equal(result, '');
  });

  it('detects unfinished pipelines', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);

    const result = hook.run(JSON.stringify({ cwd: tmpDir }));
    assert.ok(result.length > 0);
    const parsed = JSON.parse(result);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('test-feat'));
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('会话恢复'));
  });

  it('returns empty when all pipelines are completed', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'completed' });
    tmpDir = createTempBossDir('test-feat', execData);

    const result = hook.run(JSON.stringify({ cwd: tmpDir }));
    assert.equal(result, '');
  });

  it('loads previous session state if available', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);

    // Write session state
    const sessionState = { feature: 'test-feat', pipelineStatus: 'running' };
    fs.writeFileSync(
      path.join(tmpDir, '.boss', '.session-state.json'),
      JSON.stringify(sessionState),
      'utf8'
    );

    const result = hook.run(JSON.stringify({ cwd: tmpDir }));
    const parsed = JSON.parse(result);
    assert.ok(parsed.hookSpecificOutput.previousSessionState);
    assert.equal(parsed.hookSpecificOutput.previousSessionState.feature, 'test-feat');
  });
});
