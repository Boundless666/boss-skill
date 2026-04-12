'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const CHECK_STAGE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'check-stage.sh');

describe('check-stage wrapper contract', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-check-stage-wrapper-'));
    cwd = process.cwd();
    process.chdir(tmpDir);

    const runtime = require('../../runtime/cli/lib/pipeline-runtime.js');
    runtime.initPipeline('test-feat', { cwd: tmpDir });
    runtime.updateStage('test-feat', '1', 'running', { cwd: tmpDir });
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('forwards --json to the runtime CLI', () => {
    const output = execSync(`bash "${CHECK_STAGE_SCRIPT}" test-feat --json`, {
      cwd: tmpDir,
      encoding: 'utf8'
    }).trim();

    const payload = JSON.parse(output);
    assert.equal(payload.status, 'running');
    assert.equal(payload.stages['1'].status, 'running');
  });

  it('exposes runtime help text from the wrapper boundary', () => {
    const result = spawnSync('bash', [CHECK_STAGE_SCRIPT, '--help'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout + result.stderr, /用法: check-stage\.js <feature>/);
  });
});
