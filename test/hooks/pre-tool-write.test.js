'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('pre-tool-write hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/pre-tool-write')];
    hook = require('../../scripts/hooks/pre-tool-write');
  });

  afterEach(() => {
    if (tmpDir) {
      cleanupTempDir(tmpDir);
      tmpDir = null;
    }
  });

  it('returns empty string for non-.boss paths', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { file_path: '/some/other/file.js' },
      cwd: '/tmp'
    }));
    assert.equal(result, '');
  });

  it('denies direct edits to execution.json', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { file_path: '.boss/feat/.meta/execution.json' },
      cwd: '/tmp'
    }));
    const parsed = JSON.parse(result);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('allows writes when stage is running', () => {
    const execData = createExecData({
      feature: 'feat',
      stages: {
        '1': { name: 'Planning', status: 'running', artifacts: [] },
        '2': { name: 'Review', status: 'pending', artifacts: [] },
        '3': { name: 'Development', status: 'pending', artifacts: [] },
        '4': { name: 'Deployment', status: 'pending', artifacts: [] }
      }
    });
    tmpDir = createTempBossDir('feat', execData);
    const result = hook.run(JSON.stringify({
      tool_input: { file_path: tmpDir + '/.boss/feat/prd.md' },
      cwd: tmpDir
    }));
    assert.equal(result, '');
  });

  it('asks when writing to non-running stage', () => {
    const execData = createExecData({
      feature: 'feat',
      stages: {
        '1': { name: 'Planning', status: 'completed', artifacts: [] },
        '2': { name: 'Review', status: 'pending', artifacts: [] },
        '3': { name: 'Development', status: 'pending', artifacts: [] },
        '4': { name: 'Deployment', status: 'pending', artifacts: [] }
      }
    });
    tmpDir = createTempBossDir('feat', execData);
    const result = hook.run(JSON.stringify({
      tool_input: { file_path: tmpDir + '/.boss/feat/prd.md' },
      cwd: tmpDir
    }));
    const parsed = JSON.parse(result);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
  });
});
