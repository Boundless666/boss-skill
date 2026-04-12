'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('pack/plugin runtime integration', () => {
  let tmpDir;

  function runtimeCli(name) {
    return path.join(REPO_ROOT, 'runtime', 'cli', `${name}.js`);
  }

  function runRuntimeCommand(name, args) {
    return spawnSync('node', [runtimeCli(name), ...args], {
      cwd: tmpDir,
      encoding: 'utf8'
    });
  }

  function expectSuccess(result, label) {
    assert.equal(
      result.status,
      0,
      `${label} should exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-pack-plugin-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"api-only-app"}\n', 'utf8');

    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'local-reporter');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'report.sh'), '#!/bin/bash\nexit 0\n', 'utf8');
    fs.writeFileSync(
      path.join(pluginDir, 'post-gate.sh'),
      '#!/bin/bash\necho \"$1:$2\" > .boss/test-feat/.meta/local-reporter.log\nexit 0\n',
      'utf8'
    );
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      name: 'local-reporter',
      version: '1.0.0',
      type: 'reporter',
      hooks: {
        report: 'report.sh',
        'post-gate': 'post-gate.sh'
      },
      stages: [3]
    }, null, 2), 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reconstructs pack and plugin hook state from events only', () => {
    expectSuccess(runRuntimeCommand('init-pipeline', ['test-feat']), 'init-pipeline');
    expectSuccess(runRuntimeCommand('register-plugins', ['--register', 'test-feat']), 'register-plugins');
    expectSuccess(runRuntimeCommand('run-plugin-hook', ['post-gate', 'test-feat', '--stage', '3']), 'run-plugin-hook');

    const executionPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    const execution = JSON.parse(fs.readFileSync(executionPath, 'utf8'));
    assert.equal(execution.parameters.pipelinePack, 'api-only');
    assert.ok(execution.plugins.some((plugin) => plugin.name === 'local-reporter'));
    assert.ok(execution.pluginLifecycle.discovered.some((plugin) => plugin.name === 'local-reporter'));
    assert.ok(execution.pluginLifecycle.activated.some((plugin) => plugin.name === 'local-reporter'));
    assert.equal(execution.pluginLifecycle.executed.length, 1);
    assert.equal(execution.pluginLifecycle.executed[0].plugin.name, 'local-reporter');
    assert.equal(execution.pluginLifecycle.executed[0].hook, 'post-gate');
    assert.equal(execution.pluginLifecycle.executed[0].stage, 3);

    const eventsPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const eventTypes = fs.readFileSync(eventsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).type);

    assert.ok(eventTypes.includes('PackApplied'));
    assert.ok(eventTypes.includes('PluginDiscovered'));
    assert.ok(eventTypes.includes('PluginActivated'));
    assert.ok(eventTypes.includes('PluginHookExecuted'));
  });
});
