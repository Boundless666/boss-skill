'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { emitProgress } = require('../../scripts/lib/progress-emitter');

describe('progress-emitter', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-progress-'));
    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits a progress event to progress.jsonl', () => {
    emitProgress(tmpDir, 'test-feat', {
      type: 'stage-start',
      data: { stage: 1 }
    });

    const progressFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'progress.jsonl');
    assert.ok(fs.existsSync(progressFile));

    const lines = fs.readFileSync(progressFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);

    const event = JSON.parse(lines[0]);
    assert.equal(event.type, 'stage-start');
    assert.equal(event.data.stage, 1);
    assert.ok(event.timestamp);
  });

  it('appends multiple events', () => {
    emitProgress(tmpDir, 'test-feat', { type: 'agent-start', data: { agent: 'boss-pm' } });
    emitProgress(tmpDir, 'test-feat', { type: 'agent-complete', data: { agent: 'boss-pm', status: 'completed' } });

    const progressFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'progress.jsonl');
    const lines = fs.readFileSync(progressFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).type, 'agent-start');
    assert.equal(JSON.parse(lines[1]).type, 'agent-complete');
  });

  it('creates meta dir if missing', () => {
    const newDir = path.join(tmpDir, 'new-project');
    fs.mkdirSync(newDir);
    // .boss/new-feat/.meta doesn't exist yet
    emitProgress(newDir, 'new-feat', { type: 'stage-start', data: {} });

    const progressFile = path.join(newDir, '.boss', 'new-feat', '.meta', 'progress.jsonl');
    assert.ok(fs.existsSync(progressFile));
  });

  it('handles empty data gracefully', () => {
    emitProgress(tmpDir, 'test-feat', { type: 'custom-event' });

    const progressFile = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'progress.jsonl');
    const event = JSON.parse(fs.readFileSync(progressFile, 'utf8').trim());
    assert.equal(event.type, 'custom-event');
    assert.deepEqual(event.data, {});
  });
});
