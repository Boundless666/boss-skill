'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempBossDir, createExecData, cleanupTempDir } = require('../helpers/fixtures');

describe('post-tool-write hook', () => {
  let hook;
  let tmpDir;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/post-tool-write')];
    hook = require('../../scripts/hooks/post-tool-write');
  });

  afterEach(() => {
    if (tmpDir) { cleanupTempDir(tmpDir); tmpDir = null; }
  });

  it('returns empty string for non-.boss paths', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { file_path: '/some/other/file.ts' },
      cwd: '/tmp'
    }));
    assert.equal(result, '');
  });

  it('returns empty string for execution.json writes', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { file_path: '/proj/.boss/feat/.meta/execution.json' },
      cwd: '/proj'
    }));
    assert.equal(result, '');
  });

  it('records artifact to execution.json for known stage files', () => {
    const execData = createExecData({ feature: 'test-feat' });
    tmpDir = createTempBossDir('test-feat', execData);

    const result = hook.run(JSON.stringify({
      tool_input: { file_path: path.join(tmpDir, '.boss', 'test-feat', 'prd.md') },
      cwd: tmpDir
    }));

    assert.ok(result.length > 0);
    const parsed = JSON.parse(result);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('prd.md'));

    // Verify execution.json was updated
    const execPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    const updated = JSON.parse(fs.readFileSync(execPath, 'utf8'));
    assert.ok(updated.stages['1'].artifacts.includes('prd.md'));
  });

  it('skips unknown artifact names', () => {
    const execData = createExecData({ feature: 'test-feat' });
    tmpDir = createTempBossDir('test-feat', execData);

    const result = hook.run(JSON.stringify({
      tool_input: { file_path: path.join(tmpDir, '.boss', 'test-feat', 'random-file.txt') },
      cwd: tmpDir
    }));
    assert.equal(result, '');
  });

  it('does not duplicate existing artifacts', () => {
    const execData = createExecData({
      feature: 'test-feat',
      stages: {
        '1': { name: 'Planning', status: 'running', artifacts: ['prd.md'] },
        '2': { name: 'Review', status: 'pending', artifacts: [] },
        '3': { name: 'Development', status: 'pending', artifacts: [] },
        '4': { name: 'Deployment', status: 'pending', artifacts: [] }
      }
    });
    tmpDir = createTempBossDir('test-feat', execData);

    const result = hook.run(JSON.stringify({
      tool_input: { file_path: path.join(tmpDir, '.boss', 'test-feat', 'prd.md') },
      cwd: tmpDir
    }));
    assert.equal(result, '');
  });

  it('records an artifact event even when execution.json drifted ahead of events', () => {
    const execData = createExecData({
      feature: 'test-feat',
      stages: {
        '1': { name: 'Planning', status: 'running', artifacts: ['prd.md'] },
        '2': { name: 'Review', status: 'pending', artifacts: [] },
        '3': { name: 'Development', status: 'pending', artifacts: [] },
        '4': { name: 'Deployment', status: 'pending', artifacts: [] }
      }
    });
    tmpDir = createTempBossDir('test-feat', execData);

    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: {
        initialState: createExecData({
          feature: 'test-feat',
          stages: {
            '1': { name: 'Planning', status: 'running', artifacts: [] },
            '2': { name: 'Review', status: 'pending', artifacts: [] },
            '3': { name: 'Development', status: 'pending', artifacts: [] },
            '4': { name: 'Deployment', status: 'pending', artifacts: [] }
          }
        })
      }
    }) + '\n', 'utf8');

    const result = hook.run(JSON.stringify({
      tool_input: { file_path: path.join(tmpDir, '.boss', 'test-feat', 'prd.md') },
      cwd: tmpDir
    }));

    assert.ok(result.length > 0);

    const eventsPath = path.join(metaDir, 'events.jsonl');
    const events = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events.length, 2);
    assert.equal(events[1].type, 'ArtifactRecorded');
    assert.equal(events[1].data.artifact, 'prd.md');
  });
});
