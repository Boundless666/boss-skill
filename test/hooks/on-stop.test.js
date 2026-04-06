'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('on-stop hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/on-stop')];
    hook = require('../../scripts/hooks/on-stop');
  });

  afterEach(() => {
    if (tmpDir) {
      cleanupTempDir(tmpDir);
      tmpDir = null;
    }
  });

  it('returns empty when stop_hook_active is true', () => {
    const result = hook.run(JSON.stringify({ stop_hook_active: true, cwd: '/tmp' }));
    assert.equal(result, '');
  });

  it('returns empty when no active pipeline', () => {
    tmpDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'boss-test-'));
    const result = hook.run(JSON.stringify({ cwd: tmpDir }));
    assert.equal(result, '');
  });

  it('blocks when stages are running', () => {
    const execData = createExecData({
      feature: 'blocking-feat',
      status: 'running',
      stages: {
        '1': { name: 'Planning', status: 'completed' },
        '2': { name: 'Review', status: 'running' },
        '3': { name: 'Development', status: 'pending' },
        '4': { name: 'Deployment', status: 'pending' }
      }
    });
    tmpDir = createTempBossDir('blocking-feat', execData);
    const result = hook.run(JSON.stringify({ cwd: tmpDir }));
    const parsed = JSON.parse(result);
    assert.equal(parsed.decision, 'block');
    assert.ok(parsed.reason.includes('blocking-feat'));
  });

  it('allows stop when no stages are running', () => {
    const execData = createExecData({
      feature: 'done-feat',
      status: 'running',
      stages: {
        '1': { name: 'Planning', status: 'completed' },
        '2': { name: 'Review', status: 'completed' },
        '3': { name: 'Development', status: 'pending' },
        '4': { name: 'Deployment', status: 'pending' }
      }
    });
    tmpDir = createTempBossDir('done-feat', execData);
    const result = hook.run(JSON.stringify({ cwd: tmpDir }));
    assert.equal(result, '');
  });
});
