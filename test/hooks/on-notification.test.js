'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('on-notification hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/on-notification')];
    hook = require('../../scripts/hooks/on-notification');
  });

  afterEach(() => {
    if (tmpDir) { cleanupTempDir(tmpDir); tmpDir = null; }
  });

  it('returns empty string when message is empty', () => {
    const result = hook.run(JSON.stringify({ message: '', cwd: '/tmp' }));
    assert.equal(result, '');
  });

  it('returns empty string when no .boss dir', () => {
    const result = hook.run(JSON.stringify({
      message: 'test notification',
      cwd: '/nonexistent'
    }));
    assert.equal(result, '');
  });

  it('logs notification for running pipeline', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);

    hook.run(JSON.stringify({
      message: 'Build completed',
      notification_type: 'info',
      cwd: tmpDir
    }));

    const logFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'notifications.jsonl');
    assert.ok(fs.existsSync(logFile));
    const line = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(line);
    assert.equal(entry.message, 'Build completed');
    assert.equal(entry.type, 'info');
  });

  it('skips non-running pipelines', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'completed' });
    tmpDir = createTempBossDir('test-feat', execData);

    hook.run(JSON.stringify({
      message: 'test',
      cwd: tmpDir
    }));

    const logFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'notifications.jsonl');
    assert.ok(!fs.existsSync(logFile));
  });
});
