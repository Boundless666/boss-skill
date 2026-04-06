'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('boss-utils', () => {
  let bossUtils;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/lib/boss-utils')];
    bossUtils = require('../../scripts/lib/boss-utils');
  });

  afterEach(() => {
    if (tmpDir) {
      cleanupTempDir(tmpDir);
      tmpDir = null;
    }
  });

  describe('STAGE_MAP', () => {
    it('maps prd.md to stage 1', () => {
      assert.equal(bossUtils.STAGE_MAP['prd.md'], 1);
    });

    it('maps architecture.md to stage 1', () => {
      assert.equal(bossUtils.STAGE_MAP['architecture.md'], 1);
    });

    it('maps tasks.md to stage 2', () => {
      assert.equal(bossUtils.STAGE_MAP['tasks.md'], 2);
    });

    it('maps qa-report.md to stage 3', () => {
      assert.equal(bossUtils.STAGE_MAP['qa-report.md'], 3);
    });

    it('maps deploy-report.md to stage 4', () => {
      assert.equal(bossUtils.STAGE_MAP['deploy-report.md'], 4);
    });

    it('returns undefined for unknown artifacts', () => {
      assert.equal(bossUtils.STAGE_MAP['unknown.md'], undefined);
    });
  });

  describe('readExecJson', () => {
    it('reads and parses execution.json', () => {
      const execData = createExecData({ feature: 'my-feature' });
      tmpDir = createTempBossDir('my-feature', execData);
      const result = bossUtils.readExecJson(tmpDir, 'my-feature');
      assert.equal(result.feature, 'my-feature');
      assert.equal(result.status, 'running');
    });

    it('returns null for missing file', () => {
      tmpDir = createTempBossDir('missing', null);
      const result = bossUtils.readExecJson(tmpDir, 'missing');
      assert.equal(result, null);
    });

    it('returns null for corrupt JSON', () => {
      tmpDir = createTempBossDir('corrupt', null);
      const metaDir = path.join(tmpDir, '.boss', 'corrupt', '.meta');
      fs.writeFileSync(path.join(metaDir, 'execution.json'), 'not-json', 'utf8');
      const result = bossUtils.readExecJson(tmpDir, 'corrupt');
      assert.equal(result, null);
    });
  });

  describe('findActiveFeature', () => {
    it('finds running feature', () => {
      const execData = createExecData({ feature: 'active-feat', status: 'running' });
      tmpDir = createTempBossDir('active-feat', execData);
      const result = bossUtils.findActiveFeature(tmpDir);
      assert.ok(result);
      assert.equal(result.feature, 'active-feat');
      assert.equal(result.status, 'running');
    });

    it('finds initialized feature', () => {
      const execData = createExecData({ feature: 'init-feat', status: 'initialized' });
      tmpDir = createTempBossDir('init-feat', execData);
      const result = bossUtils.findActiveFeature(tmpDir);
      assert.ok(result);
      assert.equal(result.feature, 'init-feat');
    });

    it('returns null when no .boss dir', () => {
      tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'boss-test-'));
      const result = bossUtils.findActiveFeature(tmpDir);
      assert.equal(result, null);
    });

    it('skips completed features', () => {
      const execData = createExecData({ feature: 'done-feat', status: 'completed' });
      tmpDir = createTempBossDir('done-feat', execData);
      const result = bossUtils.findActiveFeature(tmpDir);
      assert.equal(result, null);
    });
  });

  describe('writeJson', () => {
    it('writes JSON atomically', () => {
      tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'boss-test-'));
      const filePath = path.join(tmpDir, 'test.json');
      const data = { hello: 'world' };
      bossUtils.writeJson(filePath, data);

      const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.deepEqual(written, data);
    });

    it('creates parent directories if needed', () => {
      tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'boss-test-'));
      const filePath = path.join(tmpDir, 'a', 'b', 'test.json');
      bossUtils.writeJson(filePath, { nested: true });

      assert.ok(fs.existsSync(filePath));
    });
  });
});
