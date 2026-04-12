'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runtime = require('../../runtime/cli/lib/pipeline-runtime');

describe('recordArtifact', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-record-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
    runtime.initPipeline('test-feat', { cwd: tmpDir });
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends ArtifactRecorded and materializes the artifact list', () => {
    const execution = runtime.recordArtifact('test-feat', 'prd.md', 1, { cwd: tmpDir });
    assert.ok(execution.stages['1'].artifacts.includes('prd.md'));
    const eventsPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const events = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
    assert.equal(JSON.parse(events.at(-1)).type, 'ArtifactRecorded');
  });

  it('rejects non-integer stages', () => {
    assert.throws(() => {
      runtime.recordArtifact('test-feat', 'prd.md', 1.5, { cwd: tmpDir });
    }, /stage 必须是整数/);
  });

  it('rejects out-of-range stages', () => {
    assert.throws(() => {
      runtime.recordArtifact('test-feat', 'prd.md', 0, { cwd: tmpDir });
    }, /stage 必须是 1-4/);
  });
});
