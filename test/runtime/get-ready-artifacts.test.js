'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runtime = require('../../runtime/cli/lib/pipeline-runtime');

describe('getReadyArtifacts', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-ready-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns prd.md first for a freshly initialized pipeline', () => {
    runtime.initPipeline('test-feat', { cwd: tmpDir });
    const ready = runtime.getReadyArtifacts('test-feat', { cwd: tmpDir });
    assert.deepEqual(
      ready.map((item) => item.artifact),
      ['prd.md']
    );
  });

  it('returns ready artifacts in deterministic order', () => {
    runtime.initPipeline('test-feat', { cwd: tmpDir });
    runtime.recordArtifact('test-feat', 'prd.md', 1, { cwd: tmpDir });
    const ready = runtime.getReadyArtifacts('test-feat', { cwd: tmpDir });
    assert.deepEqual(
      ready.map((item) => item.artifact),
      ['architecture.md', 'ui-spec.md']
    );
  });

  it('rejects --dag without a value in the CLI wrapper', () => {
    const { execSync } = require('child_process');
    const cliPath = path.join(__dirname, '..', '..', 'runtime', 'cli', 'get-ready-artifacts.js');
    try {
      execSync(`node "${cliPath}" test-feat --ready --dag`, {
        cwd: tmpDir,
        encoding: 'utf8'
      });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : err.message;
      assert.match(stderr, /--dag 需要指定 path/);
      return;
    }
    assert.fail('expected command to fail');
  });
});
