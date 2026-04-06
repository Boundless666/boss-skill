'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('session-start hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/session-start')];
    hook = require('../../scripts/hooks/session-start');
  });

  afterEach(() => {
    if (tmpDir) {
      cleanupTempDir(tmpDir);
      tmpDir = null;
    }
  });

  it('returns empty string when cwd is empty', () => {
    const result = hook.run(JSON.stringify({ cwd: '' }));
    assert.equal(result, '');
  });

  it('returns empty string when no active pipeline and no plugins', () => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'boss-test-'));
    const origSkill = process.env.SKILL_DIR;
    const origClaude = process.env.CLAUDE_PROJECT_DIR;
    process.env.SKILL_DIR = tmpDir;
    delete process.env.CLAUDE_PROJECT_DIR;
    try {
      delete require.cache[require.resolve('../../scripts/hooks/session-start')];
      hook = require('../../scripts/hooks/session-start');
      const result = hook.run(JSON.stringify({ cwd: tmpDir }));
      assert.equal(result, '');
    } finally {
      if (origSkill !== undefined) process.env.SKILL_DIR = origSkill;
      else delete process.env.SKILL_DIR;
      if (origClaude !== undefined) process.env.CLAUDE_PROJECT_DIR = origClaude;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('detects active pipeline and returns context', () => {
    const execData = createExecData({ feature: 'test-feat', status: 'running' });
    tmpDir = createTempBossDir('test-feat', execData);
    const result = hook.run(JSON.stringify({ cwd: tmpDir }));
    assert.ok(result.length > 0);
    const parsed = JSON.parse(result);
    assert.ok(parsed.hookSpecificOutput);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('test-feat'));
  });

  it('counts plugins when plugin dir exists', () => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'boss-test-'));
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'test-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({ name: 'test', enabled: true }),
      'utf8'
    );

    const origEnv = process.env.SKILL_DIR;
    process.env.SKILL_DIR = tmpDir;
    try {
      const result = hook.run(JSON.stringify({ cwd: tmpDir }));
      if (result) {
        const parsed = JSON.parse(result);
        assert.ok(parsed.hookSpecificOutput.additionalContext.includes('plugin'));
      }
    } finally {
      if (origEnv !== undefined) {
        process.env.SKILL_DIR = origEnv;
      } else {
        delete process.env.SKILL_DIR;
      }
    }
  });
});
