'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('session-end hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/session-end')];
    hook = require('../../scripts/hooks/session-end');
  });

  afterEach(() => {
    if (tmpDir) { cleanupTempDir(tmpDir); tmpDir = null; }
  });

  it('returns empty string when no .boss dir', () => {
    const result = hook.run(JSON.stringify({ cwd: '/nonexistent' }));
    assert.equal(result, '');
  });

  it('saves session state for running pipeline', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);

    // Ensure SKILL_DIR points nowhere so report script is not found
    const origSkill = process.env.SKILL_DIR;
    process.env.SKILL_DIR = '/nonexistent';
    try {
      hook.run(JSON.stringify({ cwd: tmpDir }));
    } finally {
      if (origSkill !== undefined) process.env.SKILL_DIR = origSkill;
      else delete process.env.SKILL_DIR;
    }

    const sessionStatePath = path.join(tmpDir, '.boss', '.session-state.json');
    assert.ok(fs.existsSync(sessionStatePath));
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    assert.equal(state.feature, 'test-feat');
    assert.equal(state.pipelineStatus, 'running');
  });

  it('skips features with unknown/initialized status', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'initialized' });
    tmpDir = createTempBossDir('test-feat', execData);

    const origSkill = process.env.SKILL_DIR;
    process.env.SKILL_DIR = '/nonexistent';
    try {
      hook.run(JSON.stringify({ cwd: tmpDir }));
    } finally {
      if (origSkill !== undefined) process.env.SKILL_DIR = origSkill;
      else delete process.env.SKILL_DIR;
    }

    const sessionStatePath = path.join(tmpDir, '.boss', '.session-state.json');
    assert.ok(!fs.existsSync(sessionStatePath));
  });
});
