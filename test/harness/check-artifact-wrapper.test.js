'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const CHECK_ARTIFACT_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'check-artifact.sh');

describe('check-artifact wrapper contract', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-check-artifact-wrapper-'));
    cwd = process.cwd();
    process.chdir(tmpDir);

    const runtime = require('../../runtime/cli/lib/pipeline-runtime.js');
    runtime.initPipeline('test-feat', { cwd: tmpDir });
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('forwards --ready --json to the runtime CLI', () => {
    const output = execSync(`bash "${CHECK_ARTIFACT_SCRIPT}" test-feat --ready --json`, {
      cwd: tmpDir,
      encoding: 'utf8'
    }).trim();

    const payload = JSON.parse(output);
    assert.deepEqual(payload, ['prd.md']);
  });

  it('exposes help text from the wrapper boundary', () => {
    const result = spawnSync('bash', [CHECK_ARTIFACT_SCRIPT, '--help'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /用法: get-ready-artifacts\.js <feature> <artifact> \[options\]/);
  });
});
