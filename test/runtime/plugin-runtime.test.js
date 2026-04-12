'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const pluginRuntime = require('../../runtime/cli/lib/plugin-runtime');

describe('plugin runtime registration', () => {
  let tmpDir;

  function writePlugin(dirName, manifest, scripts = {}) {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', dirName);
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const [fileName, content] of Object.entries(scripts)) {
      fs.writeFileSync(path.join(pluginDir, fileName), content, 'utf8');
    }
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return pluginDir;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-plugin-runtime-'));
    writePlugin('alpha', {
      name: 'alpha',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' },
      dependencies: ['beta'],
      enabled: true
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });
    writePlugin('beta', {
      name: 'beta',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' },
      enabled: true
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers enabled plugins, validates manifests, and honors dependency order', () => {
    const result = pluginRuntime.discoverPlugins({ cwd: tmpDir });
    const names = result.plugins.map((plugin) => plugin.name);
    assert.deepEqual(names, ['beta', 'alpha']);
  });

  it('excludes disabled plugins from discovery', () => {
    writePlugin('disabled-gate', {
      name: 'disabled-gate',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' },
      enabled: false
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });

    const result = pluginRuntime.discoverPlugins({ cwd: tmpDir });
    assert.equal(result.plugins.some((plugin) => plugin.name === 'disabled-gate'), false);
  });

  it('fails validation when required fields are missing', () => {
    writePlugin('invalid-missing-name', {
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' }
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });

    assert.throws(() => {
      pluginRuntime.discoverPlugins({ cwd: tmpDir });
    }, /缺少或无效的 name/);
  });

  it('fails validation for gate plugins without hooks.gate', () => {
    writePlugin('invalid-gate-hook', {
      name: 'invalid-gate-hook',
      version: '1.0.0',
      type: 'gate',
      hooks: {}
    });

    assert.throws(() => {
      pluginRuntime.discoverPlugins({ cwd: tmpDir });
    }, /type=gate 时必须定义 hooks\.gate/);
  });

  it('fails validation when a hook file does not exist', () => {
    writePlugin('invalid-hook-file', {
      name: 'invalid-hook-file',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'missing.sh' }
    });

    assert.throws(() => {
      pluginRuntime.discoverPlugins({ cwd: tmpDir });
    }, /hooks\.gate 指向不存在文件/);
  });

  it('fails dependency validation when a dependency is missing', () => {
    writePlugin('broken-dependency', {
      name: 'broken-dependency',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' },
      dependencies: ['not-found']
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });

    assert.throws(() => {
      pluginRuntime.discoverPlugins({ cwd: tmpDir });
    }, /依赖不存在: not-found/);
  });

  it('orders independent plugins deterministically', () => {
    const pluginsRoot = path.join(tmpDir, 'harness', 'plugins');
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
    fs.mkdirSync(pluginsRoot, { recursive: true });

    const names = ['zeta', 'delta', 'epsilon'];
    for (const name of names) {
      const pluginDir = path.join(pluginsRoot, name);
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'gate.sh'), '#!/bin/bash\nexit 0\n', 'utf8');
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name,
        version: '1.0.0',
        type: 'gate',
        hooks: { gate: 'gate.sh' }
      }, null, 2), 'utf8');
    }

    const result = pluginRuntime.discoverPlugins({ cwd: tmpDir });
    assert.deepEqual(result.plugins.map((plugin) => plugin.name), ['delta', 'epsilon', 'zeta']);
  });

  it('fails validation when duplicate plugin names are declared', () => {
    writePlugin('dup-a', {
      name: 'dup',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' }
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });
    writePlugin('dup-b', {
      name: 'dup',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' }
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });

    assert.throws(() => {
      pluginRuntime.discoverPlugins({ cwd: tmpDir });
    }, /重复插件名: dup/);
  });

  it('registers plugins through runtime lifecycle events and materializes state', () => {
    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const initialState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'initialized',
      parameters: {},
      stages: {},
      qualityGates: {},
      metrics: { totalDuration: null, stageTimings: {}, gatePassRate: null, retryTotal: 0 },
      plugins: [],
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };

    fs.writeFileSync(path.join(metaDir, 'execution.json'), JSON.stringify(initialState, null, 2), 'utf8');
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), `${JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: { initialState }
    })}\n`, 'utf8');

    const registered = pluginRuntime.registerPlugins('test-feat', { cwd: tmpDir });
    assert.deepEqual(registered.plugins.map((plugin) => plugin.name), ['beta', 'alpha']);

    const events = fs.readFileSync(path.join(metaDir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    assert.ok(events.some((event) => event.type === 'PluginDiscovered'));
    assert.ok(events.some((event) => event.type === 'PluginActivated'));
    assert.ok(events.some((event) => event.type === 'PluginsRegistered'));

    const execution = JSON.parse(fs.readFileSync(path.join(metaDir, 'execution.json'), 'utf8'));
    assert.deepEqual(execution.plugins.map((plugin) => plugin.name), ['beta', 'alpha']);
    assert.deepEqual(execution.pluginLifecycle.discovered.map((plugin) => plugin.name), ['beta', 'alpha']);
    assert.deepEqual(execution.pluginLifecycle.activated.map((plugin) => plugin.name), ['beta', 'alpha']);
  });

  it('preserves plugin union across sequential filtered registration', () => {
    writePlugin('echo-reporter', {
      name: 'echo-reporter',
      version: '1.0.0',
      type: 'reporter',
      hooks: { report: 'report.sh' },
      enabled: true
    }, { 'report.sh': '#!/bin/bash\nexit 0\n' });

    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });
    const initialState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'initialized',
      parameters: {},
      stages: {},
      qualityGates: {},
      metrics: { totalDuration: null, stageTimings: {}, gatePassRate: null, retryTotal: 0 },
      plugins: [],
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };
    fs.writeFileSync(path.join(metaDir, 'execution.json'), JSON.stringify(initialState, null, 2), 'utf8');
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), `${JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: { initialState }
    })}\n`, 'utf8');

    pluginRuntime.registerPlugins('test-feat', { cwd: tmpDir, type: 'gate' });
    const secondPass = pluginRuntime.registerPlugins('test-feat', { cwd: tmpDir, type: 'reporter' });

    assert.deepEqual(secondPass.plugins.map((plugin) => plugin.name), ['beta', 'alpha', 'echo-reporter']);
    assert.deepEqual(secondPass.execution.plugins.map((plugin) => plugin.name), ['beta', 'alpha', 'echo-reporter']);
  });

  it('register-plugins CLI reports event registration instead of a direct execution write', () => {
    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });
    const initialState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'initialized',
      parameters: {},
      stages: {},
      qualityGates: {},
      metrics: { totalDuration: null, stageTimings: {}, gatePassRate: null, retryTotal: 0 },
      plugins: [],
      pluginLifecycle: { discovered: [], activated: [] },
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };
    fs.writeFileSync(path.join(metaDir, 'execution.json'), JSON.stringify(initialState, null, 2), 'utf8');
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), `${JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: { initialState }
    })}\n`, 'utf8');

    const cliPath = path.join(__dirname, '..', '..', 'runtime', 'cli', 'register-plugins.js');
    const result = spawnSync('node', [cliPath, '--register', 'test-feat'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /事件/);
    assert.match(result.stdout, /物化/);
    assert.doesNotMatch(result.stdout, /注册 .* 到 .*execution\.json/);
  });
});
