'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const REPLAY_EVENTS_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'replay-events.sh');

describe('replay-events wrapper contract', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-replay-wrapper-'));
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

  it('forwards --compact output to the runtime CLI', () => {
    const output = execSync(`bash "${REPLAY_EVENTS_SCRIPT}" test-feat --compact`, {
      cwd: tmpDir,
      encoding: 'utf8'
    }).trim();

    assert.match(output, /StageStarted/);
  });

  it('exposes runtime help text from the wrapper boundary', () => {
    const result = spawnSync('bash', [REPLAY_EVENTS_SCRIPT, '--help'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout + result.stderr, /用法: replay-events\.js <feature>/);
  });
});
