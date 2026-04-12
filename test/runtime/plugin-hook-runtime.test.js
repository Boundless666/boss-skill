'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const runtime = require('../../runtime/cli/lib/pipeline-runtime');
const pluginRuntime = require('../../runtime/cli/lib/plugin-runtime');

describe('plugin hook execution', () => {
  let tmpDir;

  function writePlugin(dirName, manifest, scripts = {}) {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', dirName);
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const [fileName, content] of Object.entries(scripts)) {
      fs.writeFileSync(path.join(pluginDir, fileName), content, 'utf8');
    }
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
  }

  function readEvents() {
    return fs.readFileSync(path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  }

  function readExecution() {
    return JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'), 'utf8')
    );
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-plugin-hook-'));
    runtime.initPipeline('test-feat', { cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records PluginHookExecuted for matching plugins and materializes lifecycle state', () => {
    writePlugin('echo-reporter', {
      name: 'echo-reporter',
      version: '1.0.0',
      type: 'reporter',
      hooks: {
        report: 'report.sh',
        'post-gate': 'post-gate.sh'
      },
      stages: [3]
    }, {
      'report.sh': '#!/bin/bash\nexit 0\n',
      'post-gate.sh': '#!/bin/bash\necho \"$1:$2\" > .boss/test-feat/.meta/post-gate.log\nexit 0\n'
    });

    const result = pluginRuntime.runHook('post-gate', 'test-feat', { cwd: tmpDir, stage: 3 });
    assert.equal(Array.isArray(result.results), true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].plugin.name, 'echo-reporter');
    assert.equal(result.results[0].hook, 'post-gate');
    assert.equal(result.results[0].exitCode, 0);
    assert.equal(result.results[0].passed, true);

    const events = readEvents();
    const executed = events.filter((event) => event.type === 'PluginHookExecuted');
    assert.equal(executed.length, 1);
    assert.equal(executed[0].data.plugin.name, 'echo-reporter');
    assert.equal(executed[0].data.hook, 'post-gate');
    assert.equal(executed[0].data.stage, 3);

    const execution = readExecution();
    assert.equal(Array.isArray(execution.pluginLifecycle.executed), true);
    assert.equal(execution.pluginLifecycle.executed.length, 1);
    assert.equal(execution.pluginLifecycle.executed[0].plugin.name, 'echo-reporter');
    assert.equal(execution.pluginLifecycle.executed[0].hook, 'post-gate');
    assert.equal(execution.pluginLifecycle.executed[0].stage, 3);

    const marker = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'post-gate.log');
    assert.equal(fs.existsSync(marker), true);
    assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'test-feat:3');
  });

  it('records PluginHookFailed for non-zero hook exits and keeps runtime callable', () => {
    writePlugin('failing-reporter', {
      name: 'failing-reporter',
      version: '1.0.0',
      type: 'reporter',
      hooks: {
        report: 'report.sh',
        'post-gate': 'post-gate.sh'
      },
      stages: [3]
    }, {
      'report.sh': '#!/bin/bash\nexit 0\n',
      'post-gate.sh': '#!/bin/bash\nexit 7\n'
    });

    const result = pluginRuntime.runHook('post-gate', 'test-feat', { cwd: tmpDir, stage: 3 });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].plugin.name, 'failing-reporter');
    assert.equal(result.results[0].passed, false);
    assert.equal(result.results[0].exitCode, 7);

    const events = readEvents();
    const failed = events.filter((event) => event.type === 'PluginHookFailed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].data.plugin.name, 'failing-reporter');
    assert.equal(failed[0].data.hook, 'post-gate');
    assert.equal(failed[0].data.exitCode, 7);

    const execution = readExecution();
    assert.equal(Array.isArray(execution.pluginLifecycle.failed), true);
    assert.equal(execution.pluginLifecycle.failed.length, 1);
    assert.equal(execution.pluginLifecycle.failed[0].plugin.name, 'failing-reporter');
    assert.equal(execution.pluginLifecycle.failed[0].exitCode, 7);
  });

  it('run-plugin-hook CLI returns machine-readable JSON results', () => {
    writePlugin('cli-reporter', {
      name: 'cli-reporter',
      version: '1.0.0',
      type: 'reporter',
      hooks: {
        report: 'report.sh',
        'post-gate': 'post-gate.sh'
      },
      stages: [3]
    }, {
      'report.sh': '#!/bin/bash\nexit 0\n',
      'post-gate.sh': '#!/bin/bash\nexit 0\n'
    });

    const cliPath = path.join(__dirname, '..', '..', 'runtime', 'cli', 'run-plugin-hook.js');
    const result = spawnSync('node', [cliPath, 'post-gate', 'test-feat', '--stage', '3'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hook, 'post-gate');
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.stage, 3);
    assert.equal(Array.isArray(payload.results), true);
    assert.equal(payload.results[0].plugin.name, 'cli-reporter');
  });
});
